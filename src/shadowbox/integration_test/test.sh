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
# This test verifies that a client can access a target website via a shadowbox node.
# Sets up a target in the LAN to validate that it cannot be accessed through shadowbox.
#
# Architecture:
#
# +--------+     +-----------+
# | Client | --> | Shadowbox | -->  Internet
# +--------+     +-----------+
#                      |           +--------+
#                      ----//----> | Target |
#                                  +--------+
#
# Each node runs on a different Docker container.

set -x

export DOCKER_CONTENT_TRUST=${DOCKER_CONTENT_TRUST:-1}

readonly OUTPUT_DIR=$(mktemp -d)
# TODO(fortuna): Make it possible to run multiple tests in parallel by adding a
# run id to the container names.
readonly TARGET_CONTAINER=integrationtest_target_1
readonly SHADOWBOX_CONTAINER=integrationtest_shadowbox_1
readonly CLIENT_CONTAINER=integrationtest_client_1
readonly UTIL_CONTAINER=integrationtest_util_1
readonly INTERNET_TARGET_URL="http://www.gstatic.com/generate_204"
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
  if (($DEBUG != 0)); then
    docker-compose --project-name=integrationtest down
    rm -r ${TMP_STATE_DIR}
  fi
  return $status
}

# Start a subprocess for trap
(
  set -eu
  (($DEBUG != 0)) && set -x

  # Make the certificate
  source ../scripts/make_test_certificate.sh /tmp

  # Ensure proper shut down on exit if not in debug mode
  trap "cleanup" EXIT

  # Sets everything up
  export SB_API_PREFIX=TestApiPrefix
  SB_API_URL=https://shadowbox/${SB_API_PREFIX}
  export TMP_STATE_DIR=$(mktemp -d)
  echo '{"hostname": "shadowbox"}' > ${TMP_STATE_DIR}/shadowbox_server_config.json
  docker-compose --project-name=integrationtest up --build -d

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
  declare -r NEW_USER_JSON=$(client_curl --insecure -X POST ${SB_API_URL}/access-keys)
  [[ ${NEW_USER_JSON} == '{"id":"0"'* ]] || fail "Fail to create user"
  declare -r SS_USER_ARGUMENTS=$(ss_arguments_for_user $NEW_USER_JSON)

  # Verify that we handle deletions well
  client_curl --insecure -X POST ${SB_API_URL}/access-keys > /dev/null
  client_curl --insecure -X DELETE ${SB_API_URL}/access-keys/1 > /dev/null

  # Start Shadowsocks client and wait for it to be ready
  declare -r LOCAL_SOCKS_PORT=5555
  docker exec -d $CLIENT_CONTAINER \
    /go/bin/go-shadowsocks2 $SS_USER_ARGUMENTS -socks :$LOCAL_SOCKS_PORT -verbose \
    || fail "Could not start shadowsocks client"
  while ! docker exec $CLIENT_CONTAINER nc -z localhost $LOCAL_SOCKS_PORT; do
    sleep 0.1
  done

  # Verify the server blocks requests to hosts on private addresses.
  # Exit code 52 is "Empty server response".
  client_curl -x socks5h://localhost:$LOCAL_SOCKS_PORT $TARGET_IP &> /dev/null \
    && fail "Target host in a private network accessible through shadowbox" || (($? == 52))

  # Verify we can retrieve the internet target URL.
  client_curl -x socks5h://localhost:$LOCAL_SOCKS_PORT $INTERNET_TARGET_URL \
    || fail "Could not fetch $INTERNET_TARGET_URL through shadowbox."

  # Verify we can't access the URL anymore after the key is deleted
  client_curl --insecure -X DELETE ${SB_API_URL}/access-keys/0 > /dev/null
  # Exit code 56 is "Connection reset by peer".
  client_curl -x socks5h://localhost:$LOCAL_SOCKS_PORT --connect-timeout 1 $INTERNET_TARGET_URL &> /dev/null \
    && fail "Deleted access key is still active" || (($? == 56))

  # Verify that we can change the port for new access keys
  client_curl --insecure -X PUT -H "Content-Type: application/json" -d '{"port": 12345}' ${SB_API_URL}/server/port-for-new-access-keys \
    || fail "Couldn't change the port for new access keys"

  ACCESS_KEY_JSON=$(client_curl --insecure -X POST ${SB_API_URL}/access-keys \
    || fail "Couldn't get a new access key after changing port")
  
  if [[ "${ACCESS_KEY_JSON}" != *'"port":12345'* ]]; then
    fail "Port for new access keys wasn't changed.  Newly created access key: ${ACCESS_KEY_JSON}"
  fi

  # Verify that we can change the hostname for new access keys
  NEW_HOSTNAME="newhostname"
  client_curl --insecure -X PUT -H 'Content-Type: application/json' -d '{"hostname": "'${NEW_HOSTNAME}'"}' ${SB_API_URL}/server/hostname-for-access-keys \
    || fail "Couldn't change hostname for new access keys"

  ACCESS_KEY_JSON=$(client_curl --insecure -X POST ${SB_API_URL}/access-keys \
    || fail "Couldn't get a new access key after changing hostname")
  
  if [[ "${ACCESS_KEY_JSON}" != *"@${NEW_HOSTNAME}:"* ]]; then
    fail "Hostname for new access keys wasn't changed.  Newly created access key: ${ACCESS_KEY_JSON}"
  fi
  
  # Verify no errors occurred.
  readonly SHADOWBOX_LOG=$OUTPUT_DIR/shadowbox-log.txt
  if docker logs $SHADOWBOX_CONTAINER 2>&1 | tee $SHADOWBOX_LOG | egrep -q "^E|level=error|ERROR:"; then
    cat $SHADOWBOX_LOG
    fail "Found errors in Shadowbox logs (see above, also saved to $SHADOWBOX_LOG)"
  fi

  # TODO(fortuna): Test metrics.
  # TODO(fortuna): Verify UDP requests.
)
