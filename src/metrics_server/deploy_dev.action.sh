#!/bin/bash -eu

# This script builds and deploys the metrics server.

# Copyright 2018 The Outline Authors

# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at

#      http://www.apache.org/licenses/LICENSE-2.0

# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Set the source and build directories.
SRC_DIR="src/metrics_server"
BUILD_DIR="build/metrics_server"

# Remove the build directory if it exists.
rm -rf "$BUILD_DIR"

# Build the metrics server.
npm run action metrics_server/build

# Copy the app configuration files to the build directory.
cp "$SRC_DIR/app_dev.yaml" "$BUILD_DIR/app.yaml"
cp "$SRC_DIR/config_dev.json" "$BUILD_DIR/config.json"

# Copy the package files to the build directory.
cp "$SRC_DIR/package.json" "$BUILD_DIR/"
cp "./package-lock.json" "$BUILD_DIR/"

# Deploy the metrics server.
gcloud app deploy "$SRC_DIR/dispatch.yaml" "$BUILD_DIR" \
  --project uproxysite --verbosity info --promote --stop-previous-version
