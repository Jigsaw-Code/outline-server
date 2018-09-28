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

import {JsonConfig} from '../infrastructure/json_config';
import {AccessKeyId} from '../model/access_key';
import {DataUsageByUser} from '../model/metrics';
import {UsageMetricsWriter} from './shared_metrics';

// Serialized format for the manager metrics.
// WARNING: Renaming fields will break backwards-compatibility.
export interface ManagerMetricsJson {
  // Bytes per user per day. The key encodes the user+day in the form "userId-dateInYYYYMMDD".
  dailyUserBytesTransferred?: Array<[string, number]>;
  // Set of all User IDs for whom we have transfer metrics.
  // TODO: Delete userIdSet. It can be derived from dailyUserBytesTransferred.
  userIdSet?: string[];
}

// ManagerMetrics keeps track of the number of bytes transferred per user, per day.
// Surfaced by the manager service to display on the Manager UI.
// TODO: Remove entries older than 30d.
export class ManagerMetrics implements UsageMetricsWriter {
  private dailyUserBytesTransferred: Map<string, number>;
  private userIdSet: Set<AccessKeyId>;

  constructor(private config: JsonConfig<ManagerMetricsJson>) {
    const serializedObject = config.data();
    if (serializedObject) {
      this.dailyUserBytesTransferred = new Map(serializedObject.dailyUserBytesTransferred);
      this.userIdSet = new Set(serializedObject.userIdSet);
    } else {
      this.dailyUserBytesTransferred = new Map();
      this.userIdSet = new Set();
    }
  }

  public writeBytesTransferred(userId: AccessKeyId, numBytes: number, countries: string[]) {
    this.userIdSet.add(userId);

    const date = new Date();
    const oldTotal = this.getBytes(userId, date);
    const newTotal = oldTotal + numBytes;
    this.dailyUserBytesTransferred.set(this.getKey(userId, date), newTotal);
    this.toJson(this.config.data());
    this.config.write();
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
  private toJson(target: ManagerMetricsJson) {
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
