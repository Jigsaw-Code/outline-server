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

touch /tmp/config.json
source $ROOT_DIR/src/shadowbox/scripts/make_certificate.sh

# TODO: mount a folder rather than individual files.
declare -a docker_bindings=(
  -v /tmp/config.json:/root/shadowbox/shadowbox_config.json
  -v /tmp/stats.json:/root/shadowbox/shadowbox_stats.json
  -v ${SB_CERTIFICATE_FILE}:${SB_CERTIFICATE_FILE}
  -v ${SB_PRIVATE_KEY_FILE}:${SB_PRIVATE_KEY_FILE}
  -e "LOG_LEVEL=${LOG_LEVEL:-debug}"
  -e SB_API_PREFIX=TestApiPrefix
  -e SB_CERTIFICATE_FILE
  -e SB_PRIVATE_KEY_FILE
)
export DOCKER_CONTENT_TRUST=${DOCKER_CONTENT_TRUST:-1}
docker run --rm -it --network=host --name shadowbox "${docker_bindings[@]}" outline/shadowbox
