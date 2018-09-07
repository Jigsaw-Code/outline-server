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

import * as file_read from '../infrastructure/file_read';
import {JsonReaderWriter} from '../infrastructure/json_storage';
import * as logging from '../infrastructure/logging';
import {AccessKeyId} from '../model/access_key';
import {DataUsageByUser, LastHourMetricsReadyCallback, Stats} from '../model/metrics';

import {ManagerStats, ManagerStatsJson} from './manager_metrics';
import {SharedStats, SharedStatsJson} from './shared_metrics';

interface PersistentStatsJson {
  // Serialized ManagerStats object.
  transferStats: ManagerStatsJson;
  // Serialized SharedStats object.
  hourlyMetrics: SharedStatsJson;
}

class MetricsFile implements JsonReaderWriter<PersistentStatsJson> {
  constructor(private filename: string) {}

  read(): PersistentStatsJson {
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

  write(dataJson: PersistentStatsJson) {
    // Write to temporary file, then move that temporary file to the
    // persistent location, to avoid accidentally breaking the stats file.
    // Use *Sync calls for atomic operations, to guard against corrupting
    // these files.
    const tempFilename = `${this.filename}.${Date.now()}`;
    try {
      fs.writeFileSync(tempFilename, dataJson, {encoding: 'utf8'});
      fs.renameSync(tempFilename, this.filename);
    } catch (err) {
      logging.error(`Error writing stats file ${err}`);
    }
  }
}

// Stats implementation which reads and writes state to a JSON file containing
// a PersistentStatsStoredData object.
export class PersistentStats implements Stats {
  private static readonly MAX_STATS_FILE_AGE_MS = 5000;
  private managerStats: ManagerStats;
  private sharedStats: SharedStats;
  private dirty = false;
  private eventEmitter = new events.EventEmitter();
  private static readonly LAST_HOUR_METRICS_READY_EVENT = 'lastHourMetricsReady';
  private metricsFile: MetricsFile;

  constructor(private filename) {
    // Initialize stats from saved file, if available.
    this.metricsFile = new MetricsFile(filename);
    const persistedStateObj = this.metricsFile.read();
    if (persistedStateObj) {
      this.managerStats = new ManagerStats(persistedStateObj.transferStats);
      this.sharedStats = new SharedStats(persistedStateObj.hourlyMetrics);
    } else {
      this.managerStats = new ManagerStats();
      this.sharedStats = new SharedStats();
    }

    // Set write interval.
    setInterval(this.writeStatsToFile.bind(this), PersistentStats.MAX_STATS_FILE_AGE_MS);

    // Set hourly metrics report interval
    setHourlyInterval(this.generateHourlyReport.bind(this));
  }

  public recordBytesTransferred(
      userId: AccessKeyId, metricsUserId: AccessKeyId, numBytes: number, ipAddresses: string[]) {
    // Pass the userId (sequence number) to transferStats as this data is returned to the Outline
    // manager which relies on the userId sequence number.
    this.managerStats.recordBytesTransferred(userId, numBytes);
    // Pass metricsUserId (uuid, rather than sequence number) to connectionStats
    // as these values may be reported to the Outline metrics server.
    this.sharedStats.recordBytesTransferred(metricsUserId, numBytes, ipAddresses);
    this.dirty = true;
  }

  public get30DayByteTransfer(): DataUsageByUser {
    return this.managerStats.get30DayByteTransfer();
  }

  public onLastHourMetricsReady(callback: LastHourMetricsReadyCallback) {
    this.eventEmitter.on(PersistentStats.LAST_HOUR_METRICS_READY_EVENT, callback);

    // Check if an hourly metrics report is already due (e.g. if server was shutdown over an
    // hour ago and just restarted).
    if (getHoursSinceDatetime(this.sharedStats.startDatetime) >= 1) {
      this.generateHourlyReport();
    }
  }

  private writeStatsToFile() {
    if (!this.dirty) {
      return;
    }

    this.metricsFile.write(
        {transferStats: this.managerStats.toJson(), hourlyMetrics: this.sharedStats.toJson()});
    this.dirty = false;
  }

  private generateHourlyReport(): void {
    if (this.sharedStats.lastHourUserStats.size === 0) {
      // No connection stats to report.
      return;
    }

    this.eventEmitter.emit(
        PersistentStats.LAST_HOUR_METRICS_READY_EVENT, this.sharedStats.startDatetime,
        new Date(),  // endDatetime is the current date and time.
        this.sharedStats.lastHourUserStats);

    // Reset connection stats to begin recording the next hour.
    this.sharedStats.reset();

    // Update hasChange so we know to persist stats.
    this.dirty = true;
  }
}

const MS_PER_HOUR = 60 * 60 * 1000;

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
