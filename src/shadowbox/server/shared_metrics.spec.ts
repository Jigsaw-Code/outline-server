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

import {ManualClock} from '../infrastructure/clock';
import {InMemoryConfig} from '../infrastructure/json_config';
import {DataLimit} from '../model/access_key';
import * as version from './version';
import {AccessKeyConfigJson} from './server_access_key';

import {ServerConfigJson} from './server_config';
import {
  CountryUsage,
  DailyFeatureMetricsReportJson,
  HourlyServerMetricsReportJson,
  MetricsCollectorClient,
  OutlineSharedMetricsPublisher,
  UsageMetrics,
} from './shared_metrics';

describe('OutlineSharedMetricsPublisher', () => {
  describe('Enable/Disable', () => {
    it('Mirrors config', () => {
      const serverConfig = new InMemoryConfig<ServerConfigJson>({});

      const publisher = new OutlineSharedMetricsPublisher(
        new ManualClock(),
        serverConfig,
        null,
        null,
        null
      );
      expect(publisher.isSharingEnabled()).toBeFalsy();

      publisher.startSharing();
      expect(publisher.isSharingEnabled()).toBeTruthy();
      expect(serverConfig.mostRecentWrite.metricsEnabled).toBeTruthy();

      publisher.stopSharing();
      expect(publisher.isSharingEnabled()).toBeFalsy();
      expect(serverConfig.mostRecentWrite.metricsEnabled).toBeFalsy();
    });
    it('Reads from config', () => {
      const serverConfig = new InMemoryConfig<ServerConfigJson>({metricsEnabled: true});
      const publisher = new OutlineSharedMetricsPublisher(
        new ManualClock(),
        serverConfig,
        null,
        null,
        null
      );
      expect(publisher.isSharingEnabled()).toBeTruthy();
    });
  });
  describe('Metrics Reporting', () => {
    it('reports server usage metrics correctly', async () => {
      const clock = new ManualClock();
      let startTime = clock.nowMs;
      const serverConfig = new InMemoryConfig<ServerConfigJson>({serverId: 'server-id'});
      const usageMetrics = new ManualUsageMetrics();
      const metricsCollector = new FakeMetricsCollector();
      const publisher = new OutlineSharedMetricsPublisher(
        clock,
        serverConfig,
        null,
        usageMetrics,
        metricsCollector
      );

      publisher.startSharing();
      usageMetrics.countryUsage = [
        {country: 'AA', inboundBytes: 11},
        {country: 'BB', inboundBytes: 11},
        {country: 'CC', inboundBytes: 22},
        {country: 'AA', inboundBytes: 33},
        {country: 'DD', inboundBytes: 33},
      ];

      clock.nowMs += 60 * 60 * 1000;
      await clock.runCallbacks();
      expect(metricsCollector.collectedServerUsageReport).toEqual({
        serverId: 'server-id',
        startUtcMs: startTime,
        endUtcMs: clock.nowMs,
        userReports: [
          {bytesTransferred: 11, countries: ['AA']},
          {bytesTransferred: 11, countries: ['BB']},
          {bytesTransferred: 22, countries: ['CC']},
          {bytesTransferred: 33, countries: ['AA']},
          {bytesTransferred: 33, countries: ['DD']},
        ],
      });

      startTime = clock.nowMs;
      usageMetrics.countryUsage = [
        {country: 'EE', inboundBytes: 44},
        {country: 'FF', inboundBytes: 55},
      ];

      clock.nowMs += 60 * 60 * 1000;
      await clock.runCallbacks();
      expect(metricsCollector.collectedServerUsageReport).toEqual({
        serverId: 'server-id',
        startUtcMs: startTime,
        endUtcMs: clock.nowMs,
        userReports: [
          {bytesTransferred: 44, countries: ['EE']},
          {bytesTransferred: 55, countries: ['FF']},
        ],
      });

      publisher.stopSharing();
    });
    it('ignores sanctioned countries', async () => {
      const clock = new ManualClock();
      const startTime = clock.nowMs;
      const serverConfig = new InMemoryConfig<ServerConfigJson>({serverId: 'server-id'});
      const usageMetrics = new ManualUsageMetrics();
      const metricsCollector = new FakeMetricsCollector();
      const publisher = new OutlineSharedMetricsPublisher(
        clock,
        serverConfig,
        null,
        usageMetrics,
        metricsCollector
      );

      publisher.startSharing();
      usageMetrics.countryUsage = [
        {country: 'AA', inboundBytes: 11},
        {country: 'SY', inboundBytes: 11},
        {country: 'CC', inboundBytes: 22},
        {country: 'AA', inboundBytes: 33},
        {country: 'DD', inboundBytes: 33},
      ];

      clock.nowMs += 60 * 60 * 1000;
      await clock.runCallbacks();
      expect(metricsCollector.collectedServerUsageReport).toEqual({
        serverId: 'server-id',
        startUtcMs: startTime,
        endUtcMs: clock.nowMs,
        userReports: [
          {bytesTransferred: 11, countries: ['AA']},
          {bytesTransferred: 22, countries: ['CC']},
          {bytesTransferred: 33, countries: ['AA']},
          {bytesTransferred: 33, countries: ['DD']},
        ],
      });
      publisher.stopSharing();
    });
  });
  it('reports feature metrics correctly', async () => {
    const clock = new ManualClock();
    let timestamp = clock.nowMs;
    const serverConfig = new InMemoryConfig<ServerConfigJson>({
      serverId: 'server-id',
      accessKeyDataLimit: {bytes: 123},
    });
    let keyId = 0;
    const makeKeyJson = (dataLimit?: DataLimit) => {
      return {
        id: (keyId++).toString(),
        name: 'name',
        password: 'pass',
        port: 12345,
        dataLimit,
      };
    };
    const keyConfig = new InMemoryConfig<AccessKeyConfigJson>({
      accessKeys: [makeKeyJson({bytes: 2}), makeKeyJson()],
    });
    const metricsCollector = new FakeMetricsCollector();
    const publisher = new OutlineSharedMetricsPublisher(
      clock,
      serverConfig,
      keyConfig,
      new ManualUsageMetrics(),
      metricsCollector
    );

    publisher.startSharing();
    await clock.runCallbacks();
    expect(metricsCollector.collectedFeatureMetricsReport).toEqual({
      serverId: 'server-id',
      serverVersion: version.getPackageVersion(),
      timestampUtcMs: timestamp,
      dataLimit: {
        enabled: true,
        perKeyLimitCount: 1,
      },
    });
    clock.nowMs += 24 * 60 * 60 * 1000;
    timestamp = clock.nowMs;

    delete serverConfig.data().accessKeyDataLimit;
    await clock.runCallbacks();
    expect(metricsCollector.collectedFeatureMetricsReport).toEqual({
      serverId: 'server-id',
      serverVersion: version.getPackageVersion(),
      timestampUtcMs: timestamp,
      dataLimit: {
        enabled: false,
        perKeyLimitCount: 1,
      },
    });

    clock.nowMs += 24 * 60 * 60 * 1000;
    delete keyConfig.data().accessKeys[0].dataLimit;
    await clock.runCallbacks();
    expect(metricsCollector.collectedFeatureMetricsReport.dataLimit.perKeyLimitCount).toEqual(0);
  });
  it('does not report metrics when sharing is disabled', async () => {
    const clock = new ManualClock();
    const serverConfig = new InMemoryConfig<ServerConfigJson>({
      serverId: 'server-id',
      metricsEnabled: false,
    });
    const metricsCollector = new FakeMetricsCollector();
    spyOn(metricsCollector, 'collectServerUsageMetrics').and.callThrough();
    spyOn(metricsCollector, 'collectFeatureMetrics').and.callThrough();
    new OutlineSharedMetricsPublisher(
      clock,
      serverConfig,
      new InMemoryConfig<AccessKeyConfigJson>({}),
      new ManualUsageMetrics(),
      metricsCollector
    );

    await clock.runCallbacks();
    expect(metricsCollector.collectServerUsageMetrics).not.toHaveBeenCalled();
    expect(metricsCollector.collectFeatureMetrics).not.toHaveBeenCalled();
  });
});

class FakeMetricsCollector implements MetricsCollectorClient {
  public collectedServerUsageReport: HourlyServerMetricsReportJson;
  public collectedFeatureMetricsReport: DailyFeatureMetricsReportJson;

  async collectServerUsageMetrics(report) {
    this.collectedServerUsageReport = report;
  }

  async collectFeatureMetrics(report) {
    this.collectedFeatureMetricsReport = report;
  }
}

class ManualUsageMetrics implements UsageMetrics {
  public countryUsage = [] as CountryUsage[];

  getCountryUsage(): Promise<CountryUsage[]> {
    return Promise.resolve(this.countryUsage);
  }

  reset() {
    this.countryUsage = [] as CountryUsage[];
  }
}
