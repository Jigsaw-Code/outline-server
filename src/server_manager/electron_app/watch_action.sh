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

# Builds the Electron App in "watch mode", automatically re-compiling files and directories
# on change without a full rebuild.  Useful for rapid development.
# See https://www.typescriptlang.org/docs/handbook/compiler-options.html

readonly OUT_DIR=$BUILD_DIR/server_manager/electron_app
rm -rf $OUT_DIR

readonly NODE_MODULES_BIN_DIR=$ROOT_DIR/src/server_manager/node_modules/.bin

# Build the Web App.
do_action server_manager/web_app/build

# Compile the Electron app source.
# Since Node.js on Cygwin doesn't like absolute Unix-style paths,
# we'll use relative paths here.
tsc -p src/server_manager/electron_app/tsconfig.json --outDir build/server_manager/electron_app/js --watch --preserveWatchOutput
