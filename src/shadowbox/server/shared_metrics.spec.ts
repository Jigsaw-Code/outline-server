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
import {AccessKeyId} from '../model/access_key';

import {ServerConfigJson} from './server_config';
import {HourlyServerMetricsReportJson, KeyUsage, MetricsCollectorClient, OutlineSharedMetricsPublisher, UsageMetrics} from './shared_metrics';

describe('OutlineSharedMetricsPublisher', () => {
  describe('Enable/Disable', () => {
    it('Mirrors config', () => {
      const serverConfig = new InMemoryConfig<ServerConfigJson>({});

      const publisher =
          new OutlineSharedMetricsPublisher(new ManualClock(), serverConfig, null, null, null);
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
      const publisher =
          new OutlineSharedMetricsPublisher(new ManualClock(), serverConfig, null, null, null);
      expect(publisher.isSharingEnabled()).toBeTruthy();
    });
  });
  describe('Metrics Reporting', () => {
    it('reports metrics correctly', async () => {
      const clock = new ManualClock();
      let startTime = clock.nowMs;
      const serverConfig = new InMemoryConfig<ServerConfigJson>({serverId: 'server-id'});
      const usageMetrics = new ManualUsageMetrics();
      const toMetricsId = (id: AccessKeyId) => `M(${id})`;
      const metricsCollector = new FakeMetricsCollector();
      const publisher = new OutlineSharedMetricsPublisher(
          clock, serverConfig, usageMetrics, toMetricsId, metricsCollector);

      publisher.startSharing();
      usageMetrics.usage = [
        {accessKeyId: 'user-0', inboundBytes: 11, countries: ['AA', 'BB']},
        {accessKeyId: 'user-1', inboundBytes: 22, countries: ['CC']},
        {accessKeyId: 'user-0', inboundBytes: 33, countries: ['AA', 'DD']},
      ];

      clock.nowMs += 60 * 60 * 1000;
      await clock.runCallbacks();
      expect(metricsCollector.collectedReport).toEqual({
        serverId: 'server-id',
        startUtcMs: startTime,
        endUtcMs: clock.nowMs,
        userReports: [
          {userId: 'M(user-0)', bytesTransferred: 11, countries: ['AA', 'BB']},
          {userId: 'M(user-1)', bytesTransferred: 22, countries: ['CC']},
          {userId: 'M(user-0)', bytesTransferred: 33, countries: ['AA', 'DD']},
        ]
      });

      startTime = clock.nowMs;
      usageMetrics.usage = [
        {accessKeyId: 'user-0', inboundBytes: 44, countries: ['EE']},
        {accessKeyId: 'user-2', inboundBytes: 55, countries: ['FF']},
      ];

      clock.nowMs += 60 * 60 * 1000;
      await clock.runCallbacks();
      expect(metricsCollector.collectedReport).toEqual({
        serverId: 'server-id',
        startUtcMs: startTime,
        endUtcMs: clock.nowMs,
        userReports: [
          {userId: 'M(user-0)', bytesTransferred: 44, countries: ['EE']},
          {userId: 'M(user-2)', bytesTransferred: 55, countries: ['FF']}
        ]
      });

      publisher.stopSharing();
    });
    it('ignores sanctioned countries', async () => {
      const clock = new ManualClock();
      const startTime = clock.nowMs;
      const serverConfig = new InMemoryConfig<ServerConfigJson>({serverId: 'server-id'});
      const usageMetrics = new ManualUsageMetrics();
      const toMetricsId = (id: AccessKeyId) => `M(${id})`;
      const metricsCollector = new FakeMetricsCollector();
      const publisher = new OutlineSharedMetricsPublisher(
          clock, serverConfig, usageMetrics, toMetricsId, metricsCollector);

      publisher.startSharing();
      usageMetrics.usage = [
        {accessKeyId: 'user-0', inboundBytes: 11, countries: ['AA', 'SY']},
        {accessKeyId: 'user-1', inboundBytes: 22, countries: ['CC']},
        {accessKeyId: 'user-0', inboundBytes: 33, countries: ['AA', 'DD']},
      ];

      clock.nowMs += 60 * 60 * 1000;
      await clock.runCallbacks();
      expect(metricsCollector.collectedReport).toEqual({
        serverId: 'server-id',
        startUtcMs: startTime,
        endUtcMs: clock.nowMs,
        userReports: [
          {userId: 'M(user-1)', bytesTransferred: 22, countries: ['CC']},
          {userId: 'M(user-0)', bytesTransferred: 33, countries: ['AA', 'DD']},
        ]
      });
      publisher.stopSharing();
    });
  });
});

class FakeMetricsCollector implements MetricsCollectorClient {
  public collectedReport: HourlyServerMetricsReportJson;

  collectMetrics(report) {
    this.collectedReport = report;
    return Promise.resolve();
  }
}

class ManualUsageMetrics implements UsageMetrics {
  public usage = [] as KeyUsage[];
  getUsage(): Promise<KeyUsage[]> {
    return Promise.resolve(this.usage);
  }
  reset() {
    this.usage = [] as KeyUsage[];
  }
}