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

do_action shadowbox/docker/build

readonly RUN_ID="${RUN_ID:-$(date +%Y-%m-%d-%H%M%S)}"
readonly RUN_DIR="/tmp/outline/$RUN_ID"
echo "Using directory $RUN_DIR"

readonly HOST_STATE_DIR="$RUN_DIR/persisted-state"
readonly CONTAINER_STATE_DIR=/root/shadowbox/persisted-state
readonly STATE_CONFIG=$HOST_STATE_DIR/shadowbox_server_config.json

[[ -d "${HOST_STATE_DIR}" ]] || mkdir -p $HOST_STATE_DIR
[[ -e $STATE_CONFIG ]] || echo '{"hostname":"127.0.0.1"}' > $STATE_CONFIG
source $ROOT_DIR/src/shadowbox/scripts/make_test_certificate.sh "${RUN_DIR}"

# TODO: mount a folder rather than individual files.
declare -a docker_bindings=(
  -v "$HOST_STATE_DIR":${CONTAINER_STATE_DIR}
  -e "SB_STATE_DIR=${CONTAINER_STATE_DIR}"
  -v ${SB_CERTIFICATE_FILE}:${SB_CERTIFICATE_FILE}
  -v ${SB_PRIVATE_KEY_FILE}:${SB_PRIVATE_KEY_FILE}
  -e "LOG_LEVEL=${LOG_LEVEL:-debug}"
  -e SB_API_PREFIX=TestApiPrefix
  -e SB_CERTIFICATE_FILE=${SB_CERTIFICATE_FILE}
  -e SB_PRIVATE_KEY_FILE=${SB_PRIVATE_KEY_FILE}
  -e SB_METRICS_URL="${SB_METRICS_URL:-https://dev.metrics.getoutline.org}"
)

readonly IMAGE="${SB_IMAGE:-outline/shadowbox}"
echo "Running image ${IMAGE}"

docker run --rm -it --network=host --name shadowbox "${docker_bindings[@]}" ${IMAGE}
