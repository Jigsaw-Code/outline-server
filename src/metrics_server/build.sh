#!/bin/bash -eux
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

if (( $# <= 1 )); then
  echo "Invalid arguments, usage:"
  echo "build.sh <outdir> <config>"
  exit 1;
fi

readonly MODULE_DIR=$(dirname $0)
readonly OUT_DIR=$1
readonly CONFIG_FILE=$2

# Compile the server.
rm -rf ${OUT_DIR}
tsc -p ${MODULE_DIR}/tsconfig.json --outDir ${OUT_DIR}
cp -r ${MODULE_DIR}/package.json ${OUT_DIR}

# Copy config file.
cp -r ${CONFIG_FILE} ${OUT_DIR}/config.json
