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

export DOCKER_CONTENT_TRUST="${DOCKER_CONTENT_TRUST:-1}"
# Enable Docker BuildKit (https://docs.docker.com/develop/develop-images/build_enhancements)
export DOCKER_BUILDKIT=1

# Newer node images have no valid content trust data.
# Pin the image amd64/node:16.10.0-alpine3.13 (linux/amd64) by hash.
# See versions at https://hub.docker.com/r/amd64/node/
readonly NODE_IMAGE="amd64/node@sha256:7d73fbbe131f83ccbdcdfd1f20720a94a0b8239365b4d74dfc97a9528a79a945"

# Doing an explicit `docker pull` of the container base image to work around an issue where
# Travis fails to pull the base image when using BuildKit. Seems to be related to:
# https://github.com/moby/buildkit/issues/606 and https://github.com/moby/buildkit/issues/1397
docker pull "${NODE_IMAGE}"
docker build --force-rm \
    --build-arg NODE_IMAGE="${NODE_IMAGE}" \
    --build-arg GITHUB_RELEASE="${TRAVIS_TAG:-none}" \
    -f src/shadowbox/docker/Dockerfile \
    -t "${SB_IMAGE:-outline/shadowbox}" "${ROOT_DIR}"
