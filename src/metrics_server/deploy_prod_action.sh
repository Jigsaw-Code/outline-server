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

yarn do metrics_server/build

cp src/metrics_server/config_prod.json build/metrics_server/config.json

cp src/metrics_server/package.json build/metrics_server/

gcloud --project=uproxysite functions deploy reportHourlyConnectionMetrics --trigger-http --source=build/metrics_server --entry-point=reportHourlyConnectionMetrics
