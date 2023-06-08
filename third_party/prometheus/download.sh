#!/bin/bash -eu
#
# Copyright 2022 The Outline Authors
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

# Downloads and verifies Prometheus binaries.
# Requires VERSION, OUTPUT and BASENAME to be defined.

declare -r ARCHIVE="${BASENAME}.tar.gz"
curl -L --silent "https://github.com/prometheus/prometheus/releases/download/v${VERSION}/${ARCHIVE}" -o "${ARCHIVE}"
shasum -a 256 --check --ignore-missing sha256sums.txt
mkdir -p $(dirname "${OUTPUT}")
tar -zx -f "${BASENAME}.tar.gz" --strip-components=1 -C $(dirname "${OUTPUT}") "${BASENAME}/prometheus"
chmod +x "${OUTPUT}"
rm "${ARCHIVE}"

