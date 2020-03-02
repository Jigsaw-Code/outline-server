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
BIGQUERY_PROJECT=uproxysite
BIGQUERY_DATASET=uproxy_metrics_dev
CONNECTIONS_TABLE=connections_v1
FEATURES_TABLE=feature_metrics

METRICS_URL=https://dev.metrics.getoutline.org
CONNECTIONS_PATH=connections
FEATURES_PATH=features

TMPDIR="$(mktemp -d)"
CONNECTIONS_REQUEST="$TMPDIR/connections.json"
CONNECTIONS_RESPONSE="$TMPDIR/connections_res.json"
CONNECTIONS_EXPECTED_RESPONSE="$TMPDIR/connections_expected_res.json"
FEATURES_REQUEST="$TMPDIR/features_req.json"
FEATURES_RESPONSE="$TMPDIR/features_res.json"
FEATURES_EXPECTED_RESPONSE="$TMPDIR/features_expected_res.json"

TIMESTAMP=$(date +%s%3N)
SERVER_ID=$(uuidgen)
SERVER_VERSION=$(uuidgen)
USER_ID1=$(uuidgen)
USER_ID2=$(uuidgen)
# BYTES_TRANSFERRED2 < BYTES_TRANSFERRED1 so we can order the records before comparing them.
BYTES_TRANSFERRED1=$((2 + RANDOM % 100))
BYTES_TRANSFERRED2=$(($BYTES_TRANSFERRED1 - 1))

echo "Using tmp directory $TMPDIR"

# Write the request data to temporary files.
cat << EOF > $CONNECTIONS_REQUEST
{
  "serverId": "$SERVER_ID",
  "startUtcMs": $TIMESTAMP,
  "endUtcMs": $(($TIMESTAMP+1)),
  "userReports": [{
    "userId": "$USER_ID1",
    "bytesTransferred": $BYTES_TRANSFERRED1,
    "countries": ["US", "NL"]
  }, {
    "userId": "$USER_ID2",
    "bytesTransferred": $BYTES_TRANSFERRED2,
    "countries": ["UK"]
  }]
}
EOF
cat << EOF > $FEATURES_REQUEST
{
  "serverId": "$SERVER_ID",
  "serverVersion": "$SERVER_VERSION",
  "timestampUtcMs": $TIMESTAMP,
  "dataLimit": {
    "enabled": false
  }
}
EOF

# Write the expected responses to temporary files.
# Ignore the ISO formatted timestamps to ease the comparison.
cat << EOF > $CONNECTIONS_EXPECTED_RESPONSE
[{"bytesTransferred":"$BYTES_TRANSFERRED1","countries":["US","NL"],"serverId":"$SERVER_ID","userId":"$USER_ID1"},{"bytesTransferred":"$BYTES_TRANSFERRED2","countries":["UK"],"serverId":"$SERVER_ID","userId":"$USER_ID2"}]
EOF
cat << EOF > $FEATURES_EXPECTED_RESPONSE
[{"dataLimit":{"enabled":"false"},"serverId":"$SERVER_ID","serverVersion":"$SERVER_VERSION"}]
EOF

echo "Connections request:"
cat $CONNECTIONS_REQUEST
curl -X POST -H "Content-Type: application/json" -d @$CONNECTIONS_REQUEST $METRICS_URL/connections && echo
sleep 5
bq --project_id $BIGQUERY_PROJECT --format json query --nouse_legacy_sql 'SELECT serverId, userId, bytesTransferred, countries FROM `'"$BIGQUERY_DATASET.$CONNECTIONS_TABLE"'` WHERE serverId = "'"$SERVER_ID"'" ORDER BY bytesTransferred DESC LIMIT 2' > $CONNECTIONS_RESPONSE
diff $CONNECTIONS_RESPONSE $CONNECTIONS_EXPECTED_RESPONSE

echo "Features request:"
cat $FEATURES_REQUEST
curl -X POST -H "Content-Type: application/json" -d @$FEATURES_REQUEST $METRICS_URL/features && echo
sleep 5
bq --project_id $BIGQUERY_PROJECT --format json query --nouse_legacy_sql 'SELECT serverId, serverVersion, dataLimit FROM `'"$BIGQUERY_DATASET.$FEATURES_TABLE"'` WHERE serverId = "'"$SERVER_ID"'" ORDER BY timestamp DESC LIMIT 1' > $FEATURES_RESPONSE
diff $FEATURES_RESPONSE $FEATURES_EXPECTED_RESPONSE
