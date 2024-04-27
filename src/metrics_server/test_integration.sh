#!/bin/bash -eu
#
# Copyright 2020 The Outline Authors
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

# Metrics server integration test. Posts metrics to the development environment and queries BigQuery
# to ensure the rows have been inserted to the features and connections tables.
readonly BIGQUERY_PROJECT='uproxysite'
readonly BIGQUERY_DATASET='uproxy_metrics_dev'
readonly CONNECTIONS_TABLE='connections_v1'
readonly FEATURES_TABLE='feature_metrics'

readonly METRICS_URL='https://dev.metrics.getoutline.org'

TMPDIR="$(mktemp -d)"
readonly TMPDIR
readonly CONNECTIONS_REQUEST="${TMPDIR}/connections.json"
readonly CONNECTIONS_RESPONSE="${TMPDIR}/connections_res.json"
readonly CONNECTIONS_EXPECTED_RESPONSE="${TMPDIR}/connections_expected_res.json"
readonly FEATURES_REQUEST="${TMPDIR}/features_req.json"
readonly FEATURES_RESPONSE="${TMPDIR}/features_res.json"
readonly FEATURES_EXPECTED_RESPONSE="${TMPDIR}/features_expected_res.json"

TIMESTAMP="$(date +%s%3N)"
SERVER_ID="$(uuidgen)"
SERVER_VERSION="$(uuidgen)"
readonly TIMESTAMP SERVER_ID SERVER_VERSION
# BYTES_TRANSFERRED2 < BYTES_TRANSFERRED1 so we can order the records before comparing them.
BYTES_TRANSFERRED1=$((2 + RANDOM % 100))
BYTES_TRANSFERRED2=$((BYTES_TRANSFERRED1 - 1))
TUNNEL_TIME=$((RANDOM))
PER_KEY_LIMIT_COUNT=$((RANDOM))
declare -ir BYTES_TRANSFERRED1 BYTES_TRANSFERRED2 TUNNEL_TIME PER_KEY_LIMIT_COUNT

echo "Using tmp directory ${TMPDIR}"

# Write the request data to temporary files.
cat << EOF > "${CONNECTIONS_REQUEST}"
{
  "serverId": "${SERVER_ID}",
  "startUtcMs": ${TIMESTAMP},
  "endUtcMs": $((TIMESTAMP+1)),
  "userReports": [{
    "bytesTransferred": ${BYTES_TRANSFERRED1},
    "tunnelTimeSec": ${TUNNEL_TIME},
    "countries": ["US", "NL"]
  }, {
    "bytesTransferred": ${BYTES_TRANSFERRED2},
    "countries": ["UK"],
    "asn": 123
  }]
}
EOF
cat << EOF > "${FEATURES_REQUEST}"
{
  "serverId": "${SERVER_ID}",
  "serverVersion": "${SERVER_VERSION}",
  "timestampUtcMs": ${TIMESTAMP},
  "dataLimit": {
    "enabled": false,
    "perKeyLimitCount": ${PER_KEY_LIMIT_COUNT}
  }
}
EOF

# Write the expected responses to temporary files.
# Ignore the ISO formatted timestamps to ease the comparison.
cat << EOF > "${CONNECTIONS_EXPECTED_RESPONSE}"
[
  {
    "asn": null,
    "bytesTransferred": "${BYTES_TRANSFERRED1}",
    "countries": [
      "US",
      "NL"
    ],
    "serverId": "${SERVER_ID}",
    "tunnelTimeSec": "${TUNNEL_TIME}"
  },
  {
    "asn": "123",
    "bytesTransferred": "${BYTES_TRANSFERRED2}",
    "countries": [
      "UK"
    ],
    "serverId": "${SERVER_ID}",
    "tunnelTimeSec": null
  }
]
EOF
cat << EOF > "${FEATURES_EXPECTED_RESPONSE}"
[
  {
    "dataLimit": {
      "enabled": "false",
      "perKeyLimitCount": "${PER_KEY_LIMIT_COUNT}"
    },
    "serverId": "${SERVER_ID}",
    "serverVersion": "${SERVER_VERSION}"
  }
]
EOF

echo "Connections request:"
cat "${CONNECTIONS_REQUEST}"
curl -X POST -H "Content-Type: application/json" -d "@${CONNECTIONS_REQUEST}" "${METRICS_URL}/connections" && echo
sleep 5
bq --project_id "${BIGQUERY_PROJECT}" --format json query --nouse_legacy_sql "SELECT serverId, bytesTransferred, tunnelTimeSec, countries, asn FROM \`${BIGQUERY_DATASET}.${CONNECTIONS_TABLE}\` WHERE serverId = \"${SERVER_ID}\" ORDER BY bytesTransferred DESC LIMIT 2" | jq > "${CONNECTIONS_RESPONSE}"
diff "${CONNECTIONS_RESPONSE}" "${CONNECTIONS_EXPECTED_RESPONSE}"

echo "Features request:"
cat "${FEATURES_REQUEST}"
curl -X POST -H "Content-Type: application/json" -d "@${FEATURES_REQUEST}" "${METRICS_URL}/features" && echo
sleep 5
bq --project_id "${BIGQUERY_PROJECT}" --format json query --nouse_legacy_sql "SELECT serverId, serverVersion, dataLimit FROM \`${BIGQUERY_DATASET}.${FEATURES_TABLE}\` WHERE serverId = \"${SERVER_ID}\" ORDER BY timestamp DESC LIMIT 1" | jq > "${FEATURES_RESPONSE}"
diff "${FEATURES_RESPONSE}" "${FEATURES_EXPECTED_RESPONSE}"
