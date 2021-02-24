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

readonly VERSION='v0.7.1'

# The relative location of this script.
DOWNLOAD_DIR="$(dirname "$0")/download"
readonly DOWNLOAD_DIR

# `sha256sum` is part of GNU coreutils but is not available in macOS.
# macOS does have `shasum` (a Perl script designed to match the behavior
# of `sha256sum`) in the default install.
function sha256wrapper() {
  if command -v sha256sum &> /dev/null; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

declare file="shellcheck-${VERSION}" # Name of the file to download
declare cmd="${DOWNLOAD_DIR}/shellcheck-${VERSION}" # Path to the executable
case "$(uname -s)" in
  Linux) file+='.linux.x86_64.tar.xz'; cmd+='/shellcheck';;
  Darwin) file+='.darwin.x86_64.tar.xz'; cmd+='/shellcheck';;
  *) file+='.zip'; cmd+='.exe';; # Presume Windows/Cygwin
esac
readonly file cmd

if [[ ! -s "${cmd}" ]]; then
  mkdir -p "${DOWNLOAD_DIR}"

  readonly url="https://github.com/koalaman/shellcheck/releases/download/${VERSION}/${file}"
  curl --location --fail --output "${DOWNLOAD_DIR}/${file}" "${url}"

  pushd "${DOWNLOAD_DIR}"
  sha256wrapper --check --ignore-missing ../hashes.sha256
  if [[ "${file}" == *'.tar.xz' ]]; then
    tar xf "${file}"
  else
    unzip "${file}"
  fi
  popd > /dev/null
  chmod +x "${cmd}"
fi

"${cmd}" "$@"
