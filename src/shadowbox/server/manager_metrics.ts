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
  PrometheusMetric,
  PrometheusValue,
} from '../infrastructure/prometheus_scraper';
import {DataUsageByUser, DataUsageTimeframe} from '../model/metrics';

const PROMETHEUS_RANGE_QUERY_STEP_SECONDS = 5 * 60;

interface Duration {
  seconds: number;
}

interface Data {
  bytes: number;
}

interface PeakDevices {
  count: number;
  timestamp: number | null;
}

interface ConnectionStats {
  lastConnected: number | null;
  lastTrafficSeen: number | null;
  peakDevices: PeakDevices;
}

interface ServerMetricsServerEntry {
  location: string;
  asn: number | null;
  asOrg: string | null;
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
    const now = new Date().getTime();
    // We need to calculate consistent start and end times for Prometheus range
    // queries. Rounding the end time *up* to the nearest multiple of the step
    // prevents time "drift" between queries, which is crucial for reliable step
    // alignment and consistent data retrieval, especially when using
    // aggregations like increase() or rate(). This ensures that the same time
    // windows are queried each time, leading to more stable and predictable
    // results.
    const end =
      Math.ceil(now / (PROMETHEUS_RANGE_QUERY_STEP_SECONDS * 1000)) *
      PROMETHEUS_RANGE_QUERY_STEP_SECONDS;
    const start = end - timeframe.seconds;

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

    const serverMap = new Map<string, ServerMetricsServerEntry>();
    for (const result of tunnelTimeByLocation.result) {
      const entry = getServerMetricsServerEntry(serverMap, result.metric);
      entry.tunnelTime.seconds = result.value ? parseFloat(result.value[1]) : 0;
    }

    for (const result of dataTransferredByLocation.result) {
      const entry = getServerMetricsServerEntry(serverMap, result.metric);
      entry.dataTransferred.bytes = result.value ? parseFloat(result.value[1]) : 0;
    }

    const accessKeyMap = new Map<string, ServerMetricsAccessKeyEntry>();
    for (const result of tunnelTimeByAccessKey.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric);
      entry.tunnelTime.seconds = result.value ? parseFloat(result.value[1]) : 0;
    }

    for (const result of dataTransferredByAccessKey.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric);
      entry.dataTransferred.bytes = result.value ? parseFloat(result.value[1]) : 0;
    }

    for (const result of tunnelTimeByAccessKeyRange.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric);
      const lastConnected = findLastNonZero(result.values ?? []);
      entry.connection.lastConnected = lastConnected ? Math.min(now, lastConnected[0]) : null;
      const peakTunnelTimeSec = findPeak(result.values ?? []);
      if (peakTunnelTimeSec !== null) {
        const peakValue = parseFloat(peakTunnelTimeSec[1]);
        if (peakValue > 0) {
          const peakTunnelTimeOverTime = peakValue / PROMETHEUS_RANGE_QUERY_STEP_SECONDS;
          entry.connection.peakDevices.count = Math.ceil(peakTunnelTimeOverTime);
          entry.connection.peakDevices.timestamp = Math.min(now, peakTunnelTimeSec[0]);
        }
      }
    }

    for (const result of dataTransferredByAccessKeyRange.result) {
      const entry = getServerMetricsAccessKeyEntry(accessKeyMap, result.metric);
      const lastTrafficSeen = findLastNonZero(result.values ?? []);
      entry.connection.lastTrafficSeen = lastTrafficSeen ? Math.min(now, lastTrafficSeen[0]) : null;
    }

    return {
      server: Array.from(serverMap.values()),
      accessKeys: Array.from(accessKeyMap.values()),
    };
  }
}

function getServerMetricsServerEntry(
  map: Map<string, ServerMetricsServerEntry>,
  metric: PrometheusMetric
): ServerMetricsServerEntry {
  const {location, asn, asorg} = metric;
  const key = `${location},${asn},${asorg}`;
  let entry = map.get(key);
  if (entry === undefined) {
    entry = {
      location: location,
      asn: asn ? parseInt(asn) : null,
      asOrg: asorg ?? null,
      dataTransferred: {bytes: 0},
      tunnelTime: {seconds: 0},
    };
    map.set(key, entry);
  }
  return entry;
}

function getServerMetricsAccessKeyEntry(
  map: Map<string, ServerMetricsAccessKeyEntry>,
  metric: PrometheusMetric
): ServerMetricsAccessKeyEntry {
  const accessKey = metric['access_key'];
  let entry = map.get(accessKey);
  if (entry === undefined) {
    entry = {
      accessKeyId: parseInt(accessKey),
      dataTransferred: {bytes: 0},
      tunnelTime: {seconds: 0},
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

/**
 * Finds the peak PrometheusValue in an array of PrometheusValues.
 *
 * The peak is determined by the highest value. If values are equal, the
 * PrometheusValue with the latest timestamp is considered the peak.
 */
function findPeak(values: PrometheusValue[]): PrometheusValue | null {
  let peak: PrometheusValue | null = null;
  let maxValue = -Infinity;

  for (const value of values) {
    const currentValue = parseFloat(value[1]);
    if (currentValue > maxValue) {
      maxValue = currentValue;
      peak = value;
    } else if (currentValue === maxValue && value[0] > peak[0]) {
      peak = value;
    }
  }

  return peak;
}

/**
 * Finds the last PrometheusValue in an array that has a value greater than zero.
 */
function findLastNonZero(values: PrometheusValue[]): PrometheusValue | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const value = values[i];
    if (parseFloat(value[1]) > 0) {
      return value;
    }
  }
  return null;
}
