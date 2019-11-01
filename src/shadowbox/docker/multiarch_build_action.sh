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

do_action shadowbox/server/build

export DOCKER_CONTENT_TRUST=${DOCKER_CONTENT_TRUST:-1}

declare -A SS_ARCHITECTURE_MAP=(
  ["amd64"]="x86_64"
  ["386"]="i386"
  ["arm"]="armv7"
  ["arm64"]="arm64"
)

declare -A PM_ARCHITECTURE_MAP=(
  ["amd64"]="amd64"
  ["386"]="386"
  ["arm"]="armv7"
  ["arm64"]="arm64"
)

declare -a BUILD_ARCH=(
  "amd64"
  "386"
  "arm"
  "arm64"
)

for PLATFORM_ARCH in "${BUILD_ARCH[@]}";
do
  TRAVIS_TAG=${TRAVIS_TAG:-none}
  IMAGE_TAG="$PLATFORM_ARCH-$TRAVIS_TAG"
  docker build --force-rm --build-arg GITHUB_RELEASE="$TRAVIS_TAG" \
    --build-arg SS_ARCHITECTURE="${SS_ARCHITECTURE_MAP[$PLATFORM_ARCH]}" \
    --build-arg PM_ARCHITECTURE="${PM_ARCHITECTURE_MAP[$PLATFORM_ARCH]}" \
    -t outline/shadowbox:$IMAGE_TAG $ROOT_DIR -f src/shadowbox/docker/multiarch.Dockerfile
done
