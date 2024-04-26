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
import {InsertableTable} from './infrastructure/table';
import {
  HourlyConnectionMetricsReport,
  HourlyUserConnectionMetricsReport,
  HourlyUserConnectionMetricsReportByLocation,
} from './model';

const TERABYTE = Math.pow(2, 40);

export interface ConnectionRow {
  serverId: string;
  startTimestamp: string; // ISO formatted string.
  endTimestamp: string; // ISO formatted string.
  bytesTransferred: number;
  tunnelTimeSec?: number;
  countries?: string[];
  asn?: number;
}

export class BigQueryConnectionsTable implements InsertableTable<ConnectionRow> {
  constructor(private bigqueryTable: Table) {}

  async insert(rows: ConnectionRow[]): Promise<void> {
    await this.bigqueryTable.insert(rows);
  }
}

export function postConnectionMetrics(
  table: InsertableTable<ConnectionRow>,
  report: HourlyConnectionMetricsReport
): Promise<void> {
  return table.insert(getConnectionRowsFromReport(report));
}

function getConnectionRowsFromReport(report: HourlyConnectionMetricsReport): ConnectionRow[] {
  const startTimestampStr = new Date(report.startUtcMs).toISOString();
  const endTimestampStr = new Date(report.endUtcMs).toISOString();
  const rows = [];
  for (const userReport of report.userReports) {
    // User reports come in 2 flavors: "per location" and "per key". We no longer store the
    // "per key" reports.
    if (isPerLocationUserReport(userReport)) {
      rows.push({
        serverId: report.serverId,
        startTimestamp: startTimestampStr,
        endTimestamp: endTimestampStr,
        bytesTransferred: userReport.bytesTransferred,
        tunnelTimeSec: userReport.tunnelTimeSec || undefined,
        countries: userReport.countries,
        asn: userReport.asn || undefined,
      });
    }
  }
  return rows;
}

function isPerLocationUserReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userReport: HourlyUserConnectionMetricsReport
): userReport is HourlyUserConnectionMetricsReportByLocation {
  return 'countries' in userReport;
}

// Returns true iff testObject contains a valid HourlyConnectionMetricsReport.
export function isValidConnectionMetricsReport(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  testObject: any
): testObject is HourlyConnectionMetricsReport {
  if (!testObject) {
    console.debug('Missing test object');
    return false;
  }

  const requiredConnectionMetricsFields = ['serverId', 'startUtcMs', 'endUtcMs', 'userReports'];
  for (const fieldName of requiredConnectionMetricsFields) {
    if (!testObject[fieldName]) {
      console.debug(`Missing required field \`${fieldName}\``);
      return false;
    }
  }

  if (typeof testObject.serverId !== 'string') {
    console.debug('Invalid `serverId`');
    return false;
  }

  if (
    typeof testObject.startUtcMs !== 'number' ||
    typeof testObject.endUtcMs !== 'number' ||
    testObject.startUtcMs >= testObject.endUtcMs
  ) {
    console.debug('Invalid `startUtcMs` and/or `endUtcMs`');
    return false;
  }

  if (testObject.userReports.length === 0) {
    console.debug('At least 1 user report must be provided');
    return false;
  }

  for (const userReport of testObject.userReports) {
    if (userReport.userId && typeof userReport.userId !== 'string') {
      console.debug('Invalid `serverId`');
      return false;
    }

    // We used to set a limit of 1TB per access key, then per location. We later
    // realized that a server may use a single key, or all the traffic may come
    // from a single location.
    // However, as we report hourly, it's unlikely we hit 1TB, so we keep the
    // check for now to try and prevent malicious reports.
    if (
      typeof userReport.bytesTransferred !== 'number' ||
      userReport.bytesTransferred < 0 ||
      userReport.bytesTransferred > TERABYTE
    ) {
      console.debug('Invalid `bytesTransferred`');
      return false;
    }

    if (
      userReport.tunnelTimeSec &&
      (typeof userReport.tunnelTimeSec !== 'number' || userReport.tunnelTimeSec < 0)
    ) {
      console.debug('Invalid `tunnelTimeSec`');
      return false;
    }

    if (userReport.countries) {
      if (!Array.isArray(userReport.countries)) {
        console.debug('Invalid `countries`');
        return false;
      }
      for (const country of userReport.countries) {
        if (typeof country !== 'string') {
          console.debug('Invalid `countries`');
          return false;
        }
      }
    }

    if (userReport.asn && typeof userReport.asn !== 'number') {
      console.debug('Invalid `asn`');
      return false;
    }
  }

  // Request is a valid HourlyConnectionMetricsReport.
  return true;
}
