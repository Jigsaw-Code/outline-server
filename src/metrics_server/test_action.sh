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

if (( $# <= 0 )); then
  echo "No test data specified"
  exit 1;
fi

readonly MODULE_DIR=$(dirname $0)
readonly OUT_DIR=$BUILD_DIR/metrics_server/test
readonly CONFIG_FILE=$MODULE_DIR/config_test.json

# Build the server
$MODULE_DIR/build.sh $OUT_DIR $CONFIG_FILE

# TODO(dborkan): figure out why the functions binary isn't installed at $ROOT_DIR/node_modules/.bin/
readonly FUNCTIONS_EMULATOR=$ROOT_DIR/node_modules/@google-cloud/functions-emulator/bin/functions

$FUNCTIONS_EMULATOR start
$FUNCTIONS_EMULATOR deploy reportHourlyConnectionMetrics --trigger-http --local-path=$OUT_DIR --entry-point=reportHourlyConnectionMetrics
$FUNCTIONS_EMULATOR call reportHourlyConnectionMetrics --data=$1
