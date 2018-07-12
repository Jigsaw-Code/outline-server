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

readonly OUT_DIR=${BUILD_DIR}/shadowbox
rm -rf ${OUT_DIR}

mkdir -p ${OUT_DIR}/js

# Compile Typescript
tsc -p src/shadowbox --outDir ${OUT_DIR}/js

# Assemble the node app
readonly APP_DIR=${OUT_DIR}/app
mkdir -p ${APP_DIR}
# Copy built code, without test files.
rsync --exclude='**/*.spec.js' --exclude='mocks' -r ${OUT_DIR}/js/* ${APP_DIR}/
# Copy static resources
cp -r ${ROOT_DIR}/src/shadowbox/package.json ${APP_DIR}
