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

import {Clock} from '../infrastructure/clock';
import {isPortUsed} from '../infrastructure/get_port';
import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {AccessKey, AccessKeyDataLimit, AccessKeyDataLimitUsage, AccessKeyId, AccessKeyMetricsId, AccessKeyRepository, ProxyParams} from '../model/access_key';
import * as errors from '../model/errors';
import {DataUsageTimeframe} from '../model/metrics';
import {ShadowsocksServer} from '../model/shadowsocks_server';
import {PrometheusManagerMetrics} from './manager_metrics';

// The format as json of access keys in the config file.
interface AccessKeyJson {
  id: AccessKeyId;
  metricsId: AccessKeyId;
  name: string;
  password: string;
  port: number;
  encryptionMethod?: string;
  limit?: AccessKeyDataLimit;
}

// The configuration file format as json.
export interface AccessKeyConfigJson {
  accessKeys?: AccessKeyJson[];
  // Next AccessKeyId to use.
  nextId?: number;
}

// AccessKey implementation with write access enabled on properties that may change.
class ServerAccessKey implements AccessKey {
  constructor(
      readonly id: AccessKeyId, public name: string, public metricsId: AccessKeyMetricsId,
      readonly proxyParams: ProxyParams, public dataLimitUsage?: AccessKeyDataLimitUsage) {}

  isOverDataLimit(): boolean {
    if (!this.dataLimitUsage) {
      return false;
    }
    return this.dataLimitUsage.usageBytes > this.dataLimitUsage.limit.bytes;
  }
}

function isValidAccessKeyDataLimit(limit: AccessKeyDataLimit) {
  return limit && Number.isInteger(limit.bytes) && limit.bytes >= 0;
}

// Generates a random password for Shadowsocks access keys.
function generatePassword(): string {
  return randomstring.generate(12);
}

function makeAccessKey(hostname: string, accessKeyJson: AccessKeyJson): AccessKey {
  const proxyParams = {
    hostname,
    portNumber: accessKeyJson.port,
    encryptionMethod: accessKeyJson.encryptionMethod,
    password: accessKeyJson.password,
  };
  const dataLimitUsage =
      accessKeyJson.limit ? {limit: accessKeyJson.limit, usageBytes: 0} : undefined;
  return new ServerAccessKey(
      accessKeyJson.id, accessKeyJson.name, accessKeyJson.metricsId, proxyParams, dataLimitUsage);
}

function makeAccessKeyJson(accessKey: AccessKey): AccessKeyJson {
  return {
    id: accessKey.id,
    metricsId: accessKey.metricsId,
    name: accessKey.name,
    password: accessKey.proxyParams.password,
    port: accessKey.proxyParams.portNumber,
    encryptionMethod: accessKey.proxyParams.encryptionMethod,
    limit: accessKey.dataLimitUsage ? accessKey.dataLimitUsage.limit : undefined
  };
}

// AccessKeyRepository that keeps its state in a config file and uses ShadowsocksServer
// to start and stop per-access-key Shadowsocks instances.  Requires external validation
// that portForNewAccessKeys is valid.
export class ServerAccessKeyRepository implements AccessKeyRepository {
  private static DATA_LIMITS_ENFORCEMENT_INTERVAL_MS = 60 * 60 * 1000;  // 1h
  private NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
  private accessKeys: ServerAccessKey[];

  constructor(
      private portForNewAccessKeys: number, private proxyHostname: string,
      private keyConfig: JsonConfig<AccessKeyConfigJson>,
      private shadowsocksServer: ShadowsocksServer, private prometheusClient: PrometheusClient,
      private dataLimitTimeframe: DataUsageTimeframe) {
    if (this.keyConfig.data().accessKeys === undefined) {
      this.keyConfig.data().accessKeys = [];
    }
    if (this.keyConfig.data().nextId === undefined) {
      this.keyConfig.data().nextId = 0;
    }
    this.accessKeys = this.loadAccessKeys();
  }

  // Starts the Shadowsocks server and exposes the access key configuration to the server.
  // Periodically enforces access key limits.
  async start(clock: Clock): Promise<void> {
    await this.enforceAccessKeyDataLimits();
    await this.updateServer();
    clock.setInterval(async () => {
      try {
        await this.enforceAccessKeyDataLimits();
      } catch (e) {
        logging.error(`Failed to enforce access key limits: ${e}`);
      }
    }, ServerAccessKeyRepository.DATA_LIMITS_ENFORCEMENT_INTERVAL_MS);
  }

  private isExistingAccessKeyPort(port: number): boolean {
    return this.accessKeys.some((key) => {
      return key.proxyParams.portNumber === port;
    });
  }

  async setPortForNewAccessKeys(port: number): Promise<void> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new errors.InvalidPortNumber(port.toString());
    }
    if (!this.isExistingAccessKeyPort(port) && await isPortUsed(port)) {
      throw new errors.PortUnavailable(port);
    }
    this.portForNewAccessKeys = port;
  }

  async createNewAccessKey(): Promise<AccessKey> {
    const id = this.keyConfig.data().nextId.toString();
    this.keyConfig.data().nextId += 1;
    const metricsId = uuidv4();
    const password = generatePassword();
    const proxyParams = {
      hostname: this.proxyHostname,
      portNumber: this.portForNewAccessKeys,
      encryptionMethod: this.NEW_USER_ENCRYPTION_METHOD,
      password,
    };
    const accessKey = new ServerAccessKey(id, '', metricsId, proxyParams, undefined);
    this.accessKeys.push(accessKey);
    this.saveAccessKeys();
    await this.updateServer();
    return accessKey;
  }

  removeAccessKey(id: AccessKeyId) {
    for (let ai = 0; ai < this.accessKeys.length; ai++) {
      const accessKey = this.accessKeys[ai];
      if (accessKey.id === id) {
        this.accessKeys.splice(ai, 1);
        this.saveAccessKeys();
        this.updateServer();
        return;
      }
    }
    throw new errors.AccessKeyNotFound(id);
  }

  listAccessKeys(): AccessKey[] {
    return [...this.accessKeys];  // Return a copy of the access key array.
  }

  renameAccessKey(id: AccessKeyId, name: string) {
    const accessKey = this.getAccessKey(id);
    accessKey.name = name;
    this.saveAccessKeys();
  }

  async setAccessKeyDataLimit(id: AccessKeyId, limit: AccessKeyDataLimit) {
    if (!isValidAccessKeyDataLimit(limit)) {
      throw new errors.InvalidAccessKeyDataLimit();
    }
    const accessKey = this.getAccessKey(id);
    const usageBytes = await this.getUsageBytes(id);
    const limitStatusChanged = this.updateAccessKeyDataLimitStatus(accessKey, {limit, usageBytes});
    this.saveAccessKeys();
    if (limitStatusChanged) {
      await this.updateServer();
    }
  }

  async removeAccessKeyDataLimit(id: AccessKeyId) {
    const accessKey = this.getAccessKey(id);
    const wasOverDataLimit = this.updateAccessKeyDataLimitStatus(accessKey, undefined);
    this.saveAccessKeys();
    if (wasOverDataLimit) {
      await this.updateServer();
    }
  }

  async setDataLimitTimeframe(timeframe: DataUsageTimeframe) {
    if (!timeframe || !Number.isInteger(timeframe.hours) || timeframe.hours < 0) {
      throw new errors.InvalidDataLimitTimeframe();
    }
    this.dataLimitTimeframe = timeframe;
    await this.enforceAccessKeyDataLimits();
  }

  getDataLimitTimeframe(): DataUsageTimeframe {
    return this.dataLimitTimeframe;
  }

  getMetricsId(id: AccessKeyId): AccessKeyMetricsId|undefined {
    const accessKey = this.getAccessKey(id);
    return accessKey ? accessKey.metricsId : undefined;
  }

  // Compares access key usage with collected metrics, marking them as under or over limit.
  async enforceAccessKeyDataLimits() {
    const accessKeysWithDataLimits = this.accessKeys.filter(key => !!key.dataLimitUsage);
    if (accessKeysWithDataLimits.length === 0) {
      return;
    }
    const metrics = new PrometheusManagerMetrics(this.prometheusClient);
    const bytesTransferredById =
        (await metrics.getOutboundByteTransfer(this.dataLimitTimeframe)).bytesTransferredByUserId;
    let limitStatusChanged = false;
    for (const accessKey of accessKeysWithDataLimits) {
      const dataLimitUsage = {
        limit: accessKey.dataLimitUsage.limit,
        usageBytes: bytesTransferredById[accessKey.id] || 0
      };
      limitStatusChanged =
          this.updateAccessKeyDataLimitStatus(accessKey, dataLimitUsage) || limitStatusChanged;
    }
    if (limitStatusChanged) {
      await this.updateServer();
    }
  }

  // Updates `accessKey` data limit status by recording `dataLimitUsage`.
  // Returns whether the limit status changed.
  private updateAccessKeyDataLimitStatus(
      accessKey: ServerAccessKey, dataLimitUsage?: AccessKeyDataLimitUsage): boolean {
    const wasOverDataLimit = accessKey.isOverDataLimit();
    accessKey.dataLimitUsage = dataLimitUsage;
    return accessKey.isOverDataLimit() !== wasOverDataLimit;
  }

  // Retrieves access key outbound data transfer in bytes for `accessKeyId` from a Prometheus
  // instance.
  async getUsageBytes(accessKeyId: string): Promise<number> {
    const escapedAccessKeyId = JSON.stringify(accessKeyId);
    let bytesTransferred = 0;
    const result = await this.prometheusClient.query(
        `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t",access_key=${escapedAccessKeyId}}[${
            this.dataLimitTimeframe.hours}h])) by (access_key)`);
    if (result && result.result[0] && result.result[0].metric['access_key'] === accessKeyId &&
        result.result[0].value && result.result[0].value.length > 1) {
      bytesTransferred = Math.round(parseFloat(result.result[0].value[1])) || 0;
    }
    return bytesTransferred;
  }

  private updateServer(): Promise<void> {
    const serverAccessKeys = this.accessKeys.filter(key => !key.isOverDataLimit()).map(key => {
      return {
        id: key.id,
        port: key.proxyParams.portNumber,
        cipher: key.proxyParams.encryptionMethod,
        secret: key.proxyParams.password
      };
    });
    return this.shadowsocksServer.update(serverAccessKeys);
  }

  private loadAccessKeys(): AccessKey[] {
    return this.keyConfig.data().accessKeys.map(key => makeAccessKey(this.proxyHostname, key));
  }

  private saveAccessKeys() {
    this.keyConfig.data().accessKeys = this.accessKeys.map(key => makeAccessKeyJson(key));
    this.keyConfig.write();
  }

  // Returns a reference to the access key with `id`, or throws if the key is not found.
  private getAccessKey(id: AccessKeyId): ServerAccessKey {
    for (const accessKey of this.accessKeys) {
      if (accessKey.id === id) {
        return accessKey;
      }
    }
    throw new errors.AccessKeyNotFound(id);
  }
}
