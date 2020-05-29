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

# Newer node images have no valid content trust data.
# Pin the image node:12.16.3-alpine (linux/amd64) by hash.
# See versions at https://hub.docker.com/_/node?tab=tags&name=alpine

# Multi-stage build: use a build image to prevent bloating the shadowbox image with dependencies.
# Run `yarn` and build inside the container to package the right dependencies for the image.
FROM node@sha256:12b2154fb459fa5f42c54771524609db041e7ef3465935d0ca82940d2d72669d AS build

RUN apk add --no-cache --upgrade bash
WORKDIR /

# Don't copy node_modules and other things not needed for install.
COPY package.json yarn.lock ./
COPY src/shadowbox/package.json src/shadowbox/
RUN yarn install

# We copy the source code only after yarn install, so that source code changes don't trigger re-installs.
COPY scripts scripts/
COPY src src/
COPY tsconfig.json ./
RUN ROOT_DIR=/ yarn do shadowbox/server/build

# shadowbox image
FROM node@sha256:12b2154fb459fa5f42c54771524609db041e7ef3465935d0ca82940d2d72669d

# Save metadata on the software versions we are using.
LABEL shadowbox.node_version=12.16.3
# Keep in sync with version in third_party/outline-ss-server
LABEL shadowbox.outline-ss-server_version=1.1.4

ARG GITHUB_RELEASE
LABEL shadowbox.github.release="${GITHUB_RELEASE}"

# We use curl to detect the server's public IP. We need to use the --date option in `date` to
# safely grab the ip-to-country database
RUN apk add --no-cache --upgrade coreutils curl

COPY src/shadowbox/scripts scripts/
COPY src/shadowbox/scripts/update_mmdb.sh /etc/periodic/weekly/update_mmdb

RUN /etc/periodic/weekly/update_mmdb

WORKDIR /root/shadowbox

# Install shadowbox and third party dependencies.
RUN mkdir bin
COPY third_party/outline-ss-server/linux/outline-ss-server ./bin/
COPY third_party/prometheus/linux/prometheus ./bin/
COPY src/shadowbox/package.json .
COPY --from=build /build/shadowbox/app app

# Create default state directory.
RUN mkdir -p /root/shadowbox/persisted-state

COPY src/shadowbox/docker/cmd.sh /

CMD /cmd.sh
