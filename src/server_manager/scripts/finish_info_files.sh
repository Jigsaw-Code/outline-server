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

PLATFORM="-$1"
if [[ "${PLATFORM}" == "-win" ]]; then
  PLATFORM=""
fi
readonly STAGING_PERCENTAGE="$2"
readonly BUILD_DIR='build/server_manager/electron_app/static'

INFO_FILE_CHANNEL=$(src/server_manager/scripts/get_manager_release_channel.sh)
echo "stagingPercentage: ${STAGING_PERCENTAGE}" >> "${BUILD_DIR}/dist/${INFO_FILE_CHANNEL}${PLATFORM}.yml"

# If we cut a staged mainline release, beta testers will take the update as well.
if [[ "${INFO_FILE_CHANNEL}" == "latest" ]]; then
  echo "stagingPercentage: ${STAGING_PERCENTAGE}" >> "${BUILD_DIR}/dist/beta${PLATFORM}.yml"
fi

# We don't support alpha releases
rm -f "${BUILD_DIR}/dist/alpha${PLATFORM}.yml"
