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

readonly MODULE_DIR=$(dirname $0)
readonly OUT_DIR=$BUILD_DIR/metrics_server/prod
readonly CONFIG_FILE=$MODULE_DIR/config_prod.json

# Build the server
$MODULE_DIR/build.sh $OUT_DIR $CONFIG_FILE

# Deploy as "reportHourlyConnectionMetrics"
gcloud --project=uproxysite beta functions deploy reportHourlyConnectionMetrics --stage-bucket uproxy-cloud-functions --trigger-http --source=$OUT_DIR --entry-point=reportHourlyConnectionMetrics
