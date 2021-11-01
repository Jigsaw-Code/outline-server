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

# params - locator
# the locator is the literal prefix string of the key 
# in the package.json we're looking for
# for example:
#   locate_package_json_key "    \"node\": \""
#       => >=16.0.0
function locate_package_json_key {
    LOCATOR=$1

    TEMP="$(grep "${LOCATOR}" package.json)"
    TEMP=${TEMP#${LOCATOR}}
    TEMP=${TEMP%\",} # json key could end with a comma or be the end of the list
    TEMP=${TEMP%\"}  # (e.g. no comma)

    echo "${TEMP}"
}

# check node version
LOCAL_NODE_VERSION="$(node --version)"

NODE_PACKAGE_JSON_LOCATOR="    \"node\": \""
NODE_TARGET_VERSION_AND_COMPARATOR="$(
    locate_package_json_key \
        "${NODE_PACKAGE_JSON_LOCATOR}"
)"

check_resource_version Node \
    "${LOCAL_NODE_VERSION#v}" \
    "$(split_comparator "${NODE_TARGET_VERSION_AND_COMPARATOR}")" \
    "$(split_version "${NODE_TARGET_VERSION_AND_COMPARATOR}")"

# check npm version
LOCAL_NPM_VERSION="$(npm --version)"

NPM_PACKAGE_JSON_LOCATOR="    \"npm\": \""
NPM_TARGET_VERSION_AND_COMPARATOR="$(
    locate_package_json_key \
        "${NPM_PACKAGE_JSON_LOCATOR}"
)"

check_resource_version NPM \
    "${LOCAL_NPM_VERSION}" \
    "$(split_comparator "${NPM_TARGET_VERSION_AND_COMPARATOR}")" \
    "$(split_version "${NPM_TARGET_VERSION_AND_COMPARATOR}")"
