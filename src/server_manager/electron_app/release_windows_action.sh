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

$ROOT_DIR/src/server_manager/node_modules/.bin/electron-builder \
  --projectDir=build/server_manager/electron_app/static \
  --publish=never \
  --ia32 \
  --win nsis \
  --config.win.icon=icons/win/icon.ico \
  --config.win.certificateSubjectName='Jigsaw Operations LLC' \
  --config.artifactName='Outline-Manager.${ext}'
