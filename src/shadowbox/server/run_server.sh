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

# --- begin runfiles.bash initialization v2 ---
# From https://github.com/bazelbuild/bazel/blob/master/tools/bash/runfiles/runfiles.bash
# Copy-pasted from the Bazel Bash runfiles library v2.
set -uo pipefail; f=bazel_tools/tools/bash/runfiles/runfiles.bash
source "${RUNFILES_DIR:-/dev/null}/$f" 2>/dev/null || \
  source "$(grep -sm1 "^$f " "${RUNFILES_MANIFEST_FILE:-/dev/null}" | cut -f2- -d' ')" 2>/dev/null || \
  source "$0.runfiles/$f" 2>/dev/null || \
  source "$(grep -sm1 "^$f " "$0.runfiles_manifest" | cut -f2- -d' ')" 2>/dev/null || \
  source "$(grep -sm1 "^$f " "$0.exe.runfiles_manifest" | cut -f2- -d' ')" 2>/dev/null || \
  { echo>&2 "ERROR: cannot find $f"; exit 1; }; f=; set -e
# --- end runfiles.bash initialization v2 ---

export LOG_LEVEL="${LOG_LEVEL:-debug}"
export SB_PUBLIC_IP="${SB_PUBLIC_IP:-$(curl https://ipinfo.io/ip)}"
# WARNING: The SB_API_PREFIX should be kept secret in a real server!
export SB_API_PREFIX=TestApiPrefix
export SB_METRICS_URL=https://metrics-test.uproxy.org
export SB_STATE_DIR=/tmp/outline
export SB_MMDB_LOCATION=$(rlocation org_getoutline/third_party/maxmind/GeoLite2-Country/GeoLite2-Country.mmdb)

mkdir -p $SB_STATE_DIR
$(rlocation org_getoutline/src/shadowbox/scripts/make_test_certificate.sh) $SB_STATE_DIR
$(rlocation org_getoutline/src/shadowbox/server/server)
