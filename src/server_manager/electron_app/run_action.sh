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

do_action server_manager/electron_app/build

cd $BUILD_DIR/server_manager/electron_app/static
OUTLINE_DEBUG=true \
SB_METRICS_URL=https://metrics-test.uproxy.org \
SENTRY_DSN=https://ee9db4eb185b471ca08c8eb5efbf61f1@sentry.io/214597 \
electron .
