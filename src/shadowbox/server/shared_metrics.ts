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

import * as follow_redirects from '../infrastructure/follow_redirects';
import * as ip_location from '../infrastructure/ip_location';
import * as logging from '../infrastructure/logging';
import {AccessKeyId} from '../model/access_key';
import {PerUserStats} from '../model/metrics';

import * as ip_util from './ip_util';

export interface SharedStatsJson {
  startTimestamp: number;
  lastHourUserStatsObj:
      {[accessKeyId: string]: {bytesTransferred: number; anonymizedIpAddresses: string[];}};
}

// Keeps track of the connection stats per user, since the startDatetime.
// This is reported to the Outline team if the admin opts-in.
export class SharedStats {
  // Date+time at which we started recording connection stats, e.g.
  // in case this object is constructed from data written to disk.
  public startDatetime: Date;

  // Map from the metrics AccessKeyId to stats (bytes transferred, IP addresses).
  public lastHourUserStats: Map<AccessKeyId, PerUserStats>;

  constructor(serializedObject?: SharedStatsJson) {
    if (serializedObject) {
      this.loadFromJson(serializedObject);
    } else {
      this.startDatetime = new Date();
      this.lastHourUserStats = new Map();
    }
  }

  // CONSIDER: accepting hashedIpAddresses, which can be persisted to disk
  // and reported to the metrics server (to approximate number of devices per userId).
  public recordBytesTransferred(userId: AccessKeyId, numBytes: number, ipAddresses: string[]) {
    const perUserStats = this.lastHourUserStats.get(userId) ||
        {bytesTransferred: 0, anonymizedIpAddresses: new Set<string>()};
    perUserStats.bytesTransferred += numBytes;
    const anonymizedIpAddresses = getAnonymizedAndDedupedIpAddresses(ipAddresses);
    for (const ip of anonymizedIpAddresses) {
      perUserStats.anonymizedIpAddresses.add(ip);
    }
    this.lastHourUserStats.set(userId, perUserStats);
  }

  public reset(): void {
    this.lastHourUserStats = new Map<AccessKeyId, PerUserStats>();
    this.startDatetime = new Date();
  }

  // Returns the state of this object, e.g.
  // {"startTimestamp":1502896650353,"lastHourUserStatsObj":{"0":{"bytesTransferred":100,"anonymizedIpAddresses":["2620:0:1003:0:0:0:0:0","5.2.79.0"]}}}
  public toJson(): SharedStatsJson {
    // lastHourUserStats is a Map containing Set structures.  Convert to an object
    // with array values.
    const lastHourUserStatsObj = {};
    this.lastHourUserStats.forEach((perUserStats, userId) => {
      lastHourUserStatsObj[userId] = {
        bytesTransferred: perUserStats.bytesTransferred,
        anonymizedIpAddresses: [...perUserStats.anonymizedIpAddresses]
      };
    });
    return {startTimestamp: this.startDatetime.getTime(), lastHourUserStatsObj};
  }

  private loadFromJson(serializedObject: SharedStatsJson) {
    // Convert type of lastHourUserStatsObj from Object containing Arrays to
    // Map containing Sets.
    const lastHourUserStatsMap = new Map<AccessKeyId, PerUserStats>();
    Object.keys(serializedObject.lastHourUserStatsObj).map((userId) => {
      const perUserStatsObj = serializedObject.lastHourUserStatsObj[userId];
      lastHourUserStatsMap.set(userId, {
        bytesTransferred: perUserStatsObj.bytesTransferred,
        anonymizedIpAddresses: new Set(perUserStatsObj.anonymizedIpAddresses)
      });
    });

    this.startDatetime = new Date(serializedObject.startTimestamp);
    this.lastHourUserStats = lastHourUserStatsMap;
  }
}

function getAnonymizedAndDedupedIpAddresses(ipAddresses: string[]): Set<string> {
  const s = new Set<string>();
  for (const ip of ipAddresses) {
    try {
      s.add(ip_util.anonymizeIp(ip));
    } catch (err) {
      logging.error('error anonymizing IP address: ' + ip + ', ' + err);
    }
  }
  return s;
}

export function getHourlyServerMetricsReport(
    serverId: string, startDatetime: Date, endDatetime: Date,
    lastHourUserStats: Map<AccessKeyId, PerUserStats>,
    ipLocationService: ip_location.IpLocationService): Promise<HourlyServerMetricsReport|null> {
  if (lastHourUserStats.size === 0) {
    // Stats are empty, no need to post a report
    return Promise.resolve(null);
  }
  // convert lastHourUserStats to an array HourlyUserMetricsReport
  const userReportPromises = [];
  lastHourUserStats.forEach((perUserStats, userId) => {
    userReportPromises.push(getHourlyUserMetricsReport(userId, perUserStats, ipLocationService));
  });
  return Promise.all(userReportPromises).then((userReports: HourlyUserMetricsReport[]) => {
    // Remove any userReports containing sanctioned countries, and return
    // null if no reports remain with un-sanctioned countries.
    userReports = getWithoutSanctionedReports(userReports);
    if (userReports.length === 0) {
      return null;
    }
    return {
      serverId,
      startUtcMs: startDatetime.getTime(),
      endUtcMs: endDatetime.getTime(),
      userReports
    };
  });
}

export function postHourlyServerMetricsReports(
    report: HourlyServerMetricsReport, metricsUrl: string) {
  const options = {
    url: metricsUrl,
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    body: JSON.stringify(report)
  };
  logging.info('Posting metrics: ' + JSON.stringify(options));
  return follow_redirects.requestFollowRedirectsWithSameMethodAndBody(
      options, (error, response, body) => {
        if (error) {
          logging.error(`Error posting metrics: ${error}`);
          return;
        }
        logging.info('Metrics server responded with status ' + response.statusCode);
      });
}

interface HourlyServerMetricsReport {
  serverId: string;
  startUtcMs: number;
  endUtcMs: number;
  userReports: HourlyUserMetricsReport[];
}

interface HourlyUserMetricsReport {
  userId: string;
  countries: string[];
  bytesTransferred: number;
}

function getHourlyUserMetricsReport(
    userId: AccessKeyId, perUserStats: PerUserStats,
    ipLocationService: ip_location.IpLocationService): Promise<HourlyUserMetricsReport> {
  const countryPromises = [];
  for (const ip of perUserStats.anonymizedIpAddresses) {
    const countryPromise = ipLocationService.countryForIp(ip).catch((e) => {
      logging.warn(`Failed countryForIp call: ${e}`);
      return 'ERROR';
    });
    countryPromises.push(countryPromise);
  }
  return Promise.all(countryPromises).then((countries: string[]) => {
    return {
      userId,
      bytesTransferred: perUserStats.bytesTransferred,
      countries: getWithoutDuplicates(countries)
    };
  });
}

// Return an array with the duplicate elements removed.
function getWithoutDuplicates<T>(a: T[]): T[] {
  return [...new Set(a)];
}

function getWithoutSanctionedReports(userReports: HourlyUserMetricsReport[]):
    HourlyUserMetricsReport[] {
  const sanctionedCountries = ['CU', 'IR', 'KP', 'SY'];
  const filteredReports = [];
  for (const userReport of userReports) {
    userReport.countries = userReport.countries.filter((country) => {
      return sanctionedCountries.indexOf(country) === -1;
    });
    if (userReport.countries.length > 0) {
      filteredReports.push(userReport);
    }
  }
  return filteredReports;
}
