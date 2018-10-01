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
import * as randomstring from 'randomstring';
import * as uuidv4 from 'uuid/v4';

import {getRandomUnusedPort} from '../infrastructure/get_port';
import {IpLocationService} from '../infrastructure/ip_location';
import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyId, AccessKeyMetricsId, AccessKeyRepository} from '../model/access_key';
import {ShadowsocksInstance, ShadowsocksServer} from '../model/shadowsocks_server';

import {LibevShadowsocksServer} from './libev_shadowsocks_server';
import {UsageMetricsWriter} from './shared_metrics';

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

export function createServerAccessKeyRepository(
    proxyHostname: string, keyConfig: JsonConfig<AccessKeyConfigJson>,
    ipLocation: IpLocationService, usageWriter: UsageMetricsWriter,
    verbose: boolean): Promise<AccessKeyRepository> {
  // TODO: Set default values
  const reservedPorts = getReservedPorts(keyConfig.data().accessKeys || []);
  // Create and save the metrics socket.
  return createBoundUdpSocket(reservedPorts).then((metricsSocket) => {
    reservedPorts.add(metricsSocket.address().port);
    const shadowsocksServer =
        new LibevShadowsocksServer(proxyHostname, metricsSocket, ipLocation, usageWriter, verbose);
    return new ServerAccessKeyRepository(proxyHostname, keyConfig, shadowsocksServer);
  });
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
  private reservedPorts: Set<number> = new Set();
  private ssInstances = new Map<AccessKeyId, ShadowsocksInstance>();

  constructor(
      private proxyHostname: string, private keyConfig: JsonConfig<AccessKeyConfigJson>,
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

  createNewAccessKey(): Promise<AccessKey> {
    return getRandomUnusedPort(this.reservedPorts).then((port) => {
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
    });
  }

  removeAccessKey(id: AccessKeyId): boolean {
    for (let ai = 0; ai < this.keyConfig.data().accessKeys.length; ai++) {
      if (this.keyConfig.data().accessKeys[ai].id === id) {
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

// Gets the set of port numbers reserved by the accessKeys.
function getReservedPorts(accessKeys: AccessKeyConfig[]): Set<number> {
  const reservedPorts = new Set();
  for (const accessKeyJson of accessKeys) {
    reservedPorts.add(accessKeyJson.port);
  }
  return reservedPorts;
}

// Creates a bound UDP socket on a random unused port.
function createBoundUdpSocket(reservedPorts: Set<number>): Promise<dgram.Socket> {
  const socket = dgram.createSocket('udp4');
  return new Promise((fulfill, reject) => {
    getRandomUnusedPort(reservedPorts).then((portNumber) => {
      socket.bind(portNumber, 'localhost', () => {
        return fulfill(socket);
      });
    });
  });
}
