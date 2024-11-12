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

import {PrometheusClient, QueryResultData} from '../../infrastructure/prometheus_scraper';
import {ShadowsocksAccessKey, ShadowsocksServer} from '../../model/shadowsocks_server';
import {TextFile} from '../../infrastructure/text_file';

export class InMemoryFile implements TextFile {
  private savedText: string;
  constructor(private exists: boolean) {}
  readFileSync() {
    if (this.exists) {
      return this.savedText;
    } else {
      const err = new Error('no such file or directory');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err as any).code = 'ENOENT';
      throw err;
    }
  }
  writeFileSync(text: string) {
    this.savedText = text;
    this.exists = true;
  }
}

export class FakeShadowsocksServer implements ShadowsocksServer {
  private accessKeys: ShadowsocksAccessKey[] = [];

  update(keys: ShadowsocksAccessKey[]) {
    this.accessKeys = keys;
    return Promise.resolve();
  }

  getAccessKeys() {
    return this.accessKeys;
  }
}

export class FakePrometheusClient extends PrometheusClient {
  constructor(public bytesTransferredById: {[accessKeyId: string]: number}) {
    super('');
  }

  async query(_query: string): Promise<QueryResultData> {
    const queryResultData = {result: []} as QueryResultData;
    for (const accessKeyId of Object.keys(this.bytesTransferredById)) {
      const bytesTransferred = this.bytesTransferredById[accessKeyId] || 0;
      queryResultData.result.push({
        metric: {access_key: accessKeyId},
        value: [Date.now() / 1000, `${bytesTransferred}`],
      });
    }
    return queryResultData;
  }
}

interface FakeAccessKeyPrometheusClientMetric {
  accessKeyId: number | string;
  location?: string;
  asn?: number;
  asOrg?: string;
  tunnelTime?: {
    seconds: number;
  };
  dataTransferred: {
    bytes: number;
  };
}

export class FakeAccessKeyPrometheusClient extends PrometheusClient {
  constructor(public rawAccessKeyMetrics: FakeAccessKeyPrometheusClientMetric[]) {
    super('');
  }

  async query(_query: string): Promise<QueryResultData> {
    const queryResultData = {result: []} as QueryResultData;

    if (_query.startsWith('sum(increase(shadowsocks_data_bytes_per_location')) {
      const locations = {};

      for (const {location, asn, asOrg, dataTransferred} of this.rawAccessKeyMetrics) {
        const locationKey = `${location},${asn},${asOrg}`;

        locations[locationKey] ??= 0;
        locations[locationKey] += dataTransferred.bytes;
      }

      for (const [locationKey, bytes] of Object.entries(locations)) {
        const [location, asn, asorg] = locationKey.split(',');
        queryResultData.result.push({
          metric: {location, asn, asorg},
          value: [Date.now() / 1000, `${bytes}`],
        });
      }
    } else if (_query.startsWith('sum(increase(shadowsocks_tunnel_time_seconds_per_location')) {
      const locations = {};

      for (const {location, asn, asOrg, tunnelTime} of this.rawAccessKeyMetrics) {
        const locationKey = `${location},${asn},${asOrg}`;

        locations[locationKey] ??= 0;
        locations[locationKey] += tunnelTime.seconds;
      }

      for (const [locationKey, seconds] of Object.entries(locations)) {
        const [location, asn, asorg] = locationKey.split(',');
        queryResultData.result.push({
          metric: {location, asn, asorg},
          value: [Date.now() / 1000, `${seconds}`],
        });
      }
    } else if (_query.startsWith('sum(increase(shadowsocks_data_bytes')) {
      for (const {accessKeyId, dataTransferred} of this.rawAccessKeyMetrics) {
        queryResultData.result.push({
          metric: {access_key: `${accessKeyId}`},
          value: [Date.now() / 1000, `${dataTransferred.bytes}`],
        });
      }
    } else if (_query.startsWith('sum(increase(shadowsocks_tunnel_time_seconds')) {
      for (const {accessKeyId, tunnelTime} of this.rawAccessKeyMetrics) {
        queryResultData.result.push({
          metric: {access_key: `${accessKeyId}`},
          value: [Date.now() / 1000, `${tunnelTime.seconds}`],
        });
      }
    }

    return queryResultData;
  }
}
