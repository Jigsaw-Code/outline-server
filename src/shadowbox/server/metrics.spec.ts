// Copyright 2018 The Outline Authors
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

import * as https from 'https';

import {PerUserStats} from '../model/metrics';

import * as ip_util from './ip_util';
import * as metrics from './metrics';

const SERVER_ID = 'serverId';
const USER_ID_1 = 'userId1';
const USER_ID_2 = 'userId2';
const START_DATETIME = new Date(Date.now() - (3600 * 1000));  // 1 hour ago
const END_DATETIME = new Date(Date.now());
const IP_ADDRESS_IN_US_1 = '45.55.19.0';
const IP_ADDRESS_IN_US_2 = '192.81.216.0';
const IP_ADDRESS_IN_GB = '185.86.151.11';
const IP_ADDRESS_IN_NORTH_KOREA = '175.45.176.0';
const IP_ADDRESS_IN_CUBA = '152.206.0.0';

describe('getHourlyServerMetricsReport', () => {
  it('Converts IP addresses to country codes', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1, getPerUserStats([IP_ADDRESS_IN_US_1]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(1);
          expect(report.userReports[0].countries.length).toEqual(1);
          expect(report.userReports[0].countries[0]).toEqual('US');
          done();
        });
  });
  it('Supports multiple countries per user report', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1, getPerUserStats([IP_ADDRESS_IN_US_1, IP_ADDRESS_IN_GB]));
    lastHourUserStats.set(USER_ID_2, getPerUserStats([IP_ADDRESS_IN_US_1]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(2);
          expect(report.userReports[0].countries.length).toEqual(2);
          expect(report.userReports[0].countries[0]).toEqual('US');
          expect(report.userReports[0].countries[1]).toEqual('GB');
          expect(report.userReports[1].countries.length).toEqual(1);
          expect(report.userReports[1].countries[0]).toEqual('US');
          done();
        });
  });
  it('Does not include duplicate countries', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1,
        getPerUserStats([IP_ADDRESS_IN_US_1, IP_ADDRESS_IN_US_2]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(1);
          expect(report.userReports[0].countries.length).toEqual(1);
          expect(report.userReports[0].countries[0]).toEqual('US');
          done();
        });
  });
  it('userReports matches input size for unsanctioned countries', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1,
        getPerUserStats([IP_ADDRESS_IN_US_1]));
    lastHourUserStats.set(USER_ID_2, getPerUserStats([IP_ADDRESS_IN_US_2]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(2);
          expect(report.userReports[0].countries.length).toEqual(1);
          expect(report.userReports[0].countries[0]).toEqual('US');
          expect(report.userReports[1].countries.length).toEqual(1);
          expect(report.userReports[1].countries[0]).toEqual('US');
          done();
        });
  });
  it('Filters sanctioned countries from userReports', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1,
        getPerUserStats([IP_ADDRESS_IN_NORTH_KOREA, IP_ADDRESS_IN_US_1]));
    lastHourUserStats.set(USER_ID_2, getPerUserStats([IP_ADDRESS_IN_US_1]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(2);
          expect(report.userReports[0].countries.length).toEqual(1);
          expect(report.userReports[0].countries[0]).toEqual('US');
          expect(report.userReports[1].countries.length).toEqual(1);
          expect(report.userReports[1].countries[0]).toEqual('US');
          done();
        });
  });
  it('Removes userReports that contain only sanctioned countries', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1,
        getPerUserStats([IP_ADDRESS_IN_NORTH_KOREA, IP_ADDRESS_IN_CUBA]));
    lastHourUserStats.set(USER_ID_2, getPerUserStats([IP_ADDRESS_IN_US_1]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(1);
          expect(report.userReports[0].countries.length).toEqual(1);
          expect(report.userReports[0].countries[0]).toEqual('US');
          done();
        });
  });
  it('Does not generate any report if all users in sanctioned countries', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set(USER_ID_1,
        getPerUserStats([IP_ADDRESS_IN_NORTH_KOREA, IP_ADDRESS_IN_CUBA]));
    lastHourUserStats.set(USER_ID_2,
        getPerUserStats([IP_ADDRESS_IN_NORTH_KOREA]));

    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new HardcodedIpLocationService())
        .then((report) => {
          expect(report).toBeNull();
          done();
        });
  });
  it('Does not propagate location service connection errors', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set('some_user_id', getPerUserStats(['127.0.0.1']));
    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new FailConnectionIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(1);
          done();
        }).catch((e) => {
          done.fail(`'getHourlyServerMetricsReport promise was rejected: ${e}`);
        });
  });
  it('Does not propagate location service promise rejection', (done) => {
    const lastHourUserStats = new Map();
    lastHourUserStats.set('some_user_id', getPerUserStats(['127.0.0.1']));
    metrics
        .getHourlyServerMetricsReport(
            SERVER_ID, START_DATETIME, END_DATETIME, lastHourUserStats,
            new AlwaysRejectIpLocationService())
        .then((report) => {
          expect(report.userReports.length).toEqual(1);
          done();
        }).catch((e) => {
          done.fail(`'getHourlyServerMetricsReport promise was rejected: ${e}`);
        });
  });
});

function getPerUserStats(ipAddresses: string[]): PerUserStats {
  return {
    bytesTransferred: 123,
    anonymizedIpAddresses: new Set(ipAddresses)
  };
}

class HardcodedIpLocationService implements ip_util.IpLocationService {
  countryForIp(ipAddress: string) {
    if (ipAddress === IP_ADDRESS_IN_US_1 || ipAddress === IP_ADDRESS_IN_US_2) {
      return Promise.resolve('US');
    } else if (ipAddress === IP_ADDRESS_IN_NORTH_KOREA) {
      return Promise.resolve('KP');
    } else if (ipAddress === IP_ADDRESS_IN_CUBA) {
      return Promise.resolve('CU');
    } else if (ipAddress === IP_ADDRESS_IN_GB) {
      return Promise.resolve('GB');
    }
    return Promise.reject(new Error('IP address not found: ' + ipAddress));
  }
}

class AlwaysRejectIpLocationService implements ip_util.IpLocationService {
  countryForIp(ipAddress: string): Promise<string> {
    return Promise.reject(
        new Error(`This IpLocationService always rejects. ipAddress: ${ipAddress}`));
  }
}

class FailConnectionIpLocationService implements ip_util.IpLocationService {
  countryForIp(ipAddress: string): Promise<string> {
    const countryPromise = new Promise<string>((fulfill, reject) => {
      https.get('https://0.0.0.0', (response) => {
        response.on('end', () => {
          fulfill('SHOULD_NOT_HAPPEN');
        });
      });
    });
    return countryPromise;
  }
}
