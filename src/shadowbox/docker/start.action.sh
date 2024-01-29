#!/bin/bash -eu
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

run_action shadowbox/docker/build

RUN_ID="${RUN_ID:-$(date +%Y-%m-%d-%H%M%S)}"
readonly RUN_ID
readonly RUN_DIR="/tmp/outline/${RUN_ID}"
echo "Using directory ${RUN_DIR}"

readonly HOST_STATE_DIR="${RUN_DIR}/persisted-state"
readonly CONTAINER_STATE_DIR='/root/shadowbox/persisted-state'
readonly STATE_CONFIG="${HOST_STATE_DIR}/shadowbox_server_config.json"

declare -ir ACCESS_KEY_PORT=${ACCESS_KEY_PORT:-9999}
declare -ir SB_API_PORT=${SB_API_PORT:-8081}

[[ -d "${HOST_STATE_DIR}" ]] || mkdir -p "${HOST_STATE_DIR}"
[[ -e "${STATE_CONFIG}" ]] || echo "{\"hostname\":\"127.0.0.1\", \"portForNewAccessKeys\": ${ACCESS_KEY_PORT}}" > "${STATE_CONFIG}"
# shellcheck source=../scripts/make_test_certificate.sh
source "${ROOT_DIR}/src/shadowbox/scripts/make_test_certificate.sh" "${RUN_DIR}"

# TODO: mount a folder rather than individual files.
declare -ar docker_bindings=(
  -v "${HOST_STATE_DIR}:${CONTAINER_STATE_DIR}"
  -e "SB_STATE_DIR=${CONTAINER_STATE_DIR}"
  -v "${SB_CERTIFICATE_FILE}:${SB_CERTIFICATE_FILE}"
  -v "${SB_PRIVATE_KEY_FILE}:${SB_PRIVATE_KEY_FILE}"
  -e "LOG_LEVEL=${LOG_LEVEL:-debug}"
  -e "SB_API_PORT=${SB_API_PORT}"
  -e "SB_API_PREFIX=TestApiPrefix"
  -e "SB_CERTIFICATE_FILE=${SB_CERTIFICATE_FILE}"
  -e "SB_PRIVATE_KEY_FILE=${SB_PRIVATE_KEY_FILE}"
  -e "SB_METRICS_URL=${SB_METRICS_URL:-https://dev.metrics.getoutline.org}"
)

readonly IMAGE="${SB_IMAGE:-outline/shadowbox}"
echo "Running image ${IMAGE}"

declare -a NET_BINDINGS=("--network=host")
if [[ "$(uname)" == "Darwin" ]]; then
  # Docker does not support the --network=host option on macOS. Instead, publish the management API
  # and access key ports to the host.
  NET_BINDINGS=(-p "${SB_API_PORT}:${SB_API_PORT}" -p "${ACCESS_KEY_PORT}:${ACCESS_KEY_PORT}" -p "${ACCESS_KEY_PORT}:${ACCESS_KEY_PORT}/udp")
fi;

docker run --rm -it "${NET_BINDINGS[@]}" --name shadowbox "${docker_bindings[@]}" "${IMAGE}"
