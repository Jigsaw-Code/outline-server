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

ARG NODE_IMAGE

# Multi-stage build: use a build image to prevent bloating the shadowbox image with dependencies.
# Run `npm ci` and build inside the container to package the right dependencies for the image.
FROM ${NODE_IMAGE} AS build

RUN apk add --no-cache --upgrade bash
WORKDIR /

# Don't copy node_modules and other things not needed for install.
COPY package.json package-lock.json ./
COPY src/shadowbox/package.json src/shadowbox/
RUN npm ci

# We copy the source code only after npm ci, so that source code changes don't trigger re-installs.
COPY scripts scripts/
COPY src src/
COPY tsconfig.json ./
COPY third_party third_party
RUN ROOT_DIR=/ npm run action shadowbox/server/build

# shadowbox image
FROM ${NODE_IMAGE}

# Save metadata on the software versions we are using.
LABEL shadowbox.node_version=16.14.0

ARG GITHUB_RELEASE
LABEL shadowbox.github.release="${GITHUB_RELEASE}"

# We use curl to detect the server's public IP. We need to use the --date option in `date` to
# safely grab the ip-to-country database
RUN apk add --no-cache --upgrade coreutils curl

COPY src/shadowbox/scripts scripts/
COPY src/shadowbox/scripts/update_mmdb.sh /etc/periodic/weekly/update_mmdb

RUN /etc/periodic/weekly/update_mmdb

# Create default state directory.
RUN mkdir -p /root/shadowbox/persisted-state

# Install shadowbox.
WORKDIR /opt/outline-server

# The shadowbox build directory has the following structure:
#   - app/          (bundled node app)
#   - bin/          (binary dependencies)
#   - package.json  (shadowbox package.json)
COPY --from=build /build/shadowbox/ .

COPY src/shadowbox/docker/cmd.sh /
CMD /cmd.sh
