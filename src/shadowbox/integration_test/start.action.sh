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

run_action shadowbox/docker/build

LOGFILE="$(mktemp)"
readonly LOGFILE
echo "Running Shadowbox integration test.  Logs at ${LOGFILE}"

cd src/shadowbox/integration_test

declare -i result=0

if ./test.sh > "${LOGFILE}" 2>&1 ; then
  echo "Test Passed!"
  # Removing the log file sometimes fails on Travis.  There's no point in us cleaning it up
  # on a CI build anyways.
  rm -f "${LOGFILE}"
else
  result=$?
  echo "Test Failed!  Logs:"
  cat "${LOGFILE}"
fi

exit "${result}"
