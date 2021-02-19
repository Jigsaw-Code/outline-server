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
readonly DOWNLOAD='download'

# The relative location of this script.
dir="$(dirname "$0")/${DOWNLOAD}"
readonly dir

declare file="shellcheck-${VERSION}" # Name of the file to download
declare cmd="${dir}/shellcheck-${VERSION}" # Path to the executable
case "$(uname -s)" in
  Linux) file+='.linux.x86_64.tar.xz'; cmd+='/shellcheck';;
  Darwin) file+='.darwin.x86_64.tar.xz'; cmd+='/shellcheck';;
  *) file+='.zip'; cmd+='.exe';; # Presume Windows/Cygwin
esac
readonly file cmd

if [[ ! -s "${cmd}" ]]; then
  mkdir -p "${dir}"

  readonly url="https://github.com/koalaman/shellcheck/releases/download/${VERSION}/${file}"
  curl --location --fail --output "${dir}/${file}" "${url}"

  pushd "${dir}"
  sha256sum --check --ignore-missing ../hashes.sha256
  if [[ "${file}" == *'.tar.xz' ]]; then
    tar xf "${file}"
  else
    unzip "${file}"
  fi
  popd > /dev/null
  chmod +x "${cmd}"
fi

"${cmd}" "$@"
