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

yarn do metrics_server/build

cp src/metrics_server/config_test.json build/metrics_server/config.json

# Because of weird issues with --local-path, have "functions deploy" search in the current
# directory instead.
pushd build/metrics_server
functions deploy reportHourlyConnectionMetrics --trigger-http

functions call reportHourlyConnectionMetrics --data=$1

# Because the emulator ignores the response code, always print the logs to highlight any errors.
functions logs read
