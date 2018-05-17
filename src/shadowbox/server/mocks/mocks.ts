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

import * as dgram from 'dgram';

import {AccessKey, AccessKeyId, AccessKeyRepository} from '../../model/access_key';
import {Stats} from '../../model/metrics';
import {ShadowsocksInstance} from '../../model/shadowsocks_server';
import {TextFile} from '../../model/text_file';

export class MockAccessKeyRepository implements AccessKeyRepository {
  private accessKeys: AccessKey[] = [];
  createNewAccessKey(): Promise<AccessKey> {
    const id = this.accessKeys.length.toString();
    const key = new MockAccessKey(
        id, 'metricsId', 'name', new MockShadowsocksInstance());
    this.accessKeys.push(key);
    return Promise.resolve(key);
  }
  removeAccessKey(id: AccessKeyId): boolean {
    for (let i = 0; i < this.accessKeys.length; ++i) {
      if (this.accessKeys[i].id === id) {
        this.accessKeys.splice(i, 1);
        return true;
      }
    }
    return false;
  }
  listAccessKeys(): IterableIterator<AccessKey> {
    return this.accessKeys[Symbol.iterator]();
  }
  renameAccessKey(id: AccessKeyId, name: string): boolean {
    for (let i = 0; i < this.accessKeys.length; ++i) {
      if (this.accessKeys[i].id === id) {
        this.accessKeys[i].name = name;
        return true;
      }
    }
    return false;
  }
}

class MockAccessKey implements AccessKey {
  constructor(
      public id: AccessKeyId,
      public metricsId: AccessKeyId,
      public name: string,
      public shadowsocksInstance: ShadowsocksInstance) {}
  public rename(name: string): void {
    this.name = name;
  }
}

class MockShadowsocksInstance implements ShadowsocksInstance {
  constructor(
      public portNumber = 12345,
      public password = 'password',
      public encryptionMethod = 'encryption',
      public accessUrl = 'ss://somethingsomething') {}
  onInboundBytes(callback: (bytes: number, ipAddresses: string[]) => void) {}
  stop() {}
}

export class MockShadowsocksServer {
  startInstance(
      portNumber: number, password: string, statsSocket: dgram.Socket,
      encryptionMethod?: string): Promise<ShadowsocksInstance> {
    const mock = new MockShadowsocksInstance(portNumber, password, encryptionMethod);
    return Promise.resolve(mock);
  }
}

export class MockStats {
  recordBytesTransferred(
      userId: AccessKeyId,
      metricsUserId: AccessKeyId,
      numBytes: number,
      ipAddresses: string[]) {}
  onLastHourMetricsReady(callback) {}
  get30DayByteTransfer() {
    return {bytesTransferredByUserId: {}};
  }
}

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
