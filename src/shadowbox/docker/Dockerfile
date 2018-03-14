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

# See versions at https://hub.docker.com/_/node/
FROM node:8.10.0-alpine

# Versions can be found at https://github.com/shadowsocks/shadowsocks-libev/releases
ARG SS_VERSION=3.1.3

# Save metadata on the software versions we are using.
LABEL shadowbox.node_version=8.10.0
LABEL shadowbox.shadowsocks_version="${SS_VERSION}"

ARG GITHUB_RELEASE
LABEL shadowbox.github.release="${GITHUB_RELEASE}"

# lsof for Shadowbox, curl for detecting our public IP.
RUN apk add --no-cache lsof curl

COPY src/shadowbox/scripts scripts/
RUN sh ./scripts/install_shadowsocks.sh $SS_VERSION

WORKDIR /root/shadowbox

# Install management service
COPY build/shadowbox/app app/
COPY src/shadowbox/package.json .
COPY src/shadowbox/yarn.lock .
RUN yarn install --prod

# Create default state directory.
RUN mkdir -p /root/shadowbox/persisted-state

# The maximum number of files that can be opened by ss-server greatly
# influence on performance, as described here:
#   https://shadowsocks.org/en/config/advanced.html
#
# The steps described in that page do *not* work for processes running
# under Docker, at least on modern Debian/Ubuntu-like systems whose init
# daemons allow per-service limits and ignore completely
# /etc/security/limits.conf. On those systems, the Shadowbox container
# will, by default, inherit the limits configured for the Docker service:
#   https://docs.docker.com/engine/reference/commandline/run/#set-ulimits-in-container-ulimit
#
# Interestingly, we observed poor performance with large values such as 524288
# and 1048576, the default values in recent releases of Ubuntu. Our
# non-exhaustive testing indicates a performance cliff for Outline after values
# around 270k; to stay well bekow of this cliff we've semi-handwaved-ly settled
# upon a limit of 32k files.
#
# By configuring this limit via the Docker image's CMD line we are able to
# propagate the value to current users and change it in the future via our
# normal Watchtower-based update mechanism (this is *not* the case with
# docker run --ulimit) without changing the host system's configuration.
CMD SB_PUBLIC_IP=${SB_PUBLIC_IP:-$(curl https://ipinfo.io/ip)} SB_METRICS_URL=${SB_METRICS_URL:-https://metrics-prod.uproxy.org} sh -c 'ulimit -n 32768; node app/server/main.js'
