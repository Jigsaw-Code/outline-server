#!/bin/bash
#
# Copyright 2018 The Outline Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Shadowbox Integration Test
#
# This test verifies that a client can access a target in a different network via a shadowbox node.
#
# Architecture:
#
# +--------+     +-----------+     +--------+
# | Client | --> | Shadowbox | --> | Target |
# +--------+     +-----------+     +--------+
#
# Each node runs on a different Docker container.

export DOCKER_CONTENT_TRUST=${DOCKER_CONTENT_TRUST:-1}

readonly OUTPUT_DIR=$(mktemp -d)
# TODO(fortuna): Make it possible to run multiple tests in parallel by adding a
# run id to the container names.
readonly TARGET_CONTAINER=integrationtest_target_1
readonly SHADOWBOX_CONTAINER=integrationtest_shadowbox_1
readonly CLIENT_CONTAINER=integrationtest_client_1
readonly UTIL_CONTAINER=integrationtest_util_1
echo Test output at $OUTPUT_DIR
# Set DEBUG=1 to not kill the stack when the test is finished so you can query
# the containers.
declare -ir DEBUG=${DEBUG:-0}

# Waits for the input URL to return success.
function wait_for_resource() {
  declare -r URL=$1
  until curl --silent --insecure $URL > /dev/null; do sleep 1; done
}

# Takes the JSON from a /access-keys POST request and returns the appropriate
# ss-local arguments to connect to that user/instance.
function ss_arguments_for_user() {
  declare -r SS_INSTANCE_CIPHER=$(echo $1 | docker exec -i $UTIL_CONTAINER jq -r .method)
  declare -r SS_INSTANCE_PASSWORD=$(echo $1 | docker exec -i $UTIL_CONTAINER jq -r .password)
  declare -r SS_INSTANCE_PORT=$(echo $1 | docker exec -i $UTIL_CONTAINER jq .port)
  echo -cipher "$SS_INSTANCE_CIPHER" -password "$SS_INSTANCE_PASSWORD" -c "shadowbox:$SS_INSTANCE_PORT"
}

# Runs curl on the client container.
function client_curl() {
  docker exec $CLIENT_CONTAINER curl --silent --show-error "$@"
}

function fail() {
  echo FAILED: "$@"
  exit 1
}

function cleanup() {
  status=$?
  (($DEBUG != 0)) || docker-compose down
  return $status
}

# Start a subprocess for trap
(
  set -eu
  (($DEBUG != 0)) && set -x

  # Make the certificate
  source ../scripts/make_certificate.sh

  # Ensure proper shut down on exit if not in debug mode
  trap "cleanup" EXIT

  # Sets everything up
  export SB_API_PREFIX=TestApiPrefix
  docker-compose up --build -d

  # Wait for target to come up.
  wait_for_resource localhost:10080
  declare -r TARGET_IP=$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $TARGET_CONTAINER)

  # Verify that the client cannot access or even resolve the target
  # Exit code 28 for "Connection timed out".
  docker exec $CLIENT_CONTAINER curl --silent --connect-timeout 1 $TARGET_IP > /dev/null && \
    fail "Client should not have access to target IP" || (($? == 28))

  # Exit code 6 for "Could not resolve host".
  docker exec $CLIENT_CONTAINER curl --silent --connect-timeout 1 http://target > /dev/null && \
    fail "Client should not have access to target host" || (($? == 6))

  # Wait for shadowbox to come up.
  wait_for_resource https://localhost:20443/access-keys
  # Verify that the shadowbox can access the target
  docker exec $SHADOWBOX_CONTAINER wget --spider http://target

  # Create new shadowbox user.
  # TODO(bemasc): Verify that the server is using the right certificate
  declare -r NEW_USER_JSON=$(client_curl --insecure -X POST https://shadowbox/${SB_API_PREFIX}/access-keys)
  [[ ${NEW_USER_JSON} == '{"id":"0"'* ]] || fail "Fail to create user"
  declare -r SS_USER_ARGUMENTS=$(ss_arguments_for_user $NEW_USER_JSON)

  # Verify that we handle deletions well
  client_curl --insecure -X POST https://shadowbox/${SB_API_PREFIX}/access-keys > /dev/null
  client_curl --insecure -X DELETE https://shadowbox/${SB_API_PREFIX}/access-keys/1 > /dev/null

  # Start Shadowsocks client and wait for it to be ready
  declare -r LOCAL_SOCKS_PORT=5555
  docker exec -d $CLIENT_CONTAINER \
    /go/bin/go-shadowsocks2 $SS_USER_ARGUMENTS -socks :$LOCAL_SOCKS_PORT -verbose \
    || fail "Could not start shadowsocks client"
  while ! docker exec $CLIENT_CONTAINER nc -z localhost $LOCAL_SOCKS_PORT; do
    sleep 0.1
  done

  # Verify we can retrieve the target by IP.
  client_curl -x socks5h://localhost:$LOCAL_SOCKS_PORT $TARGET_IP > $OUTPUT_DIR/actual.html
  diff $OUTPUT_DIR/actual.html target/index.html || fail "Target page by IP does not match"

  # Verify we can retrieve the target using the system nameservers.
  client_curl -x socks5h://localhost:$LOCAL_SOCKS_PORT http://target > $OUTPUT_DIR/actual.html
  diff $OUTPUT_DIR/actual.html target/index.html || fail "Target page by hostname does not match"

  # Verify we can't access the page anymore after the key is deleted
  client_curl --insecure -X DELETE https://shadowbox/${SB_API_PREFIX}/access-keys/0 > /dev/null
  # Exit code 56 is "Connection reset by peer".
  client_curl -x socks5h://localhost:$LOCAL_SOCKS_PORT --connect-timeout 1 http://target &> /dev/null \
    && fail "Deleted access key is still active" || (($? == 56))

  # Verify no errors occurred
  docker logs $SHADOWBOX_CONTAINER &> $OUTPUT_DIR/logs.txt
  if cat $OUTPUT_DIR/logs.txt | grep --quiet -E "^E|level=error|ERROR:"; then
    fail "Found errors on container logs. See $OUTPUT_DIR/logs.txt"
  fi

  # TODO(fortuna): Test metrics.
  # TODO(fortuna): Verify UDP requests.
)
