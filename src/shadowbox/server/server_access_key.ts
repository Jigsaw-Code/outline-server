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

import * as randomstring from 'randomstring';
import * as uuidv4 from 'uuid/v4';

import {PortProvider} from '../infrastructure/get_port';
import {JsonConfig} from '../infrastructure/json_config';
import {AccessKey, AccessKeyId, AccessKeyMetricsId, AccessKeyRepository} from '../model/access_key';
import {ShadowsocksServer} from '../model/shadowsocks_server';
import {ServerConfigJson} from './server_config';

// The format as json of access keys in the config file.
interface AccessKeyConfig {
  id: AccessKeyId;
  metricsId: AccessKeyId;
  name: string;
  password: string;
  port: number;
  encryptionMethod?: string;
}

// The configuration file format as json.
export interface AccessKeyConfigJson {
  accessKeys?: AccessKeyConfig[];
  // Next AccessKeyId to use.
  nextId?: number;

  // DEPRECATED: Use ServerConfigJson.portForNewAccessKeys instead.
  defaultPort?: number;
}

// Generates a random password for Shadowsocks access keys.
function generatePassword(): string {
  return randomstring.generate(12);
}

function makeAccessKey(hostname: string, accessKeyJson: AccessKeyConfig): AccessKey {
  return {
    id: accessKeyJson.id,
    name: accessKeyJson.name,
    metricsId: accessKeyJson.metricsId,
    proxyParams: {
      hostname,
      portNumber: accessKeyJson.port,
      encryptionMethod: accessKeyJson.encryptionMethod,
      password: accessKeyJson.password,
    }
  };
}

// AccessKeyRepository that keeps its state in a config file and uses ShadowsocksServer
// to start and stop per-access-key Shadowsocks instances.
export class ServerAccessKeyRepository implements AccessKeyRepository {
  // This is the max id + 1 among all access keys. Used to generate unique ids for new access keys.
  private NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
  private portForNewAccessKeys: number|undefined;

  constructor(
      private portProvider: PortProvider, private proxyHostname: string,
      private keyConfig: JsonConfig<AccessKeyConfigJson>,
      private shadowsocksServer: ShadowsocksServer) {
    if (this.keyConfig.data().accessKeys === undefined) {
      this.keyConfig.data().accessKeys = [];
    }
    if (this.keyConfig.data().nextId === undefined) {
      this.keyConfig.data().nextId = 0;
    }
    this.updateServer();
  }

  enableSinglePort(portForNewAccessKeys: number) {
    this.portForNewAccessKeys = portForNewAccessKeys;
  }

  async createNewAccessKey(): Promise<AccessKey> {
    const port = this.portForNewAccessKeys || await this.portProvider.reserveNewPort();
    const id = this.keyConfig.data().nextId.toString();
    this.keyConfig.data().nextId += 1;
    const metricsId = uuidv4();
    const password = generatePassword();
    // Save key
    const accessKeyJson: AccessKeyConfig = {
      id,
      metricsId,
      name: '',
      port,
      encryptionMethod: this.NEW_USER_ENCRYPTION_METHOD,
      password
    };
    this.keyConfig.data().accessKeys.push(accessKeyJson);
    try {
      this.keyConfig.write();
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
    await this.updateServer();
    return makeAccessKey(this.proxyHostname, accessKeyJson);
  }

  removeAccessKey(id: AccessKeyId): boolean {
    for (let ai = 0; ai < this.keyConfig.data().accessKeys.length; ai++) {
      const accessKey = this.keyConfig.data().accessKeys[ai];
      if (accessKey.id === id) {
        this.portProvider.freePort(accessKey.port);
        this.keyConfig.data().accessKeys.splice(ai, 1);
        this.keyConfig.write();
        this.updateServer();
        return true;
      }
    }
    return false;
  }

  listAccessKeys(): IterableIterator<AccessKey> {
    return this.keyConfig.data().accessKeys.map(
        accessKeyJson => makeAccessKey(this.proxyHostname, accessKeyJson))[Symbol.iterator]();
  }

  renameAccessKey(id: AccessKeyId, name: string): boolean {
    const accessKeyJson = this.getAccessKey(id);
    if (!accessKeyJson) {
      return false;
    }
    accessKeyJson.name = name;
    try {
      this.keyConfig.write();
    } catch (error) {
      return false;
    }
    return true;
  }

  getMetricsId(id: AccessKeyId): AccessKeyMetricsId|undefined {
    const accessKeyJson = this.getAccessKey(id);
    return accessKeyJson ? accessKeyJson.metricsId : undefined;
  }

  private updateServer(): Promise<void> {
    return this.shadowsocksServer.update(this.keyConfig.data().accessKeys.map((e) => {
      return {id: e.id, port: e.port, cipher: e.encryptionMethod, secret: e.password};
    }));
  }

  private getAccessKey(id: AccessKeyId): AccessKeyConfig {
    for (const accessKeyJson of this.keyConfig.data().accessKeys) {
      if (accessKeyJson.id === id) {
        return accessKeyJson;
      }
    }
    return undefined;
  }
}
