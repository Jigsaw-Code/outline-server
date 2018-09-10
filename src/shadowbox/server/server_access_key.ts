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
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyId, AccessKeyRepository} from '../model/access_key';
import {ShadowsocksInstance, ShadowsocksServer} from '../model/shadowsocks_server';
import {TextFile} from '../model/text_file';

import {ManagerStats} from './manager_metrics';
import {SharedStats} from './shared_metrics';

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

// Generates a random password for Shadowsocks access keys.
function generatePassword(): string {
  return randomstring.generate(12);
}

// AccessKeyConfigFile can load and save ConfigJsons from and to a file.
class AccessKeyConfigFile {
  constructor(private configFile: TextFile) {}

  loadConfig(): ConfigJson {
    const EMPTY_CONFIG = {accessKeys: [], nextId: 0} as ConfigJson;

    // Try to read the file from disk.
    let configText: string;
    try {
      configText = this.configFile.readFileSync();
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

  // Save the repository to the local disk.
  // Throws an error in case of failure.
  // TODO(fortuna): Fix race condition. This can break if there are two modifications in parallel.
  // TODO: this method should return an error if it fails to write to disk,
  // then this error can be propagated back to the manager via the REST
  // API, so users know there was an error and access keys may not be
  // persisted.
  saveConfig(config: ConfigJson) {
    const text = JSON.stringify(config);
    logging.info(`Persisting: ${text}`);
    this.configFile.writeFileSync(text);
  }
}

export function createServerAccessKeyRepository(
    proxyHostname: string, textFile: TextFile, shadowsocksServer: ShadowsocksServer,
    managerMetrics: ManagerStats, sharedMetrics: SharedStats): Promise<AccessKeyRepository> {
  const configFile = new AccessKeyConfigFile(textFile);
  const configJson = configFile.loadConfig();

  const reservedPorts = getReservedPorts(configJson.accessKeys);
  // Create and save the stats socket.
  return createBoundUdpSocket(reservedPorts).then((statsSocket) => {
    reservedPorts.add(statsSocket.address().port);
    return new ServerAccessKeyRepository(
        proxyHostname, configFile, configJson, shadowsocksServer, statsSocket, managerMetrics,
        sharedMetrics);
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
class ServerAccessKeyRepository implements AccessKeyRepository {
  // This is the max id + 1 among all access keys. Used to generate unique ids for new access keys.
  private NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
  private reservedPorts: Set<number> = new Set();
  private ssInstances = new Map<AccessKeyId, ShadowsocksInstance>();

  constructor(
      private proxyHostname: string, private configFile: AccessKeyConfigFile,
      private configJson: ConfigJson, private shadowsocksServer: ShadowsocksServer,
      private statsSocket: dgram.Socket, private managerMetrics: ManagerStats,
      private sharedMetrics: SharedStats) {
    for (const accessKeyJson of this.configJson.accessKeys) {
      this.startInstance(accessKeyJson).catch((error) => {
        logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
      });
    }
  }

  public createNewAccessKey(): Promise<AccessKey> {
    return getRandomUnusedPort(this.reservedPorts).then((port) => {
      const id = this.configJson.nextId.toString();
      this.configJson.nextId += 1;
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
      this.configJson.accessKeys.push(accessKeyJson);
      try {
        this.saveConfig();
      } catch (error) {
        throw new Error(`Failed to save config: ${error}`);
      }

      this.startInstance(accessKeyJson).catch((error) => {
        logging.error(`Failed to start Shadowsocks instance for key ${accessKeyJson.id}: ${error}`);
      });
      return makeAccessKey(this.proxyHostname, accessKeyJson);
    });
  }

  public removeAccessKey(id: AccessKeyId): boolean {
    for (let ai = 0; ai < this.configJson.accessKeys.length; ai++) {
      if (this.configJson.accessKeys[ai].id === id) {
        this.configJson.accessKeys.splice(ai, 1);
        this.saveConfig();
        this.ssInstances.get(id).stop();
        this.ssInstances.delete(id);
        return true;
      }
    }
    return false;
  }

  public listAccessKeys(): IterableIterator<AccessKey> {
    return this.configJson.accessKeys.map(
        accessKeyJson => makeAccessKey(this.proxyHostname, accessKeyJson))[Symbol.iterator]();
  }

  public renameAccessKey(id: AccessKeyId, name: string): boolean {
    for (const accessKeyJson of this.configJson.accessKeys) {
      if (accessKeyJson.id === id) {
        accessKeyJson.name = name;
        try {
          this.saveConfig();
        } catch (error) {
          return false;
        }
        return true;
      }
    }
    return false;
  }

  private startInstance(accessKeyJson: AccessKeyConfig): Promise<void> {
    return this.shadowsocksServer
        .startInstance(
            accessKeyJson.port, accessKeyJson.password, this.statsSocket,
            accessKeyJson.encryptionMethod)
        .then((ssInstance) => {
          ssInstance.onInboundBytes(
              this.handleInboundBytes.bind(this, accessKeyJson.id, accessKeyJson.metricsId));
          this.ssInstances.set(accessKeyJson.id, ssInstance);
        });
  }

  private handleInboundBytes(
      accessKeyId: AccessKeyId, metricsId: AccessKeyId, inboundBytes: number,
      ipAddresses: string[]) {
    this.managerMetrics.recordBytesTransferred(new Date(), accessKeyId, inboundBytes);
    this.sharedMetrics.recordBytesTransferred(metricsId, inboundBytes, ipAddresses);
  }

  private saveConfig() {
    this.configFile.saveConfig(this.configJson);
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
