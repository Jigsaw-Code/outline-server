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

export interface Server {
  // Get the server's name for display.
  getName(): string;

  // Gets the version of the shadowbox binary the server is running
  getVersion(): string;

  // Updates the server name.
  setName(name: string): Promise<void>;

  // List the access keys for this server, including the admin.
  listAccessKeys(): Promise<AccessKey[]>;

  // Returns stats for bytes transferred across all access keys of this server.
  getDataUsage(): Promise<DataUsageByAccessKey>;

  // Adds a new access key to this server.
  addAccessKey(): Promise<AccessKey>;

  // Renames the access key given by id.
  renameAccessKey(accessKeyId: AccessKeyId, name: string): Promise<void>;

  // Removes the access key given by id.
  removeAccessKey(accessKeyId: AccessKeyId): Promise<void>;

  // Returns whether metrics are enabled.
  getMetricsEnabled(): boolean;

  // Updates whether metrics are enabled.
  setMetricsEnabled(metricsEnabled: boolean): Promise<void>;

  // Get the server's unique ID, used for metrics reporting.
  getServerId(): string;

  // Checks if the server is healthy.
  isHealthy(): Promise<boolean>;

  // Gets the date when this server was created.
  getCreatedDate(): Date;

  // Returns the server's domain name or IP address.
  getHostname(): string;

  // Returns the server's management API URL.
  getManagementApiUrl(): string;

  // Returns the port number for new access keys.
  // Returns undefined if the server doesn't have a port set.
  getPortForNewAccessKeys(): number|undefined;

  // Changes the port number for new access keys.
  setPortForNewAccessKeys(port: number): Promise<void>;
}

// Manual servers are servers which the user has independently setup to run
// shadowbox, and can be on any cloud provider.
export interface ManualServer extends Server {
  getCertificateFingerprint(): string;

  forget(): void;
}

// Managed servers are servers created by the Outline Manager through our
// "magic" user experience, e.g. DigitalOcean.
export interface ManagedServer extends Server {
  // Returns a promise that fulfills once installation is complete.
  // If resetTimeout is true, this will reset the server state and might
  // wait until the timeout occurs to reconnect to the server.
  waitOnInstall(resetTimeout: boolean): Promise<void>;
  // Returns server host object.
  getHost(): ManagedServerHost;
  // Returns true when installation is complete.
  isInstallCompleted(): boolean;
}

// The managed machine where the Outline Server is running.
export interface ManagedServerHost {
  // Returns the monthly outbound transfer limit.
  getMonthlyOutboundTransferLimit(): DataAmount;
  // Returns the monthly cost.
  getMonthlyCost(): MonetaryCost;
  // Returns the server region.
  getRegionId(): RegionId;
  // Deletes the server - cannot be undone.
  delete(): Promise<void>;
  // Returns the virtual host ID.
  getHostId(): string;
}

export class DataAmount { terabytes: number; }

export class MonetaryCost {
  // Value in US dollars.
  usd: number;
}

export type RegionId = string;

// Keys are cityIds like "nyc".  Values are regions like ["nyc1", "nyc3"].
export type RegionMap = {
  [cityId: string]: RegionId[]
};

// Repository of ManagedServer objects.  These servers are created by the server
// manager on cloud providers where we can provide a "magical" user experience,
// e.g. DigitalOcean.
export interface ManagedServerRepository {
  // Lists all existing Shadowboxes. If `fetchFromHost` is true, performs a network request to
  // retrieve the servers; otherwise resolves with a cached server list.
  listServers(fetchFromHost?: boolean): Promise<ManagedServer[]>;
  // Return a map of regions that are available and support our target machine size.
  getRegionMap(): Promise<Readonly<RegionMap>>;
  // Creates a server and returning it when it becomes active (i.e. the server has
  // created, not necessarily once shadowbox installation has finished).
  createServer(region: RegionId, name: string): Promise<ManagedServer>;
}

// Configuration for manual servers.  This is the output emitted from the
// shadowbox install script, which is needed for the manager connect to
// shadowbox.
export interface ManualServerConfig {
  apiUrl: string;
  certSha256: string;
}

// Repository of ManualServer objects.  These are servers the user has setup
// themselves, and configured to run shadowbox, outside of the manager.
export interface ManualServerRepository {
  // Lists all existing Shadowboxes.
  listServers(): Promise<ManualServer[]>;
  // Adds a manual server using the config (e.g. user input).
  addServer(config: ManualServerConfig): Promise<ManualServer>;

  // Retrieves a server with `config`.
  findServer(config: ManualServerConfig): ManualServer|undefined;
}

export type AccessKeyId = string;

export interface AccessKey {
  id: AccessKeyId;
  name: string;
  accessUrl: string;
}

// Byte transfer stats for a sliding timeframe, including both inbound and outbound.
// TODO: this is copied at src/shadowbox/model/metrics.ts.  Both copies should
// be kept in sync, until we can find a way to share code between the web_app
// and shadowbox.
export interface DataUsageByAccessKey {
  // The accessKeyId should be of type AccessKeyId, however that results in the tsc
  // error TS1023: An index signature parameter type must be 'string' or 'number'.
  // See https://github.com/Microsoft/TypeScript/issues/2491
  // TODO: this still says "UserId", changing to "AccessKeyId" will require
  // a change on the shadowbox server.
  bytesTransferredByUserId: {[accessKeyId: string]: number};
}
