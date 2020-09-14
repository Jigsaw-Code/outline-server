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

import {HttpClient} from "../infrastructure/http";

export type ServerConfig = Readonly<{
  name: string;
  metricsEnabled: boolean;
  serverId: string;
  createdTimestampMs: number;
  portForNewAccessKeys: number;
  hostnameForAccessKeys: string;
  version: string;
  accessKeyDataLimit?: {
    bytes: number
  };
}>;
type ListAccessKeysResponse = Readonly<{
  accessKeys: Array<{
    id: string;
    name: string;
    accessUrl: string;
  }>
}>;
type ListAccessKeysDataUsageResponse = Readonly<{
  bytesTransferredByUserId: {
    [accessKeyId: string]: number
  };
}>;

export class OutlineServerRestApiClient {
  private managementApiClient: HttpClient;

  constructor(private managementApiUrl: string) {
    this.managementApiClient = new HttpClient(managementApiUrl);
  }

  getServerConfig(): Promise<ServerConfig> {
    return this.managementApiClient.get<ServerConfig>("server");
  }

  listAccessKeys(): Promise<ListAccessKeysResponse> {
    return this.managementApiClient.get<ListAccessKeysResponse>("access-keys");
  }

  async updateServerConfig(serverName?: string, accessKeysHostname?: string, accessKeysPort?: number): Promise<void> {
    if (serverName) {
      await this.managementApiClient.put<void>("name", {name: serverName});
    }
    if (accessKeysHostname) {
      await this.managementApiClient.put<void>("server/hostname-for-access-keys", {hostname: accessKeysHostname});
    }
    // if (accessKeysPort) {
    //   await this.managementApiClient.put<void>("server/port-for-new-access-keys", {port: accessKeysPort});
    // }
  }

  listAccessKeysDataUsage(): Promise<ListAccessKeysDataUsageResponse> {
    return this.managementApiClient.get<ListAccessKeysDataUsageResponse>("metrics/transfer");
  }
}