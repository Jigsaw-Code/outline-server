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

# Environment inputs:
# - SB_VERSION
# - SB_IMAGE
# - ARCH
# - NODE_IMAGE
# - ROOT_DIR

export DOCKER_CONTENT_TRUST="${DOCKER_CONTENT_TRUST:-1}"
# Enable Docker BuildKit (https://docs.docker.com/develop/develop-images/build_enhancements)
export DOCKER_BUILDKIT=1

# Docker image build architecture. Supported architectures: x86_64, arm64
export ARCH=${ARCH:-x86_64}

# Newer node images have no valid content trust data.
# Pin the image node:16.18.0-alpine3.16 by hash.
# See image at https://hub.docker.com/_/node/tags?page=1&name=18.18.0-alpine3.18
readonly NODE_IMAGE=$(
    if [[ "${ARCH}" == "x86_64" ]]; then
        echo "node@sha256:a0b787b0d53feacfa6d606fb555e0dbfebab30573277f1fe25148b05b66fa097" 
    elif [[ "${ARCH}" == "arm64" ]]; then
        echo "node@sha256:b4b7a1dd149c65ee6025956ac065a843b4409a62068bd2b0cbafbb30ca2fab3b" 
    else
        echo "Unsupported architecture"
        exit 1
    fi
)

docker build --force-rm \
    --build-arg ARCH="${ARCH}" \
    --build-arg NODE_IMAGE="${NODE_IMAGE}" \
    --build-arg VERSION="${SB_VERSION:-dev}" \
    -f src/shadowbox/docker/Dockerfile \
    -t "${SB_IMAGE:-localhost/outline/shadowbox}" \
    "${ROOT_DIR}"
