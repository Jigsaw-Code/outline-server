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
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyId, AccessKeyMetricsId, AccessKeyRepository} from '../model/access_key';
import {ShadowsocksInstance, ShadowsocksServer} from '../model/shadowsocks_server';

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
  private ssInstances = new Map<AccessKeyId, ShadowsocksInstance>();

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
    for (const accessKeyJson of this.keyConfig.data().accessKeys) {
      this.startInstance(accessKeyJson).catch((error) => {
        logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
      });
    }
  }

  async createNewAccessKey(): Promise<AccessKey> {
    const port = await this.portProvider.reserveNewPort();
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
    this.startInstance(accessKeyJson).catch((error) => {
      logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
    });
    return makeAccessKey(this.proxyHostname, accessKeyJson);
  }

  removeAccessKey(id: AccessKeyId): boolean {
    for (let ai = 0; ai < this.keyConfig.data().accessKeys.length; ai++) {
      const accessKey = this.keyConfig.data().accessKeys[ai];
      if (accessKey.id === id) {
        this.portProvider.freePort(accessKey.port);
        this.keyConfig.data().accessKeys.splice(ai, 1);
        this.keyConfig.write();
        this.ssInstances.get(id).stop();
        this.ssInstances.delete(id);
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

  private getAccessKey(id: AccessKeyId): AccessKeyConfig {
    for (const accessKeyJson of this.keyConfig.data().accessKeys) {
      if (accessKeyJson.id === id) {
        return accessKeyJson;
      }
    }
    return undefined;
  }

  private startInstance(accessKeyJson: AccessKeyConfig): Promise<void> {
    return this.shadowsocksServer
        .startInstance(
            accessKeyJson.id, accessKeyJson.port, accessKeyJson.password,
            accessKeyJson.encryptionMethod)
        .then((ssInstance) => {
          this.ssInstances.set(accessKeyJson.id, ssInstance);
        });
  }
}
