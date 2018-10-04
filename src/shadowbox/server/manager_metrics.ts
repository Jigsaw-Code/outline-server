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

import {Clock} from '../infrastructure/clock';
import {JsonConfig} from '../infrastructure/json_config';
import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {AccessKeyId} from '../model/access_key';
import {DataUsageByUser} from '../model/metrics';

export interface ManagerMetrics { get30DayByteTransfer(): Promise<DataUsageByUser>; }

// Reads manager metrics from a Prometheus instance.
export class PrometheusManagerMetrics implements ManagerMetrics {
  constructor(
      private prometheusClient: PrometheusClient,
      private legacyManagerMetrics: LegacyManagerMetrics) {}

  async get30DayByteTransfer(): Promise<DataUsageByUser> {
    // TODO(fortuna): Consider pre-computing this to save server's CPU.
    const result = await this.prometheusClient.query(
        'sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t|>p<"}[30d])) by (access_key)');
    const usage = {} as {[userId: string]: number};
    for (const entry of result.result) {
      const bytes = Math.round(parseFloat(entry.value[1]));
      if (bytes === 0) {
        continue;
      }
      usage[entry.metric['access_key'] || ''] = bytes;
    }
    // TODO: Remove this after 30 days of everyone being migrated, since we won't need the config
    // file anymore.
    this.addLegacyUsageData(usage);
    return {bytesTransferredByUserId: usage};
  }

  private async addLegacyUsageData(usage: {[userId: string]: number}) {
    const bytesTransferredByUserId =
        (await this.legacyManagerMetrics.get30DayByteTransfer()).bytesTransferredByUserId;
    for (const userId of Object.keys(bytesTransferredByUserId)) {
      usage[userId] += bytesTransferredByUserId[userId];
    }
  }
}

// Serialized format for the manager metrics.
// WARNING: Renaming fields will break backwards-compatibility.
export interface LegacyManagerMetricsJson {
  // Bytes per user per day. The key encodes the user+day in the form "userId-dateInYYYYMMDD".
  dailyUserBytesTransferred?: Array<[string, number]>;
  // Set of all User IDs for whom we have transfer metrics.
  // TODO: Delete userIdSet. It can be derived from dailyUserBytesTransferred.
  userIdSet?: string[];
}

// ManagerMetrics keeps track of the number of bytes transferred per user, per day.
// Surfaced by the manager service to display on the Manager UI.
// TODO: Remove entries older than 30d.
export class LegacyManagerMetrics implements ManagerMetrics {
  private dailyUserBytesTransferred: Map<string, number>;
  private userIdSet: Set<AccessKeyId>;

  constructor(private clock: Clock, private config: JsonConfig<LegacyManagerMetricsJson>) {
    const serializedObject = config.data();
    if (serializedObject) {
      this.dailyUserBytesTransferred = new Map(serializedObject.dailyUserBytesTransferred);
      this.userIdSet = new Set(serializedObject.userIdSet);
    } else {
      this.dailyUserBytesTransferred = new Map();
      this.userIdSet = new Set();
    }
  }

  writeBytesTransferred(userId: AccessKeyId, numBytes: number) {
    this.userIdSet.add(userId);

    const date = new Date(this.clock.now());
    const oldTotal = this.getBytes(userId, date);
    const newTotal = oldTotal + numBytes;
    this.dailyUserBytesTransferred.set(this.getKey(userId, date), newTotal);
    this.toJson(this.config.data());
    this.config.write();
  }

  get30DayByteTransfer(): Promise<DataUsageByUser> {
    const bytesTransferredByUserId = {};
    for (let i = 0; i < 30; ++i) {
      // Get Date from i days ago.
      const d = new Date(this.clock.now());
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
    return Promise.resolve({bytesTransferredByUserId});
  }

  // Returns the state of this object, e.g.
  // {"dailyUserBytesTransferred":[["0-20170816",100],["1-20170816",100]],"userIdSet":["0","1"]}
  private toJson(target: LegacyManagerMetricsJson) {
    // Use [...] operator to serialize Map and Set objects to JSON.
    target.dailyUserBytesTransferred = [...this.dailyUserBytesTransferred];
    target.userIdSet = [...this.userIdSet];
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
