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
import {InMemoryConfig} from '../infrastructure/json_config';
import {AccessKeyId} from '../model/access_key';

import {ServerConfigJson} from './server_config';
import {HourlyServerMetricsReportJson, InMemoryUsageMetrics, MetricsCollectorClient, OutlineSharedMetricsPublisher} from './shared_metrics';

describe('InMemoryUsageMetrics', () => {
  it('Returns empty usage initially', (done) => {
    const metrics = new InMemoryUsageMetrics();
    expect(metrics.getUsage()).toEqual([]);
    done();
  });
  it('Records usage', (done) => {
    const metrics = new InMemoryUsageMetrics();
    metrics.writeBytesTransferred('user-0', 11, ['AA']);
    metrics.writeBytesTransferred('user-1', 22, ['BB']);
    metrics.writeBytesTransferred('user-0', 33, ['CC']);
    metrics.writeBytesTransferred('user-1', 44, ['BB']);
    metrics.writeBytesTransferred('user-2', 55, ['']);
    expect(metrics.getUsage().sort()).toEqual([
      {accessKeyId: 'user-0', inboundBytes: 11, countries: ['AA']},
      {accessKeyId: 'user-1', inboundBytes: 66, countries: ['BB']},
      {accessKeyId: 'user-0', inboundBytes: 33, countries: ['CC']},
      {accessKeyId: 'user-2', inboundBytes: 55, countries: ['']}
    ]);
    done();
  });
  it('Ignores sanctioned countries', (done) => {
    const metrics = new InMemoryUsageMetrics();
    metrics.writeBytesTransferred('user-0', 11, ['AA']);
    metrics.writeBytesTransferred('user-0', 22, ['IR']);  // Sanctioned
    expect(metrics.getUsage().sort()).toEqual([
      {accessKeyId: 'user-0', inboundBytes: 11, countries: ['AA']},
    ]);
    done();
  });
});

describe('OutlineSharedMetricsPublisher', () => {
  describe('Enable/Disable', () => {
    it('Mirrors config', (done) => {
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

      done();
    });
    it('Reads from config', (done) => {
      const serverConfig = new InMemoryConfig<ServerConfigJson>({metricsEnabled: true});
      const publisher =
          new OutlineSharedMetricsPublisher(new ManualClock(), serverConfig, null, null, null);
      expect(publisher.isSharingEnabled()).toBeTruthy();
      done();
    });
  });
  describe('Metrics Reporting', () => {
    it('Reports metrics correctly', (done) => {
      const clock = new ManualClock();
      let startTime = clock.nowMs;
      const serverConfig = new InMemoryConfig<ServerConfigJson>({serverId: 'server-id'});
      const usageMetrics = new InMemoryUsageMetrics();
      const toMetricsId = (id: AccessKeyId) => `M(${id})`;
      const metricsCollector = new FakeMetricsCollector();
      const publisher = new OutlineSharedMetricsPublisher(
          clock, serverConfig, usageMetrics, toMetricsId, metricsCollector);

      publisher.startSharing();
      usageMetrics.writeBytesTransferred('user-0', 11, ['AA', 'BB']);
      usageMetrics.writeBytesTransferred('user-1', 22, ['CC']);
      usageMetrics.writeBytesTransferred('user-0', 33, ['AA', 'DD']);

      clock.nowMs += 60 * 60 * 1000;
      clock.runCallbacks();
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
      usageMetrics.writeBytesTransferred('user-0', 44, ['EE']);
      usageMetrics.writeBytesTransferred('user-2', 55, ['FF']);

      clock.nowMs += 60 * 60 * 1000;
      clock.runCallbacks();
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
      done();
    });
  });
});

class ManualClock implements Clock {
  public nowMs = 0;
  private callbacks = [] as Function[];

  constructor() {}

  now() {
    return this.nowMs;
  }

  setInterval(callback, intervalMs) {
    this.callbacks.push(callback);
    return 0;
  }

  runCallbacks() {
    for (const callback of this.callbacks) {
      callback();
    }
  }
}

class FakeMetricsCollector implements MetricsCollectorClient {
  public collectedReport: HourlyServerMetricsReportJson;

  collectMetrics(report) {
    this.collectedReport = report;
    return Promise.resolve();
  }
}
