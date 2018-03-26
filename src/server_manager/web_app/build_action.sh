#!/bin/bash
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

readonly OUT_DIR=$BUILD_DIR/server_manager/web_app
rm -rf $OUT_DIR

# Create do_install_script.ts, which has a variable with the content of do_install_server.sh.
mkdir -p $OUT_DIR/ts/server_manager/web_app
mkdir -p $OUT_DIR/sh/server_manager/web_app

pushd $ROOT_DIR/src/server_manager/install_scripts
tar --create --gzip -f $OUT_DIR/sh/server_manager/web_app/scripts.tgz *.sh
popd

# Node.js on Cygwin doesn't like absolute Unix-style paths.
# So, we'll use relative paths for a few steps such as Browserify.

pushd $ROOT_DIR
node src/server_manager/install_scripts/build_install_script_ts.node.js \
    build/server_manager/web_app/sh/server_manager/web_app/scripts.tgz > $ROOT_DIR/src/server_manager/install_scripts/do_install_script.ts
popd

# Compile Typescript
tsc

# Browserify node_modules/ (just a couple of key NPMs) and app.
pushd $OUT_DIR
mkdir -p browserified/server_manager/web_app
browserify --require bytes --require clipboard-polyfill -o browserified/node_modules.js
browserify js/server_manager/web_app/main.js -s main -o browserified/server_manager/web_app/main.js
popd

# Assemble the web app
readonly STATIC_DIR=$OUT_DIR/static
mkdir -p $STATIC_DIR

# Copy built code
cp -r $OUT_DIR/browserified/* $STATIC_DIR/

# Copy static resources
cp -r $ROOT_DIR/src/server_manager/{bower_components,ui_components,index.html,images} $STATIC_DIR
