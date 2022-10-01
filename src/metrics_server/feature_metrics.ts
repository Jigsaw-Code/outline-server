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
import {DailyDataLimitMetricsReport, DailyFeatureMetricsReport} from './model';

// Reflects the feature metrics BigQuery table schema.
export interface FeatureRow {
  serverId: string;
  serverVersion: string;
  timestamp: string; // ISO formatted string
  dataLimit: DailyDataLimitMetricsReport;
}

export class BigQueryFeaturesTable implements InsertableTable<FeatureRow> {
  constructor(private bigqueryTable: Table) {}

  async insert(rows: FeatureRow | FeatureRow[]): Promise<void> {
    await this.bigqueryTable.insert(rows);
  }
}

export async function postFeatureMetrics(
  table: InsertableTable<FeatureRow>,
  report: DailyFeatureMetricsReport
) {
  const featureRow: FeatureRow = {
    serverId: report.serverId,
    serverVersion: report.serverVersion,
    timestamp: new Date(report.timestampUtcMs).toISOString(),
    dataLimit: report.dataLimit,
  };
  return table.insert([featureRow]);
}

// Returns true iff `obj` contains a valid DailyFeatureMetricsReport.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isValidFeatureMetricsReport(obj: any): obj is DailyFeatureMetricsReport {
  if (!obj) {
    return false;
  }

  // Check that all required fields are present.
  const requiredFeatureMetricsReportFields = [
    'serverId',
    'serverVersion',
    'timestampUtcMs',
    'dataLimit',
  ];
  for (const fieldName of requiredFeatureMetricsReportFields) {
    if (!obj[fieldName]) {
      return false;
    }
  }

  // Validate the report types are what we expect.
  if (
    typeof obj.serverId !== 'string' ||
    typeof obj.serverVersion !== 'string' ||
    typeof obj.timestampUtcMs !== 'number'
  ) {
    return false;
  }

  // Validate the server data limit feature
  if (typeof obj.dataLimit.enabled !== 'boolean') {
    return false;
  }

  // Validate the per-key data limit feature
  const perKeyLimitCount = obj.dataLimit.perKeyLimitCount;
  if (perKeyLimitCount === undefined) {
    return true;
  }
  if (typeof perKeyLimitCount === 'number') {
    return obj.dataLimit.perKeyLimitCount >= 0;
  }
  return false;
}
