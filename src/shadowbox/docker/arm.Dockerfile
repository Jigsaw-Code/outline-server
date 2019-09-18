ARG SS_VERSION=1.0.7
# bundled prometheus version is 2.4.3
ARG PM_VERSION=2.4.3
ARG PM_ARCHITECTURE=armv7

# =======
# Stage 1 Build most recent outline-ss-server in the upstream branch
# =======
FROM golang:alpine AS ss_builder

RUN apk add --update git upx && rm -rf /var/cache/apk/*

WORKDIR /tmp

ARG SS_VERSION

RUN git clone --branch "v${SS_VERSION}" https://github.com/Jigsaw-Code/outline-ss-server --single-branch

WORKDIR /tmp/outline-ss-server

RUN GOOS=linux GOARCH=arm GOARM=7 go build -o /app/outline-ss-server

RUN upx -5 /app/outline-ss-server

# =======
# Stage 2 Build outline-ss-server for use
# =======
FROM node:8.15.0-alpine

ARG SS_VERSION
ARG PM_VERSION
ARG PM_ARCHITECTURE

# Save metadata on the software versions we are using.
LABEL shadowbox.node_version=8.15.0
LABEL shadowbox.outline-ss-server_version="${SS_VERSION}"

# We use curl to detect the server's public IP.
RUN apk add --no-cache curl

COPY src/shadowbox/scripts scripts/
COPY src/shadowbox/scripts/update_mmdb.sh /etc/periodic/weekly/update_mmdb

RUN /etc/periodic/weekly/update_mmdb

WORKDIR /root/shadowbox

RUN mkdir bin

COPY --from=ss_builder /app/outline-ss-server bin/
RUN curl -SsL \
      https://github.com/prometheus/prometheus/releases/download/v${PM_VERSION}/prometheus-${PM_VERSION}.linux-${PM_ARCHITECTURE}.tar.gz | \
        tar xz --strip=1 -C bin prometheus-${PM_VERSION}.linux-${PM_ARCHITECTURE}/prometheus

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
