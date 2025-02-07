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

import {
  PrometheusClient,
  PrometheusValue,
  QueryResultData,
} from '../infrastructure/prometheus_scraper';
import {DataUsageByUser, DataUsageTimeframe} from '../model/metrics';
import {Comparator, Heap} from 'heap-js';

const PROMETHEUS_RANGE_QUERY_STEP_SECONDS = 5 * 60;

interface Duration {
  seconds: number;
}

interface Data {
  bytes: number;
}

interface PeakDevices {
  count: number;
  timestamp: Date | null;
}

interface ConnectionStats {
  lastConnected: Date | null;
  lastTrafficSeen: Date | null;
  peakDevices: PeakDevices;
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
  connection: ConnectionStats;
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
    const now = new Date();
    // We need to calculate consistent start and end times for Prometheus range
    // queries. Rounding the end time *down* to the nearest multiple of the step
    // prevents time "drift" between queries, which is crucial for reliable step
    // alignment and consistent data retrieval, especially when using
    // aggregations like increase() or rate(). This ensures that the same time
    // windows are queried each time, leading to more stable and predictable
    // results.
    const endEpochSeconds =
      Math.ceil(now.getTime() / (PROMETHEUS_RANGE_QUERY_STEP_SECONDS * 1000)) *
      PROMETHEUS_RANGE_QUERY_STEP_SECONDS;
    const end = new Date(endEpochSeconds * 1000);
    const start = new Date(end.getTime() - timeframe.seconds * 1000);

    const [
      dataTransferredByLocation,
      tunnelTimeByLocation,
      dataTransferredByAccessKey,
      tunnelTimeByAccessKey,
      dataTransferredByAccessKeyRange,
      tunnelTimeByAccessKeyRange,
    ] = await Promise.all([
      this.prometheusClient.query(
        `sum(increase(shadowsocks_data_bytes_per_location{dir=~"c<p|p>t"}[${timeframe.seconds}s])) by (location, asn, asorg)`
      ),
      this.prometheusClient.query(
        `sum(increase(shadowsocks_tunnel_time_seconds_per_location[${timeframe.seconds}s])) by (location, asn, asorg)`
      ),
      this.prometheusClient.query(
        `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[${timeframe.seconds}s])) by (access_key)`
      ),
      this.prometheusClient.query(
        `sum(increase(shadowsocks_tunnel_time_seconds[${timeframe.seconds}s])) by (access_key)`
      ),
      this.prometheusClient.queryRange(
        `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[${PROMETHEUS_RANGE_QUERY_STEP_SECONDS}s])) by (access_key)`,
        start,
        end,
        `${PROMETHEUS_RANGE_QUERY_STEP_SECONDS}s`
      ),
      this.prometheusClient.queryRange(
        `sum(increase(shadowsocks_tunnel_time_seconds[${PROMETHEUS_RANGE_QUERY_STEP_SECONDS}s])) by (access_key)`,
        start,
        end,
        `${PROMETHEUS_RANGE_QUERY_STEP_SECONDS}s`
      ),
    ]);

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
      // TODO: Fix undefined values for asOrg.
      const [location, asn, asOrg] = key.split(',');
      server.push({
        location,
        asn: parseInt(asn),
        asOrg,
        ...metrics,
      });
    }

    const accessKeyMap = new Map<string, ServerMetricsAccessKeyEntry>();
    for (const result of tunnelTimeByAccessKey.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric['access_key']);
      entry.tunnelTime.seconds = result.value ? parseFloat(result.value[1]) : 0;
    }

    for (const result of dataTransferredByAccessKey.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric['access_key']);
      entry.dataTransferred.bytes = result.value ? parseFloat(result.value[1]) : 0;
    }

    for (const result of tunnelTimeByAccessKeyRange.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric['access_key']);
      const lastConnected = findLastNonZero(result.values ?? []);
      entry.connection.lastConnected = lastConnected
        ? minDate(now, new Date(lastConnected[0] * 1000))
        : null;
      const peakTunnelTimeSec = findPeak(result.values ?? []);
      if (peakTunnelTimeSec !== null) {
        const peakTunnelTimeOverTime =
          parseFloat(peakTunnelTimeSec[1]) / PROMETHEUS_RANGE_QUERY_STEP_SECONDS;
        entry.connection.peakDevices.count = Math.ceil(peakTunnelTimeOverTime);
        entry.connection.peakDevices.timestamp = minDate(
          now,
          new Date(peakTunnelTimeSec[0] * 1000)
        );
      }
    }

    for (const result of dataTransferredByAccessKeyRange.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric['access_key']);
      const lastTrafficSeen = findLastNonZero(result.values ?? []);
      entry.connection.lastTrafficSeen = lastTrafficSeen
        ? minDate(now, new Date(lastTrafficSeen[0] * 1000))
        : null;
    }

    return {
      server,
      accessKeys: Array.from(accessKeyMap.values()),
    };
  }
}

function getServerMetricsAccessKeyEntry(
  map: Map<string, ServerMetricsAccessKeyEntry>,
  accessKey: string
): ServerMetricsAccessKeyEntry {
  let entry = map.get(accessKey);
  if (entry === undefined) {
    entry = {
      accessKeyId: parseInt(accessKey),
      tunnelTime: {seconds: 0},
      dataTransferred: {bytes: 0},
      connection: {
        lastConnected: null,
        lastTrafficSeen: null,
        peakDevices: {
          count: 0,
          timestamp: null,
        },
      },
    };
    map.set(accessKey, entry);
  }
  return entry;
}

function minDate(date1: Date, date2: Date): Date {
  return date1 < date2 ? date1 : date2;
}

function findPeak(values: PrometheusValue[]): PrometheusValue | null {
  // Ordering is determined by the values (max-heap). If the values are equal,
  // we determine order by the timestamps (later timestamp comes first).
  const comparator: Comparator<PrometheusValue> = (a, b) => {
    const [timestampA, valueA] = [a[0], parseFloat(a[1])];
    const [timestampB, valueB] = [b[0], parseFloat(b[1])];
    if (valueB !== valueA) {
      return valueB - valueA;
    }
    return timestampB - timestampA;
  };
  const heap = new Heap(comparator);
  heap.init(values);
  const peak = heap.peek();
  if (peak === undefined) {
    return null;
  }
  return parseFloat(peak[1]) > 0 ? peak : null;
}

function findLastNonZero(values: PrometheusValue[]): PrometheusValue | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];
    if (parseFloat(value[1]) > 0) {
      return value;
    }
  }
  return null;
}
