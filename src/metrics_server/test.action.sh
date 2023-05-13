#!/bin/bash -eu

# This script compiles the metrics server and runs the Jasmine tests.

# The target directory for the compiled code.
readonly BUILD_DIR=./build

# The directory for the metrics server source code.
readonly ROOT_DIR=./src

# The directory for the Jasmine tests.
readonly TEST_DIR=${BUILD_DIR}/js/metrics_server/

# Remove the test directory if it exists.
rm -rf ${TEST_DIR}

# Compile the metrics server.
tsc -p ${ROOT_DIR}/metrics_server --outDir ${TEST_DIR}

# Run the Jasmine tests.
jasmine --config=${ROOT_DIR}/jasmine.json

# Remove the test directory.
rm -rf ${TEST_DIR}
