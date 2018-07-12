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

VERSION=$1
DOWNLOAD_URL=https://github.com/shadowsocks/shadowsocks-libev/releases/download/v${VERSION}/shadowsocks-libev-${VERSION}.tar.gz
BUILD_DIR=/src/shadowsocks-libev

set -ex

# Install runtime dependencies
apk add --no-cache libev c-ares libsodium mbedtls pcre

# Install build dependencies
apk add --no-cache --virtual BUILD_DEPS \
    autoconf automake build-base gettext-dev libev-dev libsodium-dev libtool \
    linux-headers mbedtls-dev openssl-dev pcre-dev tar c-ares-dev

# Build.
mkdir -p $BUILD_DIR
cd $BUILD_DIR
curl -sSL $DOWNLOAD_URL | tar xz --strip 1

./configure --disable-documentation
make install

# Other licenses and/or source.
# Alpine does not always include LICENSE files and has no equivalent of
# Debian's "apt source" command. So, we have to manually roll something.
# We'll place licenses in the root folder of the image, named LICENSE.xxx,
# and sources under /src.

# libev (BSD or GPL2):
# http://software.schmorp.de/pkg/libev.html
curl -sS http://cvs.schmorp.de/libev/LICENSE > /LICENSE.libev

# c-ares (MIT):
# https://c-ares.haxx.se/
curl -sS https://c-ares.haxx.se/license.html > /LICENSE.c-ares.html

# libsodium (ISC):
# https://libsodium.org/
curl -sS https://raw.githubusercontent.com/jedisct1/libsodium/master/LICENSE > /LICENSE.libsodium

# mbedtls (Apache):
# https://tls.mbed.org/
curl -sS https://raw.githubusercontent.com/ARMmbed/mbedtls/development/apache-2.0.txt > /LICENSE.mbedtls

# pcre (BSD):
# http://www.pcre.org/
curl -sS http://www.pcre.org/licence.txt > /LICENSE.pcre

# Clean shadowsocks-libev's folder, leaving the source in the image.
make clean

# Remove build dependencies.
apk del BUILD_DEPS
