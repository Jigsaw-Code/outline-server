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


import * as prometheus from 'prom-client';

import {Clock} from '../infrastructure/clock';
import * as follow_redirects from '../infrastructure/follow_redirects';
import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {AccessKeyId, AccessKeyMetricsId} from '../model/access_key';

import {ServerConfigJson} from './server_config';

const MS_PER_HOUR = 60 * 60 * 1000;
const SANCTIONED_COUNTRIES = new Set(['CU', 'KP', 'SY']);

// Used internally to track key usage.
export interface KeyUsage {
  accessKeyId: string;
  countries: string[];
  inboundBytes: number;
}

// JSON format for the published report.
// Field renames will break backwards-compatibility.
export interface HourlyServerMetricsReportJson {
  serverId: string;
  startUtcMs: number;
  endUtcMs: number;
  userReports: HourlyUserMetricsReportJson[];
}

// JSON format for the published report.
// Field renames will break backwards-compatibility.
export interface HourlyUserMetricsReportJson {
  userId: string;
  countries: string[];
  bytesTransferred: number;
}

export interface SharedMetricsPublisher {
  startSharing();
  stopSharing();
  isSharingEnabled();
}

export interface UsageMetrics {
  getUsage(): Promise<KeyUsage[]>;
  reset();
}

export interface UsageMetricsWriter {
  writeBytesTransferred(accessKeyId: AccessKeyId, numBytes: number, countries: string[]);
}

// Writes usage metrics to Prometheus.
export class PrometheusUsageMetrics implements UsageMetrics {
  private resetTimeMs: number = Date.now();

  constructor(private prometheusClient: PrometheusClient) {}

  async getUsage(): Promise<KeyUsage[]> {
    const timeDeltaSecs = Math.round((Date.now() - this.resetTimeMs) / 1000);
    // We measure the traffic to and from the target, since that's what we are protecting.
    // TODO: remove >p< once the ss-libev support is gone.
    const result = await this.prometheusClient.query(
        `sum(increase(shadowsocks_data_bytes{dir=~">p<|p>t|p<t"}[${
            timeDeltaSecs}s])) by (location, access_key)`);
    const usage = [] as KeyUsage[];
    for (const entry of result.result) {
      const accessKeyId = entry.metric['access_key'] || '';
      let countries = [];
      const countriesStr = entry.metric['location'] || '';
      if (countriesStr) {
        countries = countriesStr.split(',').map((e) => e.trim());
      }
      const inboundBytes = Math.round(parseFloat(entry.value[1]));
      usage.push({accessKeyId, countries, inboundBytes});
    }
    return usage;
  }

  reset() {
    this.resetTimeMs = Date.now();
  }
}

export function createPrometheusUsageMetricsWriter(registry: prometheus.Registry):
    UsageMetricsWriter {
  const usageCounter = new prometheus.Counter({
    name: 'shadowsocks_data_bytes',
    help: 'Bytes transferred by the proxy',
    labelNames: ['dir', 'proto', 'location', 'status', 'access_key']
  });
  registry.registerMetric(usageCounter);
  return {
    writeBytesTransferred(accessKeyId: AccessKeyId, inboundBytes: number, countries: string[]) {
      usageCounter.labels('>p<', '', countries.join(','), '', accessKeyId).inc(inboundBytes);
    }
  };
}

export interface MetricsCollectorClient {
  collectMetrics(reportJson: HourlyServerMetricsReportJson): Promise<void>;
}

export class RestMetricsCollectorClient {
  constructor(private serviceUrl: string) {}

  collectMetrics(reportJson: HourlyServerMetricsReportJson): Promise<void> {
    const options = {
      url: this.serviceUrl,
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
      body: JSON.stringify(reportJson)
    };
    logging.info('Posting metrics: ' + JSON.stringify(options));
    return new Promise((resolve, reject) => {
      follow_redirects.requestFollowRedirectsWithSameMethodAndBody(
          options, (error, response, body) => {
            if (error) {
              reject(error);
              return;
            }
            logging.info('Metrics server responded with status ' + response.statusCode);
            resolve();
          });
    });
  }
}

// Keeps track of the connection metrics per user, since the startDatetime.
// This is reported to the Outline team if the admin opts-in.
export class OutlineSharedMetricsPublisher implements SharedMetricsPublisher {
  // Time at which we started recording connection metrics.
  private reportStartTimestampMs: number;

  // serverConfig: where the enabled/disable setting is persisted
  // usageMetrics: where we get the metrics from
  // toMetricsId: maps Access key ids to metric ids
  // metricsUrl: where to post the metrics
  constructor(
      private clock: Clock,
      private serverConfig: JsonConfig<ServerConfigJson>,
      usageMetrics: UsageMetrics,
      private toMetricsId: (accessKeyId: AccessKeyId) => AccessKeyMetricsId,
      private metricsCollector: MetricsCollectorClient,
  ) {
    // Start timer
    this.reportStartTimestampMs = this.clock.now();

    this.clock.setInterval(async () => {
      if (!this.isSharingEnabled()) {
        return;
      }
      this.reportMetrics(await usageMetrics.getUsage());
      usageMetrics.reset();
    }, MS_PER_HOUR);
    // TODO(fortuna): also trigger report on shutdown, so data loss is minimized.
  }

  startSharing() {
    this.serverConfig.data().metricsEnabled = true;
    this.serverConfig.write();
  }

  stopSharing() {
    this.serverConfig.data().metricsEnabled = false;
    this.serverConfig.write();
  }

  isSharingEnabled(): boolean {
    return this.serverConfig.data().metricsEnabled || false;
  }

  private async reportMetrics(usageMetrics: KeyUsage[]): Promise<void> {
    const reportEndTimestampMs = this.clock.now();

    const userReports = [] as HourlyUserMetricsReportJson[];
    for (const keyUsage of usageMetrics) {
      if (keyUsage.inboundBytes === 0) {
        continue;
      }
      if (hasSanctionedCountry(keyUsage.countries)) {
        continue;
      }
      userReports.push({
        userId: this.toMetricsId(keyUsage.accessKeyId) || '',
        bytesTransferred: keyUsage.inboundBytes,
        countries: [...keyUsage.countries]
      });
    }
    const report = {
      serverId: this.serverConfig.data().serverId,
      startUtcMs: this.reportStartTimestampMs,
      endUtcMs: reportEndTimestampMs,
      userReports
    } as HourlyServerMetricsReportJson;

    this.reportStartTimestampMs = reportEndTimestampMs;
    if (userReports.length === 0) {
      return;
    }
    await this.metricsCollector.collectMetrics(report);
  }
}

function hasSanctionedCountry(countries: string[]) {
  for (const country of countries) {
    if (SANCTIONED_COUNTRIES.has(country)) {
      return true;
    }
  }
  return false;
}