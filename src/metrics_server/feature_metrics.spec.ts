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

import {FeatureRow, isValidFeatureMetricsReport, postFeatureMetrics} from './feature_metrics';
import {InsertableTable} from './infrastructure/table';
import {DailyFeatureMetricsReport} from './model';

class FakeFeaturesTable implements InsertableTable<FeatureRow> {
  public rows: FeatureRow[] | undefined;

  async insert(rows: FeatureRow[]) {
    this.rows = rows;
  }
}

describe('postFeatureMetrics', () => {
  it('correctly inserts feature metrics rows', async () => {
    const table = new FakeFeaturesTable();
    const report: DailyFeatureMetricsReport = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {enabled: false},
    };
    await postFeatureMetrics(table, report);
    const rows: FeatureRow[] = [
      {
        serverId: report.serverId,
        serverVersion: report.serverVersion,
        timestamp: new Date(report.timestampUtcMs).toISOString(),
        dataLimit: report.dataLimit,
      },
    ];
    expect(table.rows).toEqual(rows);
  });
});

describe('isValidFeatureMetricsReport', () => {
  it('returns true for valid report', () => {
    const report = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(report)).toBeTruthy();
  });
  it('returns true for valid report with per-key data limit count', () => {
    const report = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {enabled: true, perKeyLimitCount: 1},
    };
    expect(isValidFeatureMetricsReport(report)).toBeTruthy();
  });
  it('returns false for report with negative per-key data limit count', () => {
    const report = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {enabled: true, perKeyLimitCount: -1},
    };
    expect(isValidFeatureMetricsReport(report)).toBeFalsy();
  });
  it('returns false for missing report', () => {
    expect(isValidFeatureMetricsReport(undefined)).toBeFalsy();
  });
  it('returns false for incorrect report field types', () => {
    const invalidReport = {
      serverId: 1234, // Should be a string
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(invalidReport)).toBeFalsy();

    const invalidReport2 = {
      serverId: 'id',
      serverVersion: 1010, // Should be a string
      timestampUtcMs: 123456,
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(invalidReport2)).toBeFalsy();

    const invalidReport3 = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: '123', // Should be a number
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(invalidReport3)).toBeFalsy();

    const invalidReport4 = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: 'enabled', // Should be `DailyDataLimitMetricsReport`
    };
    expect(isValidFeatureMetricsReport(invalidReport4)).toBeFalsy();

    const invalidReport5 = {
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {
        enabled: 'true', // Should be a boolean
      },
    };
    expect(isValidFeatureMetricsReport(invalidReport5)).toBeFalsy();
  });
  it('returns false for missing report fields', () => {
    const invalidReport = {
      // Missing `serverId`
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(invalidReport)).toBeFalsy();

    const invalidReport2 = {
      // Missing `serverVersion`
      serverId: 'id',
      timestampUtcMs: 123456,
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(invalidReport2)).toBeFalsy();

    const invalidReport3 = {
      // Missing `timestampUtcMs`
      serverId: 'id',
      serverVersion: '0.0.0',
      dataLimit: {enabled: true},
    };
    expect(isValidFeatureMetricsReport(invalidReport3)).toBeFalsy();

    const invalidReport4 = {
      // Missing `dataLimit`
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
    };
    expect(isValidFeatureMetricsReport(invalidReport4)).toBeFalsy();

    const invalidReport5 = {
      // Missing `dataLimit.enabled`
      serverId: 'id',
      serverVersion: '0.0.0',
      timestampUtcMs: 123456,
      dataLimit: {},
    };
    expect(isValidFeatureMetricsReport(invalidReport5)).toBeFalsy();
  });
});
