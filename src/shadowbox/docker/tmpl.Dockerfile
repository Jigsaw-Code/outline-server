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

# Versions can be found at https://github.com/Jigsaw-Code/outline-ss-server/releases
ARG SS_VERSION=1.1.0

FROM golang:alpine AS ss_builder
# add git so we can build outline-ss-server from source
RUN apk add --update git && rm -rf /var/cache/apk/*
WORKDIR /tmp
ARG SS_VERSION
RUN git clone --branch "v${SS_VERSION}" https://github.com/Jigsaw-Code/outline-ss-server --single-branch
WORKDIR /tmp/outline-ss-server
ENV GO111MODULE=on
ENV GOOS={{ .GoOS }}
ENV GOARCH={{ .GoARCH }}
ENV GOARM={{ .GoARM }}
ENV CGO_ENABLED=0
RUN go build -o /app/outline-ss-server

FROM golang:alpine AS prombuilder
# Versions can be found at https://github.com/prometheus/prometheus/releases
ARG PM_VERSION=2.4.3
# add git so we can build the prometheus version from source
RUN apk add --update git && rm -rf /var/cache/apk/*
WORKDIR /tmp
RUN git clone --branch "v${PM_VERSION}" https://github.com/prometheus/prometheus --single-branch
WORKDIR /tmp/prometheus
ENV GO111MODULE=on
ENV GOOS={{ .GoOS }}
ENV GOARCH={{ .GoARCH }}
ENV GOARM={{ .GoARM }}
RUN go mod init
RUN go mod vendor
RUN go build -o /app/prometheus ./cmd/prometheus


# See versions at https://hub.docker.com/_/node/
FROM {{ .RuntimeImage }}

# Versions can be found at https://github.com/Jigsaw-Code/outline-ss-server/releases
ARG SS_VERSION

# Save metadata on the software versions we are using.
LABEL shadowbox.node_version=8.15.0
LABEL shadowbox.outline-ss-server_version="${SS_VERSION}"

ARG GITHUB_RELEASE
LABEL shadowbox.github.release="${GITHUB_RELEASE}"

# We use curl to detect the server's public IP. We need to use the --date option in `date` to
# safely grab the ip-to-country database.
RUN apk add --no-cache --upgrade coreutils curl

COPY src/shadowbox/scripts scripts/
COPY src/shadowbox/scripts/update_mmdb.sh /etc/periodic/weekly/update_mmdb

RUN /etc/periodic/weekly/update_mmdb

WORKDIR /root/shadowbox

RUN mkdir bin

COPY --from=ss_builder /app/outline-ss-server ./bin/
COPY --from=prombuilder /app/prometheus ./bin/

COPY src/shadowbox/package.json .
COPY yarn.lock .
# TODO: Replace with plain old "yarn" once the base image is fixed:
#       https://github.com/nodejs/docker-node/pull/639
RUN /opt/yarn-v$YARN_VERSION/bin/yarn install --prod

# Install management service
COPY build/shadowbox/app app/

# Create default state directory.
RUN mkdir -p /root/shadowbox/persisted-state

COPY src/shadowbox/docker/cmd.sh /

CMD /cmd.sh
