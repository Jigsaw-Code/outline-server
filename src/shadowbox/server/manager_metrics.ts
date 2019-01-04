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

import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {DataUsageByUser} from '../model/metrics';

export interface ManagerMetrics { get30DayByteTransfer(): Promise<DataUsageByUser>; }

// Reads manager metrics from a Prometheus instance.
export class PrometheusManagerMetrics implements ManagerMetrics {
  constructor(private prometheusClient: PrometheusClient) {}

  async get30DayByteTransfer(): Promise<DataUsageByUser> {
    // TODO(fortuna): Consider pre-computing this to save server's CPU.
    // We measure only traffic leaving the server, since that's what DigitalOcean charges.
    // TODO: Display all directions to admin
    // TODO: Remove >p< once ss-libev support is gone.
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
    return {bytesTransferredByUserId: usage};
  }
}
