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
import * as follow_redirects from '../infrastructure/follow_redirects';
import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {AccessKeyId, AccessKeyMetricsId} from '../model/access_key';
import {version} from '../package.json';
import {AccessKeyConfigJson} from './server_access_key';

import {ServerConfigJson} from './server_config';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const SANCTIONED_COUNTRIES = new Set(['CU', 'KP', 'SY']);

// Used internally to track key usage.
export interface KeyUsage {
  accessKeyId: string;
  inboundBytes: number;
}

export interface CountryUsage {
  country: string;
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
  userId?: string;
  countries?: string[];
  bytesTransferred: number;
}

// JSON format for the feature metrics report.
// Field renames will break backwards-compatibility.
export interface DailyFeatureMetricsReportJson {
  serverId: string;
  serverVersion: string;
  timestampUtcMs: number;
  dataLimit: DailyDataLimitMetricsReportJson;
}

// JSON format for the data limit feature metrics report.
// Field renames will break backwards-compatibility.
export interface DailyDataLimitMetricsReportJson {
  enabled: boolean;
  perKeyLimitCount?: number;
}

export interface SharedMetricsPublisher {
  startSharing();
  stopSharing();
  isSharingEnabled();
}

export interface UsageMetrics {
  getKeyUsage(): Promise<KeyUsage[]>;
  getCountryUsage(): Promise<CountryUsage[]>;
  reset();
}

// Reads data usage metrics from Prometheus.
export class PrometheusUsageMetrics implements UsageMetrics {
  private resetTimeMs: number = Date.now();

  constructor(private prometheusClient: PrometheusClient) {}

  async getKeyUsage(): Promise<KeyUsage[]> {
    const timeDeltaSecs = Math.round((Date.now() - this.resetTimeMs) / 1000);
    // We measure the traffic to and from the target, since that's what we are protecting.
    const result = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes{dir=~"p>t|p<t"}[${timeDeltaSecs}s])) by (access_key)`
    );
    const usage = [] as KeyUsage[];
    for (const entry of result.result) {
      const accessKeyId = entry.metric['access_key'] || '';
      const inboundBytes = Math.round(parseFloat(entry.value[1]));
      if (inboundBytes > 0) {
        usage.push({accessKeyId, inboundBytes});
      }
    }
    return usage;
  }

  async getCountryUsage(): Promise<CountryUsage[]> {
    const timeDeltaSecs = Math.round((Date.now() - this.resetTimeMs) / 1000);
    // We measure the traffic to and from the target, since that's what we are protecting.
    const result = await this.prometheusClient.query(
      `sum(increase(shadowsocks_data_bytes_per_location{dir=~"p>t|p<t"}[${timeDeltaSecs}s])) by (location)`
    );
    const usage = [] as CountryUsage[];
    for (const entry of result.result) {
      const country = entry.metric['location'] || '';
      const inboundBytes = Math.round(parseFloat(entry.value[1]));
      usage.push({country, inboundBytes});
    }
    return usage;
  }

  reset() {
    this.resetTimeMs = Date.now();
  }
}

export interface MetricsCollectorClient {
  collectServerUsageMetrics(reportJson: HourlyServerMetricsReportJson): Promise<void>;
  collectFeatureMetrics(reportJson: DailyFeatureMetricsReportJson): Promise<void>;
}

export class RestMetricsCollectorClient {
  constructor(private serviceUrl: string) {}

  collectServerUsageMetrics(reportJson: HourlyServerMetricsReportJson): Promise<void> {
    return this.postMetrics('/connections', JSON.stringify(reportJson));
  }

  collectFeatureMetrics(reportJson: DailyFeatureMetricsReportJson): Promise<void> {
    return this.postMetrics('/features', JSON.stringify(reportJson));
  }

  private async postMetrics(urlPath: string, reportJson: string): Promise<void> {
    const options = {
      headers: {'Content-Type': 'application/json'},
      method: 'POST',
      body: reportJson,
    };
    const url = `${this.serviceUrl}${urlPath}`;
    logging.debug(`Posting metrics to ${url} with options ${JSON.stringify(options)}`);
    try {
      const response = await follow_redirects.requestFollowRedirectsWithSameMethodAndBody(
        url,
        options
      );
      if (!response.ok) {
        throw new Error(`Got status ${response.status}`);
      }
    } catch (e) {
      throw new Error(`Failed to post to metrics server: ${e}`);
    }
  }
}

// Keeps track of the connection metrics per user, since the startDatetime.
// This is reported to the Outline team if the admin opts-in.
export class OutlineSharedMetricsPublisher implements SharedMetricsPublisher {
  // Time at which we started recording connection metrics.
  private reportStartTimestampMs: number;

  // serverConfig: where the enabled/disable setting is persisted
  // keyConfig: where access keys are persisted
  // usageMetrics: where we get the metrics from
  // toMetricsId: maps Access key ids to metric ids
  // metricsUrl: where to post the metrics
  constructor(
    private clock: Clock,
    private serverConfig: JsonConfig<ServerConfigJson>,
    private keyConfig: JsonConfig<AccessKeyConfigJson>,
    usageMetrics: UsageMetrics,
    private toMetricsId: (accessKeyId: AccessKeyId) => AccessKeyMetricsId,
    private metricsCollector: MetricsCollectorClient
  ) {
    // Start timer
    this.reportStartTimestampMs = this.clock.now();

    this.clock.setInterval(async () => {
      if (!this.isSharingEnabled()) {
        return;
      }
      try {
        const keyUsagePromise = usageMetrics.getKeyUsage()
        const countryUsagePromise = usageMetrics.getCountryUsage()
        await this.reportServerUsageMetrics(await keyUsagePromise, await countryUsagePromise);
        usageMetrics.reset();
      } catch (err) {
        logging.error(`Failed to report server usage metrics: ${err}`);
      }
    }, MS_PER_HOUR);
    // TODO(fortuna): also trigger report on shutdown, so data loss is minimized.

    this.clock.setInterval(async () => {
      if (!this.isSharingEnabled()) {
        return;
      }
      try {
        await this.reportFeatureMetrics();
      } catch (err) {
        logging.error(`Failed to report feature metrics: ${err}`);
      }
    }, MS_PER_DAY);
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

  private async reportServerUsageMetrics(keyUsageMetrics: KeyUsage[], countryUsageMetrics: CountryUsage[]): Promise<void> {
    const reportEndTimestampMs = this.clock.now();

    const userReports = [] as HourlyUserMetricsReportJson[];
    // HACK! We use the same backend reporting endpoint for key and country usage.
    // A row with empty country is for key usage, a row with empty userId is for country usage.
    // Note that this reports usage twice. If you want the total, filter to rows with non empty countries.
    for (const keyUsage of keyUsageMetrics) {
      if (keyUsage.inboundBytes === 0) {
        continue;
      }
      const userId = this.toMetricsId(keyUsage.accessKeyId);
      if (!userId) {
        continue;
      }
      userReports.push({
        userId,
        bytesTransferred: keyUsage.inboundBytes,
      });
    }
    for (const countryUsage of countryUsageMetrics) {
      if (countryUsage.inboundBytes === 0) {
        continue;
      }
      if (isSanctionedCountry(countryUsage.country)) {
        continue;
      }
      // Make sure to always set the country to differentiate the row
      // from key usage rows.
      const country = countryUsage.country || 'ZZ';
      userReports.push({
        bytesTransferred: countryUsage.inboundBytes,
        countries: [country],
      });
    }
    const report = {
      serverId: this.serverConfig.data().serverId,
      startUtcMs: this.reportStartTimestampMs,
      endUtcMs: reportEndTimestampMs,
      userReports,
    } as HourlyServerMetricsReportJson;

    this.reportStartTimestampMs = reportEndTimestampMs;
    if (userReports.length === 0) {
      return;
    }
    await this.metricsCollector.collectServerUsageMetrics(report);
  }

  private async reportFeatureMetrics(): Promise<void> {
    const keys = this.keyConfig.data().accessKeys;
    const featureMetricsReport = {
      serverId: this.serverConfig.data().serverId,
      serverVersion: version,
      timestampUtcMs: this.clock.now(),
      dataLimit: {
        enabled: !!this.serverConfig.data().accessKeyDataLimit,
        perKeyLimitCount: keys.filter((key) => !!key.dataLimit).length,
      },
    };
    await this.metricsCollector.collectFeatureMetrics(featureMetricsReport);
  }
}

function isSanctionedCountry(country: string) {
  return SANCTIONED_COUNTRIES.has(country);
}
