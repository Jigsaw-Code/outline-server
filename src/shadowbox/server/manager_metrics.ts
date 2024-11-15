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
import {DataUsageByUser, DataUsageTimeframe} from '../model/metrics';

interface Duration {
  seconds: number;
}

interface Data {
  bytes: number;
}

interface ServerMetricsServerEntry {
  location: string;
  asn: number;
  asOrg: string;
  tunnelTime: Duration;
  dataTransferred: Data;
}

interface ServerMetricsAccessKeyEntry {
  accessKeyId: number;
  tunnelTime: Duration;
  dataTransferred: Data;
}

interface ServerMetrics {
  server: ServerMetricsServerEntry[];
  accessKeys: ServerMetricsAccessKeyEntry[];
}

export interface ManagerMetrics {
  getOutboundByteTransfer(timeframe: DataUsageTimeframe): Promise<DataUsageByUser>;
  getServerMetrics(timeframe: Duration): Promise<ServerMetrics>;
}

// Reads manager metrics from a Prometheus instance.
export class PrometheusManagerMetrics implements ManagerMetrics {
  constructor(private prometheusClient: PrometheusClient) {}

  async getOutboundByteTransfer(timeframe: DataUsageTimeframe): Promise<DataUsageByUser> {
    // TODO(fortuna): Consider pre-computing this to save server's CPU.
    // We measure only traffic leaving the server, since that's what DigitalOcean charges.
    // TODO: Display all directions to admin
    const result = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[${timeframe.hours}h])) by (access_key)`
    );
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

  async getServerMetrics(timeframe: Duration): Promise<ServerMetrics> {
    const dataTransferredByLocation = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes_per_location{dir=~"c<p|p>t"}[${timeframe.seconds}s])) by (location, asn, asorg)`
    );
    const tunnelTimeByLocation = await this.prometheusClient.query(
      `sum(increase(shadowsocks_tunnel_time_seconds_per_location[${timeframe.seconds}s])) by (location, asn, asorg)`
    );
    const dataTransferredByAccessKey = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[${timeframe.seconds}s])) by (access_key)`
    );
    const tunnelTimeByAccessKey = await this.prometheusClient.query(
      `sum(increase(shadowsocks_tunnel_time_seconds[${timeframe.seconds}s])) by (access_key)`
    );

    const serverMap = new Map();
    const serverMapKey = (entry) =>
      `${entry.metric['location']},${entry.metric['asn']},${entry.metric['asorg']}`;
    for (const entry of tunnelTimeByLocation.result) {
      serverMap.set(serverMapKey(entry), {
        tunnelTime: {
          seconds: parseFloat(entry.value[1]),
        },
      });
    }

    for (const entry of dataTransferredByLocation.result) {
      if (!serverMap.has(serverMapKey(entry))) {
        serverMap.set(serverMapKey(entry), {});
      }

      serverMap.get(serverMapKey(entry)).dataTransferred = {
        bytes: parseFloat(entry.value[1]),
      };
    }

    const server = [];
    for (const [key, metrics] of serverMap.entries()) {
      const [location, asn, asOrg] = key.split(',');
      server.push({
        location,
        asn: parseInt(asn),
        asOrg,
        ...metrics,
      });
    }

    const accessKeyMap = new Map();
    for (const entry of tunnelTimeByAccessKey.result) {
      accessKeyMap.set(entry.metric['access_key'], {
        tunnelTime: {
          seconds: parseFloat(entry.value[1]),
        },
      });
    }

    for (const entry of dataTransferredByAccessKey.result) {
      if (!accessKeyMap.has(entry.metric['access_key'])) {
        accessKeyMap.set(entry.metric['access_key'], {});
      }

      accessKeyMap.get(entry.metric['access_key']).dataTransferred = {
        bytes: parseFloat(entry.value[1]),
      };
    }

    const accessKeys = [];
    for (const [key, metrics] of accessKeyMap.entries()) {
      accessKeys.push({
        accessKeyId: parseInt(key),
        ...metrics,
      });
    }

    return {
      server,
      accessKeys,
    };
  }
}
