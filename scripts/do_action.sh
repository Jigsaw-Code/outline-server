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

export ROOT_DIR=${ROOT_DIR:-$(git rev-parse --show-toplevel)}
export BUILD_DIR=${BUILD_DIR:-$ROOT_DIR/build}

function do_action() {
  readonly STYLE_BOLD_WHITE='\033[1;37m'
  readonly STYLE_RESET='\033[0m'
  local action=$1
  echo -e "$STYLE_BOLD_WHITE[Running $action]$STYLE_RESET"
  shift
  set -x
  $ROOT_DIR/src/${action}_action.sh "$@"
  set +x
  echo -e "$STYLE_BOLD_WHITE[Done $action]$STYLE_RESET"
}
export -f do_action

do_action "$@"
