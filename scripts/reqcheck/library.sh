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

# This script contains functions intended to be used across `reqcheck`

# params - left version, right version
# version numbers are period-delimited
# echoes -1 if the left version is less, 1 if it's greater, 0 if the two are exactly equal.
# for example: 
#   get_version_comparator 1.2.4 1.2.4
#       => 0
#   get_version_comparator 1.2.4 1.2.5
#       => -1
#   get_version_comparator 1.2.4 1.0.6
#       => 1
function get_version_comparator {
    IFS='.' read -r -a LEFT_ARRAY <<< "${1}"
    IFS='.' read -r -a RIGHT_ARRAY <<< "${2}"

    for INDEX in "${!LEFT_ARRAY[@]}"
    do
        if [[ "${LEFT_ARRAY[INDEX]}" -lt "${RIGHT_ARRAY[INDEX]}" ]]; then
            echo "-1"
            return
        elif [[ "${LEFT_ARRAY[INDEX]}" -gt "${RIGHT_ARRAY[INDEX]}" ]]; then
            echo "1"
            return
        fi
    done

    echo "0"
}

# params - left version, target comparator, right version
# version numbers are period-delimited, target comparator is a string containing =, <, >
# echos 1 if the left version passes the comparison, 0 if it does not
# for example:
#   does_version_pass 1.2.4 <= 1.2.4
#       => 1
#   does_version_pass 1.2.4 >= 1.2.5
#       => 0
function does_version_pass {
    LEFT_VERSION=$1
    COMPARISON=$2
    RIGHT_VERSION=$3

    case "$(get_version_comparator "${LEFT_VERSION}" "${RIGHT_VERSION}")" in
        "1")
            if [[ "${COMPARISON}" == *">"* ]]; then 
                echo "1"
                return
            fi
            return;;
        "0")
            if [[ "${COMPARISON}" == *"="* ]]; then 
                echo "1"
                return
            fi
            ;;
        "-1")
            if [[ "${COMPARISON}" == *"<"* ]]; then
                echo "1"
                return
            fi
            ;;
    esac

    echo "0"
}

# params - resource name, resource version, target comparator, target version
# version numbers are period-delimited, target comparator is a string containing =, <, >
# non-zero exit if the check doesn't pass
function check_resource_version {
    RESOURCE_NAME=$1
    RESOURCE_VERSION=$2
    TARGET_COMPARATOR=$3
    TARGET_VERSION=$4

    COMPARISON_RESULT="$(
        does_version_pass \
            "${RESOURCE_VERSION}" \
            "${TARGET_COMPARATOR}" \
            "${TARGET_VERSION}"
    )"

    if [[ "${COMPARISON_RESULT}" == "0" ]]; then
        cat <<MESSAGE
ERROR: Outline development requires a ${RESOURCE_NAME} version of
${TARGET_COMPARATOR}${TARGET_VERSION}. Yours is ${RESOURCE_VERSION}.
MESSAGE
        exit 1
    fi
}