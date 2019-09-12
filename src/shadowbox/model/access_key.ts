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

import {DataUsageTimeframe} from '../model/metrics';

export type AccessKeyId = string;
export type AccessKeyMetricsId = string;

// Parameters needed to access a Shadowsocks proxy.
export interface ProxyParams {
  // Hostname of the proxy
  readonly hostname: string;
  // Number of the port where the Shadowsocks service is running.
  readonly portNumber: number;
  // The Shadowsocks encryption method being used.
  readonly encryptionMethod: string;
  // The password for the encryption.
  readonly password: string;
}

// Data transfer measured in bytes.
export interface DataUsage { readonly bytes: number; }

// AccessKey is what admins work with. It gives ProxyParams a name and identity.
export interface AccessKey {
  // The unique identifier for this access key.
  readonly id: AccessKeyId;
  // Admin-controlled, editable name for this access key.
  readonly name: string;
  // Used in metrics reporting to decouple from the real id. Can change.
  readonly metricsId: AccessKeyMetricsId;
  // Parameters to access the proxy
  readonly proxyParams: ProxyParams;
  // Admin-controlled, data transfer limit for this access key. Unlimited if unset.
  readonly dataLimit?: DataUsage;
  // Data transferred by this access key over a timeframe specified by the server.
  readonly dataUsage: DataUsage;
  // Returns whether the access key has exceeded its data transfer limit.
  isOverDataLimit(): boolean;
}

export interface AccessKeyRepository {
  // Creates a new access key. Parameters are chosen automatically.
  createNewAccessKey(): Promise<AccessKey>;
  // Removes the access key given its id. Throws on failure.
  removeAccessKey(id: AccessKeyId);
  // Lists all existing access keys
  listAccessKeys(): AccessKey[];
  // Changes the port for new access keys.
  setPortForNewAccessKeys(port: number): Promise<void>;
  // Apply the specified update to the specified access key. Throws on failure.
  renameAccessKey(id: AccessKeyId, name: string): void;
  // Gets the metrics id for a given Access Key.
  getMetricsId(id: AccessKeyId): AccessKeyMetricsId|undefined;
  // Sets the transfer limit for the specified access key. Throws on failure.
  setAccessKeyDataLimit(id: AccessKeyId, limit: DataUsage): Promise<void>;
  // Clears the transfer limit for the specified access key. Throws on failure.
  removeAccessKeyDataLimit(id: AccessKeyId): Promise<void>;
  // Sets the data usage timeframe for access key data limit enforcement. Throws on failure.
  setDataUsageTimeframe(timeframe: DataUsageTimeframe): Promise<void>;
}
