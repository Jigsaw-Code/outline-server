#!/bin/sh
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

export SB_METRICS_URL=${SB_METRICS_URL:-https://metrics-prod.uproxy.org}

# Make sure we don't leak readable files to other users.
umask 0007

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
# around 270k; to stay well below of this cliff we've semi-handwaved-ly settled
# upon a limit of 32k files.
ulimit -n 32768

# Start cron, which is used to check for updates to the GeoIP database
crond

node app/server/main.js
