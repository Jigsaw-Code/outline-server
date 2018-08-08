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

yarn do server_manager/electron_app/build

# Auto-updates only work for AppImage:
# https://github.com/electron-userland/electron-builder/issues/2498
$ROOT_DIR/src/server_manager/node_modules/.bin/electron-builder \
  --projectDir=build/server_manager/electron_app/static \
  --config.asarUnpack=server_manager/web_app/images \
  --publish=never \
  --config.publish.provider=generic \
  --config.publish.url=https://raw.githubusercontent.com/Jigsaw-Code/outline-releases/master/manager/ \
  --x64 \
  --linux AppImage \
  --config.linux.icon=icons/png \
  --config.linux.category=Network \
  --config.artifactName='Outline-Manager.${ext}'

for arch in ia32 x64; do
  $ROOT_DIR/src/server_manager/node_modules/.bin/electron-builder \
    --projectDir=build/server_manager/electron_app/static \
    --config.asarUnpack=server_manager/web_app/images \
    --publish=never \
    --$arch \
    --linux deb rpm tar.gz \
    --config.linux.icon=icons/png \
    --config.linux.category=Network \
    --config.artifactName='Outline-Manager-'${arch}'.${ext}'

done
