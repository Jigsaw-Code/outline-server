
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

export interface ProxyParams {
  hostname: string;
  portNumber: number;
  encryptionMethod: string;
  password: string;
}

export interface AccessKey {
  // The unique identifier for this access key.
  id: AccessKeyId;
  // Admin-controlled, editable name for this access key.
  name: string;
  // Used in metrics reporting to decouple from the real id. Can change.
  metricsId: AccessKeyId;
  // Parameters to access the proxy
  proxyParams: ProxyParams;
}

export interface AccessKeyRepository {
  // Creates a new access key. Parameters are chosen automatically.
  createNewAccessKey(): Promise<AccessKey>;
  // Removes the access key given its id.  Returns true if successful.
  removeAccessKey(id: AccessKeyId): boolean;
  // Lists all existing access keys
  listAccessKeys(): IterableIterator<AccessKey>;
  // Apply the specified update to the specified access key.
  // Returns true if successful.
  renameAccessKey(id: AccessKeyId, name: string): boolean;
}