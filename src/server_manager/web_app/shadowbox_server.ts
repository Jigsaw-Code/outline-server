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

import * as errors from '../infrastructure/errors';
import * as server from '../model/server';

// Interfaces used by metrics REST APIs.
interface MetricsEnabled {
  metricsEnabled: boolean;
}
export interface ServerName {
  name: string;
}
export interface ServerConfig {
  name: string;
  metricsEnabled: boolean;
  serverId: string;
  createdTimestampMs: number;
  portForNewAccessKeys: number;
  version: string;
}

export class ShadowboxServer implements server.Server {
  private managementApiAddress: string;
  private serverConfig: ServerConfig;

  constructor() {}

  listAccessKeys(): Promise<server.AccessKey[]> {
    console.info('Listing access keys');
    return this.apiRequest<{accessKeys: server.AccessKey[]}>('access-keys').then((response) => {
      return response.accessKeys;
    });
  }

  addAccessKey(): Promise<server.AccessKey> {
    console.info('Adding access key');
    return this.apiRequest<server.AccessKey>('access-keys', {method: 'POST'});
  }

  renameAccessKey(accessKeyId: server.AccessKeyId, name: string): Promise<void> {
    console.info('Renaming access key');
    const body = new FormData();
    body.append('name', name);
    return this.apiRequest<void>('access-keys/' + accessKeyId + '/name', {method: 'PUT', body});
  }

  removeAccessKey(accessKeyId: server.AccessKeyId): Promise<void> {
    console.info('Removing access key');
    return this.apiRequest<void>('access-keys/' + accessKeyId, {method: 'DELETE'});
  }

  getDataUsage(): Promise<server.DataUsageByAccessKey> {
    return this.apiRequest<server.DataUsageByAccessKey>('metrics/transfer');
  }

  getName(): string {
    return this.serverConfig.name;
  }

  setName(name: string): Promise<void> {
    console.info('Setting server name');
    const requestOptions: RequestInit = {
      method: 'PUT',
      headers: new Headers({'Content-Type': 'application/json'}),
      body: JSON.stringify({name})
    };
    return this.apiRequest<void>('name', requestOptions).then(() => {
      this.serverConfig.name = name;
    });
  }

  getVersion(): string {
    return this.serverConfig.version;
  }

  getMetricsEnabled(): boolean {
    return this.serverConfig.metricsEnabled;
  }

  setMetricsEnabled(metricsEnabled: boolean): Promise<void> {
    const action = metricsEnabled ? 'Enabling' : 'Disabling';
    console.info(`${action} metrics`);
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

  getPortForNewAccessKeys(): number|undefined {
    try {
      if (typeof this.serverConfig.portForNewAccessKeys !== 'number') {
        return undefined;
      }
      return this.serverConfig.portForNewAccessKeys;
    } catch (e) {
      return undefined;
    }
  }

  setPortForNewAccessKeys(newPort: number): Promise<void> {
    console.info(`setPortForNewAcessKeys: ${newPort}`);
    const requestOptions: RequestInit = {
      method: 'PUT',
      headers: new Headers({'Content-Type': 'application/json'}),
      body: JSON.stringify({"port": newPort})
    };
    return this.apiRequest<void>('server/port-for-new-access-keys', requestOptions).then(() => {
      this.serverConfig.portForNewAccessKeys = newPort;
    });
  }

  private getServerConfig(): Promise<ServerConfig> {
    console.info('Retrieving server configuration');
    return this.apiRequest<ServerConfig>('server');
  }

  protected setManagementApiUrl(apiAddress: string): void {
    this.managementApiAddress = apiAddress;
  }

  getManagementApiUrl() {
    return this.managementApiAddress;
  }

  // Makes a request to the management API.
  private apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
    try {
      let apiAddress = this.managementApiAddress;
      if (!apiAddress) {
        const msg = 'Management API address unavailable';
        console.error(msg);
        throw new Error(msg);
      }
      if (!apiAddress.endsWith('/')) {
        apiAddress += '/';
      }
      const url = apiAddress + path;
      return fetch(url, options)
          .then(
              (response) => {
                if (!response.ok) {
                  throw new errors.ServerApiError(
                      `API request to ${path} failed with status ${response.status}`, response);
                }
                return response.text();
              },
              (error) => {
                throw new errors.ServerApiError(
                    `API request to ${path} failed due to network error`);
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
