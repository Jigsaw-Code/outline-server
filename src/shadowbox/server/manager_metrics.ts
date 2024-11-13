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

import {ApiPrometheusClient, PrometheusClient} from '../infrastructure/prometheus_scraper';
import {DataUsageByUser, DataUsageTimeframe} from '../model/metrics';

interface ServerMetricsTimeframe {
  hours: number;
}

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
  getServerMetrics(timeframe: ServerMetricsTimeframe): Promise<ServerMetrics>;
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

  async getServerMetrics({hours}: ServerMetricsTimeframe): Promise<ServerMetrics> {
    const dataTransferredByLocation = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes_per_location{dir=~"c<p|p>t"}[${hours}h])) by (location, asn, asorg)`
    );
    const tunnelTimeByLocation = await this.prometheusClient.query(
      `sum(increase(shadowsocks_tunnel_time_seconds_per_location[${hours}h])) by (location, asn, asorg)`
    );
    const dataTransferredByAccessKey = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[${hours}h])) by (access_key)`
    );
    const tunnelTimeByAccessKey = await this.prometheusClient.query(
      `sum(increase(shadowsocks_tunnel_time_seconds[${hours}h])) by (access_key)`
    );

    const server = [];
    const tunnelTimeByLocationMap = tunnelTimeByLocation.result.reduce((map, entry) => {
      map.set(
        `${entry.metric['location']},${entry.metric['asn']},${entry.metric['asorg']}`,
        parseFloat(entry.value[1])
      );

      return map;
    }, new Map());
    for (const entry of dataTransferredByLocation.result) {
      const result: ServerMetricsServerEntry = {
        location: entry.metric['location'],
        asn: parseInt(entry.metric['asn']),
        asOrg: entry.metric['asorg'],
        dataTransferred: {
          bytes: parseFloat(entry.value[1]),
        },
        tunnelTime: {
          seconds: tunnelTimeByLocationMap.get(
            `${entry.metric['location']},${entry.metric['asn']},${entry.metric['asorg']}`
          ),
        },
      };

      server.push(result);
    }

    const accessKeys = [];
    const tunnelTimeByAccessKeyMap = tunnelTimeByAccessKey.result.reduce((map, entry) => {
      map.set(entry.metric['access_key'], parseFloat(entry.value[1]));

      return map;
    }, new Map());
    for (const entry of dataTransferredByAccessKey.result) {
      const result: ServerMetricsAccessKeyEntry = {
        accessKeyId: parseInt(entry.metric['access_key']),
        dataTransferred: {
          bytes: parseFloat(entry.value[1]),
        },
        tunnelTime: {
          seconds: tunnelTimeByAccessKeyMap.get(entry.metric['access_key']),
        },
      };

      accessKeys.push(result);
    }

    return {
      server,
      accessKeys,
    };
  }
}
