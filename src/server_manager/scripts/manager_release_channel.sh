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

# If this isn't an alpha or beta build, `cut -s` will return an empty string
INFO_FILE_CHANNEL=$(node_modules/node-jq/bin/jq -r '.version' src/server_manager/package.json | cut -s -d'-' -f2)
if [[ -z "${INFO_FILE_CHANNEL}" ]]; then
  INFO_FILE_CHANNEL=latest
fi
echo "${INFO_FILE_CHANNEL}"
