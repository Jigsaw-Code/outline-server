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

import * as cloud_provider from '../../../model/cloud_provider';

export interface Instance {
  id: string;
  name: string;
  state?: "pending" | "running" | "error" | "unknown" | "stopping" | "terminated";
  bundle?: Bundle;
  image?: Image;
  location: Location;
  ip_address?: string; // TODO: support multiple IPs
  // TODO: support both ipv4 and ipv6
  created_at?: Date;
  labels?: Map<string, string>;
}

export interface Location {
  id: string;
  name?: string;
  country?: string;
}

export interface Image {
  id: string;
  name: string;
}

export interface Bundle {
  id: string;
  name: string;
  ram: number;
  disk: string;
  bandwidth: number;
  price: number;
}

export type CloudProviderServiceFactory = (account: Account) => Promise<CloudProviderService>;

export interface CloudProviderService {
  readonly cloudProvider?: cloud_provider.Id; // TODO: Make this abstract.

  createInstance(name: string, bundleId: string, locationId: string): Promise<Instance>;
  deleteInstance(instanceId: string, locationId: string): Promise<void>;
  getInstance(instanceId: string, locationId: string): Promise<Instance>;
  listInstances(locationId?: string): Promise<Instance[]>;
  listLocations(): Promise<Location[]>;
}
