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
      },
      {
        userId: 'uid1',
        countries: ['EC'],
        bytesTransferred: 456,
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
        countries: userReports[0].countries,
      },
      {
        serverId: report.serverId,
        startTimestamp: new Date(report.startUtcMs).toISOString(),
        endTimestamp: new Date(report.endUtcMs).toISOString(),
        userId: userReports[1].userId,
        bytesTransferred: userReports[1].bytesTransferred,
        countries: userReports[1].countries,
      },
    ];
    expect(table.rows).toEqual(rows);
  });
});

describe('isValidConnectionMetricsReport', () => {
  it('returns true for valid report', () => {
    const userReports = [
      {userId: 'uid0', countries: ['US', 'UK'], bytesTransferred: 123},
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const report = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports};
    expect(isValidConnectionMetricsReport(report)).toBeTruthy();
  });
  it('returns false for missing report', () => {
    expect(isValidConnectionMetricsReport(undefined)).toBeFalsy();
  });
  it('returns false for inconsistent timestamp values', () => {
    const userReports = [
      {userId: 'uid0', countries: ['US', 'UK'], bytesTransferred: 123},
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const invalidReport = {
      serverId: 'id',
      startUtcMs: 999, // startUtcMs > endUtcMs
      endUtcMs: 1,
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport)).toBeFalsy();
  });
  it('returns false for out-of-bounds transferred bytes', () => {
    const userReports = [
      {
        userId: 'uid0',
        countries: ['US', 'UK'],
        bytesTransferred: -123, // Should not be negative
      },
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const invalidReport = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports};
    expect(isValidConnectionMetricsReport(invalidReport)).toBeFalsy();

    const userReports2 = [
      {userId: 'uid0', countries: ['US', 'UK'], bytesTransferred: 123},
      {
        userId: 'uid1',
        countries: ['EC'],
        bytesTransferred: 2 * Math.pow(2, 40), // 2TB is above the server capacity
      },
    ];
    const invalidReport2 = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports: userReports2};
    expect(isValidConnectionMetricsReport(invalidReport2)).toBeFalsy();
  });
  it('returns false for missing report fields', () => {
    const invalidReport = {
      // Missing `userReports`
      serverId: 'id',
      startUtcMs: 1,
      endUtcMs: 2,
    };
    expect(isValidConnectionMetricsReport(invalidReport)).toBeFalsy();

    const invalidReport2 = {
      serverId: 'id',
      startUtcMs: 1,
      endUtcMs: 2,
      userReports: [], // Should not be empty
    };
    expect(isValidConnectionMetricsReport(invalidReport2)).toBeFalsy();

    const userReports = [
      {userId: 'uid0', countries: ['US', 'UK'], bytesTransferred: 123},
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const invalidReport3 = {
      // Missing `serverId`
      startUtcMs: 1,
      endUtcMs: 2,
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport3)).toBeFalsy();

    const invalidReport4 = {
      // Missing `startUtcMs`
      serverId: 'id',
      endUtcMs: 2,
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport4)).toBeFalsy();

    const invalidReport5 = {
      // Missing `endUtcMs`
      serverId: 'id',
      startUtcMs: 2,
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport5)).toBeFalsy();
  });
  it('returns false for missing user report fields', () => {
    const userReports = [
      {
        // Missing `userId`
        countries: ['US', 'UK'],
        bytesTransferred: 123,
      },
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const invalidReport = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports};
    expect(isValidConnectionMetricsReport(invalidReport)).toBeFalsy();

    const userReports2 = [
      {
        // Missing `countries`
        userId: 'uid0',
        bytesTransferred: 123,
      },
    ];
    const invalidReport2 = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports: userReports2};
    expect(isValidConnectionMetricsReport(invalidReport2)).toBeFalsy();

    const userReports3 = [
      {
        // Missing `bytesTransferred`
        userId: 'uid0',
        countries: ['US', 'UK'],
      },
    ];
    const invalidReport3 = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports: userReports3};
    expect(isValidConnectionMetricsReport(invalidReport3)).toBeFalsy();
  });
  it('returns false for incorrect report field types', () => {
    const invalidReport = {
      serverId: 'id',
      startUtcMs: 1,
      endUtcMs: 2,
      userReports: [1, 2, 3], // Should be `HourlyUserConnectionMetricsReport[]`
    };
    expect(isValidConnectionMetricsReport(invalidReport)).toBeFalsy();

    const userReports = [
      {userId: 'uid0', countries: ['US', 'UK'], bytesTransferred: 123},
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const invalidReport2 = {
      serverId: 987, // Should be a string
      startUtcMs: 1,
      endUtcMs: 2,
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport2)).toBeFalsy();

    const invalidReport3 = {
      serverId: 'id',
      startUtcMs: '100', // Should be a number
      endUtcMs: 200,
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport3)).toBeFalsy();

    const invalidReport4 = {
      // Missing `startUtcMs`
      serverId: 'id',
      startUtcMs: 1,
      endUtcMs: '200', // Should be a number
      userReports,
    };
    expect(isValidConnectionMetricsReport(invalidReport4)).toBeFalsy();
  });
  it('returns false for incorrect user report field types ', () => {
    const userReports = [
      {
        userId: 1234, // Should be a string
        countries: ['US', 'UK'],
        bytesTransferred: 123,
      },
      {userId: 'uid1', countries: ['EC'], bytesTransferred: 456},
    ];
    const invalidReport = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports};
    expect(isValidConnectionMetricsReport(invalidReport)).toBeFalsy();

    const userReports2 = [
      {
        userId: 'uid0',
        countries: [1, 2, 3], // Should be string[]
        bytesTransferred: 123,
      },
    ];
    const invalidReport2 = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports: userReports2};
    expect(isValidConnectionMetricsReport(invalidReport2)).toBeFalsy();

    const userReports3 = [
      {
        userId: 'uid0',
        countries: ['US', 'UK'],
        bytesTransferred: '1234', // Should be a number
      },
    ];
    const invalidReport3 = {serverId: 'id', startUtcMs: 1, endUtcMs: 2, userReports: userReports3};
    expect(isValidConnectionMetricsReport(invalidReport3)).toBeFalsy();
  });
});
