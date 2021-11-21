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

# Collects common packaging options.  Meant to be called from the diffrent package_foo and 
# release_foo scripts.
# Usage from a packaging script:  
#    source src/server_manager/electron_app/package_$PLATFORM $0 $@
#
# Note that you MUST use "source" in order to run the script in the same process as the calling
# script, allowing fill_packaging_opts.sh to fill variables for the caller.

# Input: "/absolute/path/src/server_manager/electron_app/something_action.sh"
# Output: "npm run action server_manager/electron_app/something"
readonly ELECTRON_PATH='server_manager/electron_app/'
readonly RELATIVE="${1#*/src/${ELECTRON_PATH}}"
readonly NPM_COMMAND="npm run action ${ELECTRON_PATH}${RELATIVE%.action.sh}"
shift

function usage () {
  echo "Usage:" 1>&2
  echo "${NPM_COMMAND} [-s stagingPercentage]" 1>&2
  echo "  -s: The staged rollout percentage for this release.  Must be in the interval (0, 100].  Defaults to 100" 1>&2
  echo "  -h: this help message" 1>&2
  echo 1>&2
  echo "Examples:" 1>&2
  echo "Releases the beta of version 1.2.3 to 10% of users listening on the beta channel" 1>&2
  echo '$ '"jq -r '.version' src/server_manager/package.json'" 1>&2
  echo "1.2.3-beta" 1>&2
  echo '$ '"${YARN_COMMAND} -s 10" 1>&2
  exit 1
}

STAGING_PERCENTAGE=100
while getopts s:? opt; do
  case ${opt} in
    s) STAGING_PERCENTAGE=${OPTARG} ;;
    *) usage ;;
  esac
done

if ((STAGING_PERCENTAGE <= 0)) || ((STAGING_PERCENTAGE > 100)); then
  echo "Staging percentage must be greater than 0 and no more than 100" 1>&2
  exit 1
fi
