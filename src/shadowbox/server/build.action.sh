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

readonly OUT_DIR="${BUILD_DIR}/shadowbox"
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

webpack --config=src/shadowbox/webpack.config.js ${BUILD_ENV:+--mode="${BUILD_ENV}"}

# Install third_party dependencies
readonly OS="$([[ "$(uname)" == "Darwin" ]] && echo "macos" || echo "linux")"
export ARCH=${ARCH:-x86_64}
readonly BIN_DIR="${OUT_DIR}/bin"
mkdir -p "${BIN_DIR}"
{
  cd "${ROOT_DIR}/third_party/prometheus"
  make "bin/${OS}-${ARCH}/prometheus"
  cp "bin/${OS}-${ARCH}/prometheus" "${BIN_DIR}/"
}
{
  cd "${ROOT_DIR}/third_party/outline-ss-server"
  make "bin/${OS}-${ARCH}/outline-ss-server"
  cp "bin/${OS}-${ARCH}/outline-ss-server" "${BIN_DIR}/"
}

# Copy shadowbox package.json
cp "${ROOT_DIR}/src/shadowbox/package.json" "${OUT_DIR}/"
