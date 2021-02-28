// Copyright 2021 The Outline Authors
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

import {ManagedServer, RegionId} from "./server";

// Keys are cityIds like "nyc".  Values are regions like ["nyc1", "nyc3"].
export type RegionMap = {
  [cityId: string]: RegionId[]
};

export enum Status {
  ACTIVE,
  EMAIL_UNVERIFIED,
  MISSING_BILLING_INFORMATION,
}

export interface Account {
  // Returns a user-friendly name (email address) associated with the account.
  getName(): Promise<string>;
  // Returns the status of the account.
  getStatus(): Promise<Status>;
  // Lists all existing Shadowboxes. If `fetchFromHost` is true, performs a network request to
  // retrieve the servers; otherwise resolves with a cached server list.
  listServers(fetchFromHost?: boolean): Promise<ManagedServer[]>;
  // Return a map of regions that are available and support our target machine size.
  getRegionMap(): Promise<Readonly<RegionMap>>;
  // Creates a server and returning it when it becomes active (i.e. the server has
  // created, not necessarily once shadowbox installation has finished).
  createServer(region: RegionId, name: string): Promise<ManagedServer>;
}
