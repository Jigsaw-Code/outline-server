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

// Parameters needed to enforce an access key data quota, over a sliding window.
export interface AccessKeyQuota {
  // The allowed metered traffic measured in bytes.
  readonly quotaBytes: number;
  // The sliding window size in hours.
  readonly windowHours: number;
}

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
  // Admin-controlled, data transfer quota for this access key. Unlimited if unset.
  readonly quota?: AccessKeyQuota;
  // Whether the access key data usage exceeds the quota.
  readonly isOverQuota?: boolean;
}

export interface AccessKeyRepository {
  // Creates a new access key. Parameters are chosen automatically.
  createNewAccessKey(): Promise<AccessKey>;
  // Removes the access key given its id.  Returns true if successful.
  removeAccessKey(id: AccessKeyId): boolean;
  // Lists all existing access keys
  listAccessKeys(): AccessKey[];
  // Apply the specified update to the specified access key.
  // Returns true if successful.
  renameAccessKey(id: AccessKeyId, name: string): boolean;
  // Gets the metrics id for a given Access Key.
  getMetricsId(id: AccessKeyId): AccessKeyMetricsId|undefined;
  // Sets the transfer quota for the specified access key. Returns true if successful.
  setAccessKeyQuota(id: AccessKeyId, quota: AccessKeyQuota): Promise<boolean>;
  // Clears the transfer quota for the specified access key. Returns true if successful.
  removeAccessKeyQuota(id: AccessKeyId): Promise<boolean>;
}
