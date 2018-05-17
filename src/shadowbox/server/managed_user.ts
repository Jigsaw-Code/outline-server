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

import * as child_process from 'child_process';
import * as dgram from 'dgram';
import * as randomstring from 'randomstring';
import * as uuidv4 from 'uuid/v4';

import {getRandomUnusedPort} from '../infrastructure/get_port';
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyId, AccessKeyRepository} from '../model/access_key';
import {Stats} from '../model/metrics';
import {ShadowsocksInstance, ShadowsocksServer} from '../model/shadowsocks_server';
import {TextFile} from '../model/text_file';

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
interface ConfigJson {
  accessKeys: AccessKeyConfig[];
  // Next AccessKeyId to use.
  nextId: number;
}

// AccessKey implementation that starts and stops a Shadowsocks server.
class ManagedAccessKey implements AccessKey {
  constructor(public id: AccessKeyId, public metricsId: AccessKeyId, public name: string, public shadowsocksInstance: ShadowsocksInstance) {}

  public rename(name: string): void {
    this.name = name;
  }
}

// Generates a random password for Shadowsocks access keys.
function generatePassword(): string {
  return randomstring.generate(12);
}

function readConfig(configFile: TextFile): ConfigJson {
  const EMPTY_CONFIG = {accessKeys: [], nextId: 0} as ConfigJson;

  // Try to read the file from disk.
  let configText: string;
  try {
    configText = configFile.readFileSync();
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File not found (e.g. this is a new server), return an empty config.
      return EMPTY_CONFIG;
    }
    throw err;
  }

  // Ignore if the config file is empty.
  if (!configText) {
    return EMPTY_CONFIG;
  }

  return JSON.parse(configText) as ConfigJson;
}

export function createManagedAccessKeyRepository(
    configFile: TextFile,
    shadowsocksServer: ShadowsocksServer,
    stats: Stats): Promise<AccessKeyRepository> {
  const repo = new ManagedAccessKeyRepository(configFile, shadowsocksServer, stats);
  return repo.init().then(() => {
    return repo;
  });
}

// AccessKeyRepository that keeps its state in a config file and uses ManagedAccessKey
// to start and stop per-access-key Shadowsocks instances.
class ManagedAccessKeyRepository implements AccessKeyRepository {
  private accessKeys = new Map<AccessKeyId, ManagedAccessKey>();
  // This is the max id + 1 among all access keys. Used to generate unique ids for new access keys.
  private nextId = 0;
  private NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
  private statsSocket: dgram.Socket;
  private reservedPorts: Set<number> = new Set();

  constructor(
      private configFile: TextFile, private shadowsocksServer: ShadowsocksServer,
      private stats: Stats) {
  }

  // Initialize the repository from the config file.
  public init(): Promise<void> {
    const configJson = readConfig(this.configFile);
    const accessKeys = configJson.accessKeys;
    this.nextId = configJson.nextId;

    this.reservedPorts = getReservedPorts(accessKeys);

    // Create and save the stats socket.
    return createBoundUdpSocket(this.reservedPorts).then((statsSocket) => {
      this.statsSocket = statsSocket;
      this.reservedPorts.add(statsSocket.address().port);

      // Start an instance for each access key.
      const startInstancePromises = [];
      for (const accessKeyJson of accessKeys) {
        startInstancePromises.push(
            this.shadowsocksServer
                .startInstance(
                    accessKeyJson.port, accessKeyJson.password, statsSocket,
                    accessKeyJson.encryptionMethod)
                .then((ssInstance) => {
                  ssInstance.onInboundBytes(this.handleInboundBytes.bind(
                      this, accessKeyJson.id, accessKeyJson.metricsId));
                  const accessKey = new ManagedAccessKey(
                      accessKeyJson.id, accessKeyJson.metricsId, accessKeyJson.name, ssInstance);
                  this.accessKeys.set(accessKey.id, accessKey);
                  const idAsNumber = parseInt(accessKey.id, 10);
                }));
      }
      return Promise.all(startInstancePromises).then(() => {
        return Promise.resolve();
      });
    });
  }

  public createNewAccessKey(): Promise<AccessKey> {
    return getRandomUnusedPort(this.reservedPorts).then((port) => {
      return this.shadowsocksServer
          .startInstance(
              port, generatePassword(), this.statsSocket, this.NEW_USER_ENCRYPTION_METHOD)
          .then((ssInstance) => {
            this.reservedPorts.add(port);
            const id = this.allocateId();
            const metricsId = uuidv4();
            ssInstance.onInboundBytes(this.handleInboundBytes.bind(this, id, metricsId));
            const accessKey = new ManagedAccessKey(id, metricsId, '', ssInstance);
            this.accessKeys.set(accessKey.id, accessKey);
            this.persistState();
            return accessKey;
          });
    });
  }

  public removeAccessKey(id: AccessKeyId): boolean {
    const accessKey = this.accessKeys.get(id);
    if (!accessKey) {
      return false;
    }
    accessKey.shadowsocksInstance.stop();
    this.accessKeys.delete(accessKey.id);
    this.persistState();
    return true;
  }

  public listAccessKeys(): IterableIterator<AccessKey> {
    return this.accessKeys.values();
  }

  public renameAccessKey(id: AccessKeyId, name: string): boolean {
    const accessKey = this.accessKeys.get(id);
    if (!accessKey) {
      return false;
    }
    accessKey.rename(name);
    this.persistState();
    return true;
  }

  private handleInboundBytes(accessKeyId: AccessKeyId, metricsId: AccessKeyId, inboundBytes: number, ipAddresses: string[]) {
    this.stats.recordBytesTransferred(accessKeyId, metricsId, inboundBytes, ipAddresses);
  }

  private allocateId(): AccessKeyId {
    const allocatedId = this.nextId;
    this.nextId += 1;
    return allocatedId.toString();
  }

  private serializeState() {
    return JSON.stringify({
      accessKeys: Array.from(this.accessKeys.values()).map(managedAccessKeytoJson),
      nextId: this.nextId
    });
  }

  // Save the repository to the local disk.
  // TODO(fortuna): Fix race condition. This can break if there are two modifications in parallel.
  // TODO: this method should return an error if it fails to write to disk,
  // then this error can be propagated back to the manager via the REST
  // API, so users know there was an error and access keys may not be
  // persisted.
  private persistState() {
    const state = this.serializeState();
    logging.info(`Persisting: ${state}`);
    this.configFile.writeFileSync(state);
  }
}

function managedAccessKeytoJson(accessKey: ManagedAccessKey) {
  return {
    id: accessKey.id,
    metricsId: accessKey.metricsId,
    name: accessKey.name,
    password: accessKey.shadowsocksInstance.password,
    port: accessKey.shadowsocksInstance.portNumber,
    encryptionMethod: accessKey.shadowsocksInstance.encryptionMethod
  };
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
