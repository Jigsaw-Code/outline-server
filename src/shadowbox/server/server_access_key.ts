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
import {isPortUsed, PortProvider} from '../infrastructure/get_port';
import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {PrometheusClient} from '../infrastructure/prometheus_scraper';
import {AccessKey, AccessKeyId, AccessKeyMetricsId, AccessKeyQuota, AccessKeyQuotaUsage, AccessKeyRepository, ProxyParams} from '../model/access_key';
import * as errors from '../model/outline_error';
import {ShadowsocksAccessKey, ShadowsocksServer} from '../model/shadowsocks_server';

import {ManagerMetrics} from './manager_metrics';
import {ServerConfigJson} from './server_config';

// The format as json of access keys in the config file.
interface AccessKeyJson {
  id: AccessKeyId;
  metricsId: AccessKeyId;
  name: string;
  password: string;
  port: number;
  encryptionMethod?: string;
  quota?: AccessKeyQuota;
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
      readonly proxyParams: ProxyParams, public quotaUsage?: AccessKeyQuotaUsage) {}

  isOverQuota(): boolean {
    if (!this.quotaUsage) {
      return false;
    }
    return this.quotaUsage.usage.bytes > this.quotaUsage.quota.data.bytes;
  }
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
  const quotaUsage =
      accessKeyJson.quota ? {quota: accessKeyJson.quota, usage: {bytes: 0}} : undefined;
  return new ServerAccessKey(
      accessKeyJson.id, accessKeyJson.name, accessKeyJson.metricsId, proxyParams, quotaUsage);
}

function makeAccessKeyJson(accessKey: AccessKey): AccessKeyJson {
  return {
    id: accessKey.id,
    metricsId: accessKey.metricsId,
    name: accessKey.name,
    password: accessKey.proxyParams.password,
    port: accessKey.proxyParams.portNumber,
    encryptionMethod: accessKey.proxyParams.encryptionMethod,
    quota: accessKey.quotaUsage ? accessKey.quotaUsage.quota : undefined
  };
}

// AccessKeyRepository that keeps its state in a config file and uses ShadowsocksServer
// to start and stop per-access-key Shadowsocks instances.  Lazily generates a default
// port for new access keys if none is provided.
export class ServerAccessKeyRepository implements AccessKeyRepository {
  private static QUOTA_ENFORCEMENT_INTERVAL_MS = 60 * 60 * 1000;  // 1h
  private NEW_USER_ENCRYPTION_METHOD = 'chacha20-ietf-poly1305';
  private accessKeys: ServerAccessKey[];

  constructor(
      private portForNewAccessKeys: number, private proxyHostname: string,
      private keyConfig: JsonConfig<AccessKeyConfigJson>,
      private shadowsocksServer: ShadowsocksServer, private prometheusClient: PrometheusClient) {
    if (this.keyConfig.data().accessKeys === undefined) {
      this.keyConfig.data().accessKeys = [];
    }
    if (this.keyConfig.data().nextId === undefined) {
      this.keyConfig.data().nextId = 0;
    }
    this.accessKeys = this.loadAccessKeys();
  }

  // Starts the Shadowsocks server and exposes the access key configuration to the server.
  // Periodically enforces access key quotas.
  async start(clock: Clock): Promise<void> {
    await this.enforceAccessKeyQuotas();
    await this.updateServer();
    clock.setInterval(async () => {
      try {
        await this.enforceAccessKeyQuotas();
      } catch (e) {
        logging.error(`Failed to enforce access key quotas: ${e}`);
      }
    }, ServerAccessKeyRepository.QUOTA_ENFORCEMENT_INTERVAL_MS);
  }

  private isExistingAccessKeyPort(port: number): boolean {
    return this.accessKeys.some((key) => {
      return key.proxyParams.portNumber === port;
    });
  }

  async setDefaultPort(port: number): Promise<void> {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new errors.InvalidPortNumber(port);
    }
    if (!this.isExistingAccessKeyPort(port) && await isPortUsed(port)) {
      throw new errors.PortInUse(port);
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

  removeAccessKey(id: AccessKeyId): boolean {
    for (let ai = 0; ai < this.accessKeys.length; ai++) {
      const accessKey = this.accessKeys[ai];
      if (accessKey.id === id) {
        this.accessKeys.splice(ai, 1);
        this.saveAccessKeys();
        this.updateServer();
        return true;
      }
    }
    return false;
  }

  listAccessKeys(): AccessKey[] {
    return [...this.accessKeys];  // Return a copy of the access key array.
  }

  renameAccessKey(id: AccessKeyId, name: string): boolean {
    const accessKey = this.getAccessKey(id);
    if (!accessKey) {
      return false;
    }
    accessKey.name = name;
    try {
      this.saveAccessKeys();
    } catch (error) {
      return false;
    }
    return true;
  }

  async setAccessKeyQuota(id: AccessKeyId, quota: AccessKeyQuota): Promise<boolean> {
    if (!quota || !quota.data || !quota.window || quota.data.bytes < 0 || quota.window.hours < 0) {
      return false;
    }
    const accessKey = this.getAccessKey(id);
    if (!accessKey) {
      return false;
    }
    accessKey.quotaUsage = {quota, usage: {bytes: 0}};
    try {
      this.saveAccessKeys();
      const quotaStautsChanged = await this.updateAccessKeyQuotaStatus(accessKey);
      if (quotaStautsChanged) {
        // Reflect the access key quota status if it changed with the new quota.
        await this.updateServer();
      }
    } catch (error) {
      return false;
    }
    return true;
  }

  async removeAccessKeyQuota(id: AccessKeyId): Promise<boolean> {
    const accessKey = this.getAccessKey(id);
    if (!accessKey) {
      return false;
    }
    const wasOverQuota = accessKey.isOverQuota();
    accessKey.quotaUsage = undefined;
    try {
      this.saveAccessKeys();
      if (wasOverQuota) {
        await this.updateServer();
      }
    } catch (error) {
      return false;
    }
    return true;
  }

  getMetricsId(id: AccessKeyId): AccessKeyMetricsId|undefined {
    const accessKey = this.getAccessKey(id);
    return accessKey ? accessKey.metricsId : undefined;
  }

  // Compares access key usage with collected metrics, marking them as under or over quota.
  async enforceAccessKeyQuotas() {
    let quotaStatusChanged = false;
    for (const accessKey of this.accessKeys) {
      quotaStatusChanged = quotaStatusChanged || await this.updateAccessKeyQuotaStatus(accessKey);
    }
    if (quotaStatusChanged) {
      this.updateServer();
    }
  }

  // Updates `accessKey` quota status by comparing its usage with collected metrics. Returns whether
  // the quota status changed.
  private async updateAccessKeyQuotaStatus(accessKey: ServerAccessKey): Promise<boolean> {
    if (!accessKey.quotaUsage) {
      return false;  // Don't query the usage of access keys without quota.
    }
    const wasOverQuota = accessKey.isOverQuota();
    const bytesTransferred =
        await this.getOutboundByteTransfer(accessKey.id, accessKey.quotaUsage.quota.window.hours);
    accessKey.quotaUsage.usage.bytes = bytesTransferred;
    const isOverQuota = accessKey.isOverQuota();
    const quotaStatusChanged = isOverQuota !== wasOverQuota;
    if (quotaStatusChanged) {
      logging.debug(`Access key "${accessKey.id}" quota status changed. Quota: ${
          JSON.stringify(accessKey.quotaUsage)}, isOverQuota: ${isOverQuota}`);
    }
    return quotaStatusChanged;
  }

  // Retrieves access key outbound data transfer in bytes for `accessKeyId` over `windowHours`
  // from a Prometheus instance.
  async getOutboundByteTransfer(accessKeyId: string, windowHours: number): Promise<number> {
    const escapedAccessKeyId = JSON.stringify(accessKeyId);
    let bytesTransferred = 0;
    const result = await this.prometheusClient.query(
        `sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t",access_key=${escapedAccessKeyId}}[${
            windowHours}h])) by (access_key)`);
    if (result && result.result[0] && result.result[0].metric['access_key'] === accessKeyId &&
        result.result[0].value && result.result[0].value.length > 1) {
      bytesTransferred = Math.round(parseFloat(result.result[0].value[1])) || 0;
    }
    return bytesTransferred;
  }

  private updateServer(): Promise<void> {
    const serverAccessKeys = this.accessKeys.filter(key => !key.isOverQuota()).map(key => {
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
    try {
      this.keyConfig.data().accessKeys = this.accessKeys.map(key => makeAccessKeyJson(key));
      this.keyConfig.write();
    } catch (error) {
      throw new Error(`Failed to save access key config: ${error}`);
    }
  }

  // Returns a reference to the access key with `id`, or undefined if the key is not found.
  private getAccessKey(id: AccessKeyId): ServerAccessKey|undefined {
    for (const accessKey of this.accessKeys) {
      if (accessKey.id === id) {
        return accessKey;
      }
    }
    return undefined;
  }
}
