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

import * as events from 'events';
import * as fs from 'fs';
import * as url from 'url';

import * as file_read from '../infrastructure/file_read';
import * as follow_redirects from '../infrastructure/follow_redirects';
import * as ip_location from '../infrastructure/ip_location';
import {AccessKeyId} from '../model/access_key';
import {DataUsageByUser, LastHourMetricsReadyCallback, PerUserStats, Stats} from '../model/metrics';

import * as ip_util from './ip_util';

const MS_PER_HOUR = 60 * 60 * 1000;

interface PersistentStatsStoredData {
  // Serialized TransferStats object.
  transferStats: string;
  // Serialized ConnectionStats object.
  hourlyMetrics: string;
}

// Stats implementation which reads and writes state to a JSON file containing
// a PersistentStatsStoredData object.
export class PersistentStats implements Stats {
  private static readonly MAX_STATS_FILE_AGE_MS = 5000;
  private transferStats: TransferStats;
  private connectionStats: ConnectionStats;
  private dirty = false;
  private eventEmitter = new events.EventEmitter();
  private static readonly LAST_HOUR_METRICS_READY_EVENT = 'lastHourMetricsReady';

  constructor(private filename) {
    // Initialize stats from saved file, if available.
    const persistedStateObj = this.readStateFile();
    if (persistedStateObj) {
      this.transferStats = new TransferStats(persistedStateObj.transferStats);
      this.connectionStats = new ConnectionStats(persistedStateObj.hourlyMetrics);
    } else {
      this.transferStats = new TransferStats();
      this.connectionStats = new ConnectionStats();
    }

    // Set write interval.
    setInterval(this.writeStatsToFile.bind(this), PersistentStats.MAX_STATS_FILE_AGE_MS);

    // Set hourly metrics report interval
    setHourlyInterval(this.generateHourlyReport.bind(this));
  }

  public recordBytesTransferred(userId: AccessKeyId, metricsUserId: AccessKeyId, numBytes: number, ipAddresses: string[]) {
    // Pass the userId (sequence number) to transferStats as this data is returned to the Outline
    // manager which relies on the userId sequence number.
    this.transferStats.recordBytesTransferred(userId, numBytes);
    // Pass metricsUserId (uuid, rather than sequence number) to connectionStats
    // as these values may be reported to the Outline metrics server.
    this.connectionStats.recordBytesTransferred(metricsUserId, numBytes, ipAddresses);
    this.dirty = true;
  }

  public get30DayByteTransfer(): DataUsageByUser {
    return this.transferStats.get30DayByteTransfer();
  }

  public onLastHourMetricsReady(callback: LastHourMetricsReadyCallback) {
    this.eventEmitter.on(PersistentStats.LAST_HOUR_METRICS_READY_EVENT, callback);

    // Check if an hourly metrics report is already due (e.g. if server was shutdown over an
    // hour ago and just restarted).
    if (getHoursSinceDatetime(this.connectionStats.startDatetime) >= 1) {
      this.generateHourlyReport();
    }
  }

  private writeStatsToFile() {
    if (!this.dirty) {
      return;
    }

    const statsSerialized = JSON.stringify({
      transferStats: this.transferStats.serialize(),
      hourlyMetrics: this.connectionStats.serialize()
    });

    // Write to temporary file, then move that temporary file to the
    // persistent location, to avoid accidentally breaking the stats file.
    // Use *Sync calls for atomic operations, to guard against corrupting
    // these files.
    const tempFilename = `${this.filename}.${Date.now()}`;
    try {
      fs.writeFileSync(tempFilename, statsSerialized, {encoding: 'utf8'});
      fs.renameSync(tempFilename, this.filename);
      this.dirty = false;
    } catch (err) {
      console.error('error writing stats file ', err);
    }
  }

  private generateHourlyReport(): void {
    if (this.connectionStats.lastHourUserStats.size === 0) {
      // No connection stats to report.
      return;
    }

    this.eventEmitter.emit(
        PersistentStats.LAST_HOUR_METRICS_READY_EVENT,
        this.connectionStats.startDatetime,
        new Date(),  // endDatetime is the current date and time.
        this.connectionStats.lastHourUserStats);

    // Reset connection stats to begin recording the next hour.
    this.connectionStats.reset();

    // Update hasChange so we know to persist stats.
    this.dirty = true;
  }

  private readStateFile(): PersistentStatsStoredData {
    const text = file_read.readFileIfExists(this.filename);
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }
}

// TransferStats keeps track of the number of bytes transferred per user, per day.
class TransferStats {
  // Key is a string in the form "userId-dateInYYYYMMDD", e.g. "3-20170726".
  private dailyUserBytesTransferred: Map<string, number>;
  // Set of all User IDs for whom we have transfer stats.
  private userIdSet: Set<AccessKeyId>;

  constructor(serializedObject?: {}) {
    if (serializedObject) {
      this.deserialize(serializedObject);
    } else {
      this.dailyUserBytesTransferred = new Map();
      this.userIdSet = new Set();
    }
  }

  public recordBytesTransferred(userId: AccessKeyId, numBytes: number) {
    this.userIdSet.add(userId);

    const d = new Date();
    const oldTotal = this.getBytes(userId, d);
    const newTotal = oldTotal + numBytes;
    this.dailyUserBytesTransferred.set(this.getKey(userId, d), newTotal);
  }

  public get30DayByteTransfer(): DataUsageByUser {
    const bytesTransferredByUserId = {};
    for (let i = 0; i < 30; ++i) {
      // Get Date from i days ago.
      const d = new Date();
      d.setDate(d.getDate() - i);

      // Get transfer per userId and total
      for (const userId of this.userIdSet) {
        if (!bytesTransferredByUserId[userId]) {
          bytesTransferredByUserId[userId] = 0;
        }
        const numBytes = this.getBytes(userId, d);
        bytesTransferredByUserId[userId] += numBytes;
      }
    }
    return {bytesTransferredByUserId};
  }

  // Returns the state of this object, e.g.
  // {"dailyUserBytesTransferred":[["0-20170816",100],["1-20170816",100]],"userIdSet":["0","1"]}
  public serialize(): {} {
    return {
      // Use [...] operator to serialize Map and Set objects to JSON.
      dailyUserBytesTransferred: [...this.dailyUserBytesTransferred],
      userIdSet: [...this.userIdSet]
    };
  }

  private deserialize(serializedObject: {}) {
    this.dailyUserBytesTransferred = new Map(serializedObject['dailyUserBytesTransferred']);
    this.userIdSet = new Set(serializedObject['userIdSet']);
  }

  private getBytes(userId: AccessKeyId, d: Date) {
    const key = this.getKey(userId, d);
    return this.dailyUserBytesTransferred.get(key) || 0;
  }

  private getKey(userId: AccessKeyId, d: Date) {
    const yyyymmdd = d.toISOString().substr(0, 'YYYY-MM-DD'.length).replace(/-/g, '');
    return `${userId}-${yyyymmdd}`;
  }
}

// Keeps track of the connection stats per user, sine the startDatetime.
class ConnectionStats {
  // Date+time at which we started recording connection stats, e.g.
  // in case this object is constructed from data written to disk.
  public startDatetime: Date;

  // Map from the metrics AccessKeyId to stats (bytes transferred, IP addresses).
  public lastHourUserStats: Map<AccessKeyId, PerUserStats>;

  constructor(serializedObject?: {}) {
    if (serializedObject) {
      this.deserialize(serializedObject);
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
  public serialize(): {} {
    // lastHourUserStats is a Map containing Set structures.  Convert to an object
    // with array values.
    const lastHourUserStatsObj = {};
    this.lastHourUserStats.forEach((perUserStats, userId) => {
      lastHourUserStatsObj[userId] = {
        bytesTransferred: perUserStats.bytesTransferred,
        anonymizedIpAddresses: [...perUserStats.anonymizedIpAddresses]
      };
    });
    return {
      startTimestamp: this.startDatetime.getTime(),
      lastHourUserStatsObj
    };
  }

  private deserialize(serializedObject: {}) {
    // Convert type of lastHourUserStatsObj from Object containing Arrays to
    // Map containing Sets.
    const lastHourUserStatsMap = new Map<AccessKeyId, PerUserStats>();
    Object.keys(serializedObject['lastHourUserStatsObj']).map((userId) => {
      const perUserStatsObj = serializedObject['lastHourUserStatsObj'][userId];
      lastHourUserStatsMap.set(userId, {
        bytesTransferred: perUserStatsObj.bytesTransferred,
        anonymizedIpAddresses: new Set(perUserStatsObj.anonymizedIpAddresses)
      });
    });

    this.startDatetime = new Date(serializedObject['startTimestamp']);
    this.lastHourUserStats = lastHourUserStatsMap;
  }
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

export function postHourlyServerMetricsReports(report: HourlyServerMetricsReport,
    metricsUrl: string) {
  const options = {
    url: metricsUrl,
    headers: {'Content-Type': 'application/json'},
    method: 'POST',
    body: JSON.stringify(report)
  };
  console.info('Posting metrics: ' + JSON.stringify(options));
  return follow_redirects.requestFollowRedirectsWithSameMethodAndBody(options, (error, response, body) => {
    if (error) {
      console.error('Error posting metrics: ', error);
      return;
    }
    console.info('Metrics server responded with status ' + response.statusCode);
  });
}

function setHourlyInterval(callback: Function) {
  const msUntilNextHour = MS_PER_HOUR - (Date.now() % MS_PER_HOUR);
  setTimeout(() => {
      setInterval(callback, MS_PER_HOUR);
      callback();
  }, msUntilNextHour);
}

// Returns the floating-point number of hours passed since the specified date.
function getHoursSinceDatetime(d: Date): number {
  const deltaMs = Date.now() - d.getTime();
  return deltaMs / (MS_PER_HOUR);
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
      console.warn('Failed countryForIp call: ', e);
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

function getAnonymizedAndDedupedIpAddresses(ipAddresses: string[]): Set<string> {
  const s = new Set<string>();
  for (const ip of ipAddresses) {
    try {
      s.add(ip_util.anonymizeIp(ip));
    } catch (err) {
      console.error('error anonymizing IP address: ' + ip + ', ' + err);
    }
  }
  return s;
}

// Return an array with the duplicate elements removed.
function getWithoutDuplicates<T>(a: T[]): T[] {
  return [...new Set(a)];
}

function getWithoutSanctionedReports(userReports: HourlyUserMetricsReport[]): HourlyUserMetricsReport[] {
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
