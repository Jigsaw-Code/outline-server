#!/bin/bash -eu
#
# Copyright 2021 The Outline Authors
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

# This script intended to run at the repository root.

source ./scripts/reqcheck/library.sh

# check node version
LOCAL_NODE_VERSION="$(node --version)"
NODE_TARGET_VERSION="16.12.0"
NODE_TARGET_COMPARATOR=">="

check_resource_version Node \
    "${LOCAL_NODE_VERSION}" \
    "${NODE_TARGET_COMPARATOR}" \
    "${NODE_TARGET_VERSION}"

# check npm version
LOCAL_NPM_VERSION="$(npm --version)"
NPM_TARGET_VERSION="7.24.0"
NPM_TARGET_COMPARATOR=">="

check_resource_version NPM \
    "${LOCAL_NPM_VERSION}" \
    "${NPM_TARGET_COMPARATOR}" \
    "${NPM_TARGET_VERSION}"
