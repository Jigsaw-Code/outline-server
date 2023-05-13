#!/bin/bash
#
# This script is used to run Outline actions.
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

# Set the default values for the ROOT_DIR and BUILD_DIR variables.
ROOT_DIR=${ROOT_DIR:-$(pwd)/$(git rev-parse --show-cdup)}
BUILD_DIR=${BUILD_DIR:-${ROOT_DIR}/build}

# Export the ROOT_DIR and BUILD_DIR variables.
export ROOT_DIR
export BUILD_DIR

# Define a function to run an action.
function run_action() {
  # Get the action name and the arguments.
  local action=$1
  shift

  # Set the indent string.
  local indent="=> "

  # If the action name is empty, print a list of valid actions.
  if [[ -z "${action}" ]]; then
    echo "Please provide an action to run. Valid actions:"
    find . -name '*.action.sh' | sed -E 's:\./src/(.*)\.action\.sh:\1:'
    exit 0
  fi

  # Print a message indicating that the action is running.
  echo "${indent}[Running ${action}]"

  # Run the action.
  "${ROOT_DIR}/src/${action}.action.sh" "$@"

  # Get the status of the action.
  local status=$?

  # If the status is 0, print a message indicating that the action succeeded.
  if [[ $status == 0 ]]; then
    echo "${indent}[${action}: Finished]"
  # Otherwise, print a message indicating that the action failed.
  else
    echo "${indent}[${action}: Failed]"
  fi

  return $status
}

# Export the run_action function.
export -f run_action

# Run the action specified by the user.
run_action "$@"
