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

declare file="shellcheck-${VERSION}" # Name of the file to download
declare cmd="${DOWNLOAD_DIR}/shellcheck-${VERSION}" # Path to the executable
declare sha256='' # SHA256 checksum
case "$(uname -s)" in
  Linux) file+='.linux.x86_64.tar.xz'; cmd+='/shellcheck'; sha256='64f17152d96d7ec261ad3086ed42d18232fcb65148b44571b564d688269d36c8';;
  Darwin) file+='.darwin.x86_64.tar.xz'; cmd+='/shellcheck'; sha256='b080c3b659f7286e27004aa33759664d91e15ef2498ac709a452445d47e3ac23' ;;
  *) file+='.zip'; cmd+='.exe'; sha256='1763f8f4a639d39e341798c7787d360ed79c3d68a1cdbad0549c9c0767a75e98';; # Presume Windows/Cygwin
esac
readonly file cmd

if [[ ! -s "${cmd}" ]]; then
  mkdir -p "${DOWNLOAD_DIR}"

  node "$(dirname "$0")/../../src/build/download_file.mjs" --url="https://github.com/koalaman/shellcheck/releases/download/${VERSION}/${file}" --out="${DOWNLOAD_DIR}/${file}" --sha256="${sha256}"

  pushd "${DOWNLOAD_DIR}"
  if [[ "${file}" == *'.tar.xz' ]]; then
    tar xf "${file}"
  else
    unzip "${file}"
  fi
  popd > /dev/null
  chmod +x "${cmd}"
fi

"${cmd}" "$@"
