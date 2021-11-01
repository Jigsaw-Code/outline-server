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

run_action shadowbox/server/build

RUN_ID="${RUN_ID:-$(date +%Y-%m-%d-%H%M%S)}"
readonly RUN_DIR="/tmp/outline/${RUN_ID}"
echo "Using directory ${RUN_DIR}"

export LOG_LEVEL="${LOG_LEVEL:-debug}"
SB_PUBLIC_IP="${SB_PUBLIC_IP:-$(curl https://ipinfo.io/ip)}"
export SB_PUBLIC_IP
# WARNING: The SB_API_PREFIX should be kept secret!
export SB_API_PREFIX='TestApiPrefix'
export SB_METRICS_URL='https://dev.metrics.getoutline.org'
export SB_STATE_DIR="${RUN_DIR}/persisted-state"
readonly STATE_CONFIG="${SB_STATE_DIR}/shadowbox_server_config.json"

[[ -d "${SB_STATE_DIR}" ]] || mkdir -p "${SB_STATE_DIR}"
[[ -e "${STATE_CONFIG}" ]] || echo '{"hostname":"127.0.0.1"}' > "${STATE_CONFIG}"

# shellcheck source=../scripts/make_test_certificate.sh
source "${ROOT_DIR}/src/shadowbox/scripts/make_test_certificate.sh" "${RUN_DIR}"

node "${BUILD_DIR}/shadowbox/app/main.js"
