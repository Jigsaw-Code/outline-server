#!/bin/bash
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

set -eu

# TODO: Because Node.js on Cygwin doesn't handle absolute paths very
#       well, it would be worth pushd-ing to ROOT_DIR before invoking
#       them and making BUILD_DIR a relative path, viz. just "build".

declare -rx ROOT_DIR=${ROOT_DIR:-$(git rev-parse --show-toplevel)}
declare -rx BUILD_DIR=${BUILD_DIR:-$ROOT_DIR/build}

declare -rx STYLE_BOLD_WHITE='\033[1;37m'
declare -rx STYLE_RESET='\033[0m'

function do_action() {
  set +x
  local action=$1
  echo -e "$STYLE_BOLD_WHITE[Running $action]$STYLE_RESET"
  shift
  # Start a subprocess, so it has it's own settings.
  (bash -x $ROOT_DIR/src/${action}_action.sh "$@")
  echo -e "$STYLE_BOLD_WHITE[Done $action]$STYLE_RESET"
  set -x
}
export -f do_action

do_action "$@"
