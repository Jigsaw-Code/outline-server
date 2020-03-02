#!/bin/bash -eu
#
# Copyright 2020 The Outline Authors
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

SRC_DIR="src/metrics_server"
BUILD_DIR="build/metrics_server"

yarn do metrics_server/build

cp $SRC_DIR/config_dev.json $BUILD_DIR/config.json
cp $SRC_DIR/package.json $BUILD_DIR/

yarn node $BUILD_DIR/index.js
