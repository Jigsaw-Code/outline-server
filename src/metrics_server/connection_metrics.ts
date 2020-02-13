// Copyright 2020 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Table} from '@google-cloud/bigquery';
import {InsertableTable} from './model';

// TODO(dborkan): HourlyConnectionMetricsReport and HourlyUserConnectionMetricsReport are
// copied from src/shadowbox/server/metrics.ts - find a way to share these
// definitions between shadowbox and the metrics_server.
export interface HourlyConnectionMetricsReport {
  serverId: string;
  startUtcMs: number;
  endUtcMs: number;
  userReports: HourlyUserConnectionMetricsReport[];
}
interface HourlyUserConnectionMetricsReport {
  userId: string;
  countries: string[];
  bytesTransferred: number;
}

export interface ConnectionRow {
  serverId: string;
  startTimestamp: string;  // ISO formatted string.
  endTimestamp: string;    // ISO formatted string.
  userId: string;
  bytesTransferred: number;
  countries: string[];
}

export class BigQueryConnectionsTable implements InsertableTable<ConnectionRow> {
  constructor(private bigqueryTable: Table) {}

  async insert(rows: ConnectionRow|ConnectionRow[]): Promise<void> {
    await this.bigqueryTable.insert(rows);
  }
}

export function postConnectionMetrics(
    table: InsertableTable<ConnectionRow>, report: HourlyConnectionMetricsReport) {
  return table.insert(getConnectionRowsFromReport(report));
}

function getConnectionRowsFromReport(report: HourlyConnectionMetricsReport): ConnectionRow[] {
  const startTimestampStr = new Date(report.startUtcMs).toISOString();
  const endTimestampStr = new Date(report.endUtcMs).toISOString();
  const rows = [];
  for (const userReport of report.userReports) {
    rows.push({
      serverId: report.serverId,
      startTimestamp: startTimestampStr,
      endTimestamp: endTimestampStr,
      userId: userReport.userId,
      bytesTransferred: userReport.bytesTransferred,
      countries: userReport.countries
    });
  }
  return rows;
}

// Returns true iff testObject contains a valid HourlyConnectionMetricsReport.
// tslint:disable-next-line:no-any
export function isValidConnectionMetricsReport(testObject: any):
    testObject is HourlyConnectionMetricsReport {
  if (!testObject) {
    return false;
  }

  // Check that all required fields are present.
  const requiredConnectionMetricsFields = ['serverId', 'startUtcMs', 'endUtcMs', 'userReports'];
  for (const fieldName of requiredConnectionMetricsFields) {
    if (!testObject[fieldName]) {
      return false;
    }
  }

  // Check that startUtcMs is not after endUtcMs.
  if (testObject.startUtcMs >= testObject.endUtcMs) {
    return false;
  }

  // Check that userReports is an array of 1 or more item.
  if (!(testObject.userReports.length >= 1)) {
    return false;
  }

  const requiredUserReportFields = ['userId', 'countries', 'bytesTransferred'];
  const MIN_BYTES_TRANSFERRED = 0;
  const MAX_BYTES_TRANSFERRED = 1 * Math.pow(2, 40);  // 1 TB.
  for (const userReport of testObject.userReports) {
    // Test that each userReport contains valid fields.
    for (const fieldName of requiredUserReportFields) {
      if (!userReport[fieldName]) {
        return false;
      }
    }
    // Check that bytesTransferred is between min and max transfer limits
    if (userReport.bytesTransferred < MIN_BYTES_TRANSFERRED ||
        userReport.bytesTransferred > MAX_BYTES_TRANSFERRED) {
      return false;
    }
  }

  // Request is a valid HourlyConnectionMetricsReport.
  return true;
}
