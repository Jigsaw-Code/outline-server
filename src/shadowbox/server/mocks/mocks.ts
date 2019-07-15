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
import {DataUsageByUser} from '../../model/metrics';
import {ShadowsocksAccessKey, ShadowsocksServer} from '../../model/shadowsocks_server';
import {TextFile} from '../../model/text_file';
import {UsageMetrics} from '../server_access_key';

export class InMemoryFile implements TextFile {
  private savedText: string;
  constructor(private exists: boolean) {}
  readFileSync() {
    if (this.exists) {
      return this.savedText;
    } else {
      const err = new Error('no such file or directory');
      // tslint:disable-next-line:no-any
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

export class FakeUsageMetrics implements UsageMetrics {
  constructor(public usage: {[accessKeyId: string]: {[windowHours: number]: number}}) {}

  async getOutboundByteTransfer(accessKeyId: string, windowHours: number): Promise<number> {
    const accessKeyUsage = this.usage[accessKeyId];
    let usageBytes = 0;
    if (!!accessKeyUsage) {
      usageBytes = accessKeyUsage[windowHours] || 0;
    }
    return usageBytes;
  }
}

export class FakePrometheusClient extends PrometheusClient {
  constructor(private transferredBytesById: {[accessKeyId: string]: number}) {
    super('');
  }

  async query(query: string): Promise<QueryResultData> {
    const queryResultData = {} as QueryResultData;
    queryResultData.result = [];
    for (const accessKeyId of Object.keys(this.transferredBytesById)) {
      const transferredBytes = this.transferredBytesById[accessKeyId];
      queryResultData.result.push(
          {metric: {'access_key': accessKeyId}, value: [transferredBytes, `${transferredBytes}`]});
    }
    return queryResultData;
  }
}
