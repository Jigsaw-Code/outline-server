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

import * as server from '../model/server';
import {SentryErrorReporter} from './error_reporter';

// Interfaces used by metrics REST APIs.
interface MetricsEnabled {
  metricsEnabled: boolean;
}
export interface ServerName { name: string; }
export interface ServerConfig {
  name: string;
  metricsEnabled: boolean;
  serverId: string;
  createdTimestampMs: number;
}

// This function is defined in electron_app/preload.ts.
declare function whitelistCertificate(fp: string): boolean;

export class ShadowboxServer implements server.Server {
  private managementApiAddress: string;
  private serverConfig: ServerConfig;

  constructor() {}

  listAccessKeys(): Promise<server.AccessKey[]> {
    SentryErrorReporter.logInfo('Listing access keys');
    return this.apiRequest<{accessKeys: server.AccessKey[]}>('access-keys').then((response) => {
      return response.accessKeys;
    });
  }

  addAccessKey(): Promise<server.AccessKey> {
    SentryErrorReporter.logInfo('Adding access key');
    return this.apiRequest<server.AccessKey>('access-keys', {method: 'POST'});
  }

  renameAccessKey(accessKeyId: server.AccessKeyId, name: string): Promise<void> {
    SentryErrorReporter.logInfo('Renaming access key');
    const body = new FormData();
    body.append('name', name);
    return this.apiRequest<void>('access-keys/' + accessKeyId + '/name', {method: 'PUT', body});
  }

  removeAccessKey(accessKeyId: server.AccessKeyId): Promise<void> {
    SentryErrorReporter.logInfo('Removing access key');
    return this.apiRequest<void>('access-keys/' + accessKeyId, {method: 'DELETE'});
  }

  getDataUsage(): Promise<server.DataUsageByAccessKey> {
    SentryErrorReporter.logInfo('Retrieving data usage');
    return this.apiRequest<server.DataUsageByAccessKey>('metrics/transfer');
  }

  getName(): string {
    return this.serverConfig.name;
  }

  setName(name: string): Promise<void> {
    SentryErrorReporter.logInfo('Setting server name');
    const requestOptions: RequestInit = {
      method: 'PUT',
      headers: new Headers({'Content-Type': 'application/json'}),
      body: JSON.stringify({name})
    };
    return this.apiRequest<void>('name', requestOptions).then(() => {
      this.serverConfig.name = name;
    });
  }

  getMetricsEnabled(): boolean {
    return this.serverConfig.metricsEnabled;
  }

  setMetricsEnabled(metricsEnabled: boolean): Promise<void> {
    const action = metricsEnabled ? 'Enabling' : 'Disabling';
    SentryErrorReporter.logInfo(`${action} metrics`);
    const requestOptions: RequestInit = {
      method: 'PUT',
      headers: new Headers({'Content-Type': 'application/json'}),
      body: JSON.stringify({metricsEnabled})
    };
    return this.apiRequest<void>('metrics/enabled', requestOptions).then(() => {
      this.serverConfig.metricsEnabled = metricsEnabled;
    });
  }

  getServerId(): string {
    return this.serverConfig.serverId;
  }

  isHealthy(timeoutMs = 30000): Promise<boolean> {
    return new Promise<boolean>((fulfill, reject) => {
      // Query the API and expect a successful response to validate that the
      // service is up and running.
      this.getServerConfig().then(
          (serverConfig) => {
            this.serverConfig = serverConfig;
            fulfill(true);
          },
          (e) => {
            fulfill(false);
          });
      // Return not healthy if API doesn't complete within timeoutMs.
      setTimeout(() => {
        fulfill(false);
      }, timeoutMs);
    });
  }

  getCreatedDate(): Date {
    return new Date(this.serverConfig.createdTimestampMs);
  }

  getHostname(): string {
    try {
      return new URL(this.managementApiAddress).hostname;
    } catch (e) {
      return '';
    }
  }

  getManagementPort(): number {
    try {
      return parseInt(new URL(this.managementApiAddress).port, 10);
    } catch (e) {
      return undefined;
    }
  }

  private getServerConfig(): Promise<ServerConfig> {
    SentryErrorReporter.logInfo('Retrieving server configuration');
    return this.apiRequest<ServerConfig>('server');
  }

  whitelistCertificate(base64Fingerprint: string): void {
    // This function is defined in electron_app/preload.ts if we are running
    // in the electron app, otherwise it will not be defined.
    if (typeof whitelistCertificate === 'function') {
      whitelistCertificate(base64Fingerprint);
    }
  }

  protected setManagementApiUrl(apiAddress: string): void {
    this.managementApiAddress = apiAddress;
  }

  // Makes a request to the management API.
  private apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    try {
      let apiAddress = this.managementApiAddress;
      if (!apiAddress) {
        const msg = 'Management API address unavailable';
        SentryErrorReporter.logError(msg);
        throw new Error(msg);
      }
      if (!apiAddress.endsWith('/')) {
        apiAddress += '/';
      }
      const url = apiAddress + path;
      console.log(`Fetching url ${url}...`);
      return fetch(url, options)
          .then(
              (response) => {
                console.log('Fetch result:', url, response.ok);
                if (!response.ok) {
                  const msg = 'Failed to fetch API request results';
                  SentryErrorReporter.logError(msg);
                  throw new Error(msg);
                }
                return response.text();
              },
              (error: Error) => {
                const msg = 'Failed to fetch url';
                console.error(msg, url, error);
                SentryErrorReporter.logError(msg);
                throw error;
              })
          .then((body) => {
            if (!body) {
              return;
            }
            return JSON.parse(body);
          });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
