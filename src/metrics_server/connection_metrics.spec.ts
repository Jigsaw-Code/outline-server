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

import {
  ConnectionRow,
  isValidConnectionMetricsReport,
  postConnectionMetrics,
} from './connection_metrics';
import {InsertableTable} from './infrastructure/table';
import {HourlyConnectionMetricsReport, HourlyUserConnectionMetricsReport} from './model';

const VALID_USER_REPORT = {
  userId: 'uid0',
  countries: ['US', 'UK'],
  bytesTransferred: 123,
  tunnelTimeSec: 789,
};

const VALID_REPORT: HourlyConnectionMetricsReport = {
  serverId: 'id',
  startUtcMs: 1,
  endUtcMs: 2,
  userReports: [structuredClone(VALID_USER_REPORT)],
};

class FakeConnectionsTable implements InsertableTable<ConnectionRow> {
  public rows: ConnectionRow[] | undefined;

  async insert(rows: ConnectionRow[]) {
    this.rows = rows;
  }
}

describe('postConnectionMetrics', () => {
  it('correctly inserts feature metrics rows', async () => {
    const table = new FakeConnectionsTable();
    const userReports = [
      {
        userId: 'uid0',
        countries: ['US', 'UK'],
        bytesTransferred: 123,
        tunnelTimeSec: 987,
      },
      {
        userId: 'uid1',
        countries: ['EC'],
        bytesTransferred: 456,
        tunnelTimeSec: 654,
      },
      {
        userId: '',
        countries: ['BR'],
        bytesTransferred: 789,
        tunnelTimeSec: 321,
      },
      {
        userId: 'uid1',
        countries: [],
        bytesTransferred: 555,
        tunnelTimeSec: 444,
      },
    ];
    const report = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports};
    await postConnectionMetrics(table, report);
    const rows: ConnectionRow[] = [
      {
        serverId: report.serverId,
        startTimestamp: new Date(report.startUtcMs).toISOString(),
        endTimestamp: new Date(report.endUtcMs).toISOString(),
        userId: userReports[0].userId,
        bytesTransferred: userReports[0].bytesTransferred,
        tunnelTimeSec: userReports[0].tunnelTimeSec,
        countries: userReports[0].countries,
      },
      {
        serverId: report.serverId,
        startTimestamp: new Date(report.startUtcMs).toISOString(),
        endTimestamp: new Date(report.endUtcMs).toISOString(),
        userId: userReports[1].userId,
        bytesTransferred: userReports[1].bytesTransferred,
        tunnelTimeSec: userReports[1].tunnelTimeSec,
        countries: userReports[1].countries,
      },
      {
        serverId: report.serverId,
        startTimestamp: new Date(report.startUtcMs).toISOString(),
        endTimestamp: new Date(report.endUtcMs).toISOString(),
        userId: undefined,
        bytesTransferred: userReports[2].bytesTransferred,
        tunnelTimeSec: userReports[2].tunnelTimeSec,
        countries: userReports[2].countries,
      },
      {
        serverId: report.serverId,
        startTimestamp: new Date(report.startUtcMs).toISOString(),
        endTimestamp: new Date(report.endUtcMs).toISOString(),
        userId: userReports[3].userId,
        bytesTransferred: userReports[3].bytesTransferred,
        tunnelTimeSec: userReports[3].tunnelTimeSec,
        countries: userReports[3].countries,
      },
    ];
    expect(table.rows).toEqual(rows);
  });
});

describe('isValidConnectionMetricsReport', () => {
  it('returns true for valid report', () => {
    const userReports = [
      {userId: 'uid0', countries: ['AA'], bytesTransferred: 111, tunnelTimeSec: 1},
      {userId: 'uid1', bytesTransferred: 222, tunnelTimeSec: 2},
      {userId: 'uid2', countries: [], bytesTransferred: 333, tunnelTimeSec: 3},
      {countries: ['BB'], bytesTransferred: 444, tunnelTimeSec: 4},
      {userId: '', countries: ['CC'], bytesTransferred: 555, tunnelTimeSec: 5},
    ];
    const report = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports};
    expect(isValidConnectionMetricsReport(report)).toBeTruthy();
  });
  it('returns false for missing report', () => {
    expect(isValidConnectionMetricsReport(undefined)).toBeFalse();
  });
  it('returns false for inconsistent timestamp values', () => {
    const report = structuredClone(VALID_REPORT);
    // startUtcMs > endUtcMs
    report.startUtcMs = 999;
    report.endUtcMs = 1;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for out-of-bounds transferred bytes', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports[0].bytesTransferred = -123;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();

    // 2TB is above the server capacity
    report.userReports[0].bytesTransferred = 2 * Math.pow(2, 40);
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for out-of-bounds tunnel time', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports[0].tunnelTimeSec = -123;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for missing user reports', () => {
    const report: Partial<HourlyConnectionMetricsReport> = structuredClone(VALID_REPORT);
    delete report['userReports'];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for empty user reports', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports = [];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for missing `serverId`', () => {
    const report: Partial<HourlyConnectionMetricsReport> = structuredClone(VALID_REPORT);
    delete report['serverId'];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for missing `startUtcMs`', () => {
    const report: Partial<HourlyConnectionMetricsReport> = structuredClone(VALID_REPORT);
    delete report['startUtcMs'];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for missing `endUtcMs`', () => {
    const report: Partial<HourlyConnectionMetricsReport> = structuredClone(VALID_REPORT);
    delete report['endUtcMs'];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for user report missing both `userId` and `countries`', () => {
    const userReport: Partial<HourlyUserConnectionMetricsReport> =
      structuredClone(VALID_USER_REPORT);
    delete userReport['userId'];
    delete userReport['countries'];
    const report = structuredClone(VALID_REPORT);
    report.userReports[0] = userReport as HourlyUserConnectionMetricsReport;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for missing user report field `bytesTransferred`', () => {
    const report = structuredClone(VALID_REPORT);
    const userReport: Partial<HourlyUserConnectionMetricsReport> =
      structuredClone(VALID_USER_REPORT);
    delete userReport['bytesTransferred'];
    report.userReports[0] = userReport as HourlyUserConnectionMetricsReport;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for missing user report field `tunnelTimeSec`', () => {
    const userReport: Partial<HourlyUserConnectionMetricsReport> = VALID_USER_REPORT;
    delete userReport['tunnelTimeSec'];
    const report = structuredClone(VALID_REPORT);
    report.userReports[0] = userReport as HourlyUserConnectionMetricsReport;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect user report field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports = [1, 2, 3] as unknown as HourlyUserConnectionMetricsReport[];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `serverId` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.serverId = 987 as unknown as string;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `startUtcMs` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.startUtcMs = '100' as unknown as number;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `endUtcMs` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.endUtcMs = '100' as unknown as number;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `userId` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports[0].userId = 1234 as unknown as string;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `countries` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports[0].countries = [1, 2, 3] as unknown as string[];
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `bytesTransferred` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports[0].bytesTransferred = '1234' as unknown as number;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
  it('returns false for incorrect `tunnelTimeSec` field type', () => {
    const report = structuredClone(VALID_REPORT);
    report.userReports[0].tunnelTimeSec = '789' as unknown as number;
    expect(isValidConnectionMetricsReport(report)).toBeFalse();
  });
});
