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

readonly CSC_LINK=${CSC_LINK:-unset}

if [ "$CSC_LINK" == "unset" ]; then
  echo "must specify CSC_LINK"
  exit 1
fi

function usage () {
  echo "Usage:" 1>&2
  echo "$0 [-s stagingPercentage]" 1>&2
  echo "  -s: The staged rollout percentage for this release.  Must be in the interval (0, 100].  Defaults to 100" 1>&2
  echo "  -h: this help message" 1>&2
  echo 1>&2
  echo "Examples:" 1>&2
  echo "Releases the beta of version 1.2.3 to 10% of users listening on the beta channel" 1>&2
  echo '$ '"jq -r '.version' src/server_manager/package.json'" 1>&2
  echo "1.2.3-beta" 1>&2
  echo '$ '"$0 -s 10" 1>&2
  exit 1
}

STAGING_PERCENTAGE=100
while getopts s:? opt; do
  case $opt in
    s) STAGING_PERCENTAGE=$OPTARG ;;
    *) usage ;;
  esac
done

if ((STAGING_PERCENTAGE <= 0)) || ((STAGING_PERCENTAGE > 100)); then
  echo "Staging percentage must be greater than 0 and no more than 100" 1>&2
  exit 1
fi

yarn do server_manager/electron_app/build
yarn do server_manager/electron_app/write_production_environment

readonly BUILD_DIR=build/server_manager/electron_app/static

# Produces dmg and zip images. The latter is required for auto-update.
$ROOT_DIR/src/server_manager/node_modules/.bin/electron-builder \
  --projectDir="${BUILD_DIR}" \
  --config.asarUnpack=server_manager/web_app/images \
  --config.generateUpdatesFilesForAllChannels=true \
  --publish=never \
  --config.publish.provider=generic \
  --config.publish.url=https://raw.githubusercontent.com/Jigsaw-Code/outline-releases/master/manager/ \
  --mac default \
  --config.mac.icon=icons/mac/icon.icns \
  --config.artifactName='Outline-Manager.${ext}'

echo "stagingPercentage: $STAGING_PERCENTAGE" >> "${BUILD_DIR}"/dist/$(src/server_manager/scripts/manager_release_channel.sh)-mac.yml
