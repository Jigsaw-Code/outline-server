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
set -eux

PLATFORM=$1
STAGING_PERCENTAGE=100
BUILD_MODE=debug
for i in "$@"; do
  case ${i} in
  --buildMode=*)
    BUILD_MODE="${i#*=}"
    shift
    ;;
  --stagingPercentage=*)
    STAGING_PERCENTAGE="${i#*=}"
    shift
    ;;
  --* | -*)
    echo "Unknown option: ${i}"
    exit 1
    ;;
  *) ;;
  esac
done

readonly OUT_DIR="${BUILD_DIR}/server_manager/electron_app"
rm -rf "${OUT_DIR}"

# Build the Web App.
run_action server_manager/web_app/build

# Compile the Electron app source.
# Since Node.js on Cygwin doesn't like absolute Unix-style paths,
# we'll use relative paths here.
tsc -p src/server_manager/electron_app/tsconfig.json --outDir build/server_manager/electron_app/js

# Assemble everything together.
readonly STATIC_DIR="${OUT_DIR}/static"
mkdir -p "${STATIC_DIR}"
mkdir -p "${STATIC_DIR}/server_manager"
cp -r "${OUT_DIR}/js/"* "${STATIC_DIR}"
cp -r "${BUILD_DIR}/server_manager/web_app/static" "${STATIC_DIR}/server_manager/web_app/"

# Electron requires a package.json file for the app's name, etc.
# We also need to install NPMs at this location for require()
# in order for require() to work right in the renderer process, which
# is loaded via a custom protocol.
cp src/server_manager/package.json package-lock.json "${STATIC_DIR}"
cd "${STATIC_DIR}"
npm ci --prod --ignore-scripts

# Icons.
cd "${ROOT_DIR}"
electron-icon-maker --input=src/server_manager/images/launcher-icon.png --output=build/server_manager/electron_app/static

# TODO(daniellacosse): refactor these scripts into node so we can call the electron builder there directly
# shellcheck disable=SC2046
electron-builder $(node src/server_manager/scripts/get_electron_build_flags.mjs "${PLATFORM}" --buildMode "${BUILD_MODE}")

src/server_manager/scripts/finish_info_files.sh "${PLATFORM}" "${STAGING_PERCENTAGE}"
