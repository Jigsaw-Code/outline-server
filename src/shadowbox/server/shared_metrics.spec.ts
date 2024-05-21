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

import * as uuidv4 from 'uuid/v4';

import {ManualClock} from '../infrastructure/clock';
import {InMemoryConfig} from '../infrastructure/json_config';
import {DataLimit} from '../model/access_key';
import * as version from './version';
import {AccessKeyConfigJson} from './server_access_key';

import {ServerConfigJson} from './server_config';
import {
  LocationUsage,
  DailyFeatureMetricsReportJson,
  HourlyServerMetricsReportJson,
  MetricsCollectorClient,
  OutlineSharedMetricsPublisher,
  SharedMetricsPublisher,
  UsageMetrics,
} from './shared_metrics';

describe('OutlineSharedMetricsPublisher', () => {
  let clock: ManualClock;
  let startTime: number;
  let serverConfig: InMemoryConfig<ServerConfigJson>;
  let keyConfig: InMemoryConfig<AccessKeyConfigJson>;
  let usageMetrics: ManualUsageMetrics;
  let metricsCollector: FakeMetricsCollector;
  let publisher: SharedMetricsPublisher;

  beforeEach(() => {
    clock = new ManualClock();
    startTime = clock.nowMs;
    serverConfig = new InMemoryConfig({serverId: 'server-id'});
    keyConfig = new InMemoryConfig<AccessKeyConfigJson>({
      accessKeys: [makeKeyJson({bytes: 2}), makeKeyJson()],
    });
    usageMetrics = new ManualUsageMetrics();
    metricsCollector = new FakeMetricsCollector();
    publisher = new OutlineSharedMetricsPublisher(
      clock,
      serverConfig,
      keyConfig,
      usageMetrics,
      metricsCollector
    );
  });

  describe('Enable/Disable', () => {
    it('Mirrors config', () => {
      expect(publisher.isSharingEnabled()).toBeFalse();

      publisher.startSharing();
      expect(publisher.isSharingEnabled()).toBeTrue();
      expect(serverConfig.mostRecentWrite.metricsEnabled).toBeTrue();

      publisher.stopSharing();
      expect(publisher.isSharingEnabled()).toBeFalse();
      expect(serverConfig.mostRecentWrite.metricsEnabled).toBeFalse();
    });

    it('Reads from config', () => {
      serverConfig.data().metricsEnabled = true;

      expect(publisher.isSharingEnabled()).toBeTrue();
    });
  });

  describe('reporting', () => {
    beforeEach(() => {
      publisher.startSharing();
    });

    afterEach(() => {
      publisher.stopSharing();
    });

    describe('for server usage', () => {
      it('is sending correct reports', async () => {
        usageMetrics.locationUsage = [
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
      });

      it('sends ASN data if present', async () => {
        usageMetrics.locationUsage = [
          {country: 'DD', asn: 999, inboundBytes: 44},
          {country: 'EE', inboundBytes: 55},
        ];
        clock.nowMs += 60 * 60 * 1000;

        await clock.runCallbacks();

        expect(metricsCollector.collectedServerUsageReport.userReports).toEqual([
          {bytesTransferred: 44, countries: ['DD'], asn: 999},
          {bytesTransferred: 55, countries: ['EE']},
        ]);
      });

      it('resets metrics to avoid double reporting', async () => {
        usageMetrics.locationUsage = [
          {country: 'AA', inboundBytes: 11},
          {country: 'BB', inboundBytes: 11},
        ];
        clock.nowMs += 60 * 60 * 1000;
        startTime = clock.nowMs;
        await clock.runCallbacks();
        usageMetrics.locationUsage = [
          ...usageMetrics.locationUsage,
          {country: 'CC', inboundBytes: 22},
          {country: 'DD', inboundBytes: 22},
        ];
        clock.nowMs += 60 * 60 * 1000;

        await clock.runCallbacks();

        expect(metricsCollector.collectedServerUsageReport.userReports).toEqual([
          {bytesTransferred: 22, countries: ['CC']},
          {bytesTransferred: 22, countries: ['DD']},
        ]);
      });

      it('ignores sanctioned countries', async () => {
        usageMetrics.locationUsage = [
          {country: 'AA', inboundBytes: 11},
          {country: 'SY', inboundBytes: 11},
          {country: 'CC', inboundBytes: 22},
          {country: 'AA', inboundBytes: 33},
          {country: 'DD', inboundBytes: 33},
        ];
        clock.nowMs += 60 * 60 * 1000;

        await clock.runCallbacks();

        expect(metricsCollector.collectedServerUsageReport.userReports).toEqual([
          {bytesTransferred: 11, countries: ['AA']},
          {bytesTransferred: 22, countries: ['CC']},
          {bytesTransferred: 33, countries: ['AA']},
          {bytesTransferred: 33, countries: ['DD']},
        ]);
      });
    });

    describe('for feature metrics', () => {
      it('is sending correct reports', async () => {
        await clock.runCallbacks();

        expect(metricsCollector.collectedFeatureMetricsReport).toEqual({
          serverId: 'server-id',
          serverVersion: version.getPackageVersion(),
          timestampUtcMs: startTime,
          dataLimit: {
            enabled: false,
            perKeyLimitCount: 1,
          },
        });
      });

      it('reports global data limits', async () => {
        serverConfig.data().accessKeyDataLimit = {bytes: 123};

        await clock.runCallbacks();

        expect(metricsCollector.collectedFeatureMetricsReport.dataLimit.enabled).toBeTrue();
        expect(metricsCollector.collectedFeatureMetricsReport.dataLimit.perKeyLimitCount).toEqual(
          1
        );
      });

      it('reports per-key data limit count', async () => {
        delete keyConfig.data().accessKeys[0].dataLimit;

        await clock.runCallbacks();

        expect(metricsCollector.collectedFeatureMetricsReport.dataLimit.perKeyLimitCount).toEqual(
          0
        );
      });
    });
  });

  it('does not report metrics when sharing is disabled', async () => {
    spyOn(metricsCollector, 'collectServerUsageMetrics').and.callThrough();
    spyOn(metricsCollector, 'collectFeatureMetrics').and.callThrough();
    serverConfig.data().metricsEnabled = false;

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
  public locationUsage = [] as LocationUsage[];

  getLocationUsage(): Promise<LocationUsage[]> {
    return Promise.resolve(this.locationUsage);
  }

  reset() {
    this.locationUsage = [] as LocationUsage[];
  }
}

function makeKeyJson(dataLimit?: DataLimit) {
  return {
    id: uuidv4(),
    name: 'name',
    password: 'pass',
    port: 12345,
    dataLimit,
  };
}
