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

import {CloudProvider} from './accounts';
import {ManagedServer} from './server';

// Keys are region IDs like "us-central1".
// Values are zones like ["us-central1-a", "us-central1-b"].
export type ZoneId = string;
export type ZoneMap = {
  [regionId: string]: ZoneId[]
};

export function getRegionId(zoneId: ZoneId): string {
  return zoneId.substring(0, zoneId.lastIndexOf('-'));
}

export type Project = {
  id: string,
  name: string,
};

export type BillingAccount = {
  id: string,
  name: string,
};

export type CreationParams = {
  cloudProvider: CloudProvider.GCP;
  /** The GCP project ID. */
  projectId: string;
  /** The ID of the GCP zone to create the server in. */
  zoneId: string;
};

/**
 * Represents a Cloud region as a hierarchy of place names,
 * e.g. city, state, country, continent.
 */
export class Region {
  constructor(private divisions: string[]) {}

  getFullName(): string {
    return this.divisions.join(', ');
  }

  getFirstName(): string {
    return this.divisions[0];
  }
}

// TODO: Map regions to country codes.
// TODO: Localize place names.
/** @see https://cloud.google.com/compute/docs/regions-zones */
export const LOCATION_MAP: {[regionId: string]: Region} = {
  'asia-east1': new Region(['Changhua County', 'Taiwan']),
  'asia-east2': new Region(['Hong Kong']),
  'asia-northeast1': new Region(['Tokyo', 'Japan']),
  'asia-northeast2': new Region(['Osaka', 'Japan']),
  'asia-northeast3': new Region(['Seoul', 'South Korea']),
  'asia-south1': new Region(['Mumbai', 'India']),
  'asia-southeast1': new Region(['Jurong West', 'Singapore']),
  'asia-southeast2': new Region(['Jakarta', 'Indonesia']),
  'australia-southeast1': new Region(['Sydney', 'Australia']),
  'europe-north1': new Region(['Hamina', 'Finland']),
  'europe-west1': new Region(['St. Ghislain', 'Belgium']),
  'europe-west2': new Region(['London', 'England', 'UK']),
  'europe-west3': new Region(['Frankfurt', 'Germany']),
  'europe-west4': new Region(['Eemshaven', 'Netherlands']),
  'europe-west6': new Region(['Zürich', 'Switzerland']),
  'europe-central2': new Region(['Warsaw', 'Poland', 'Europe']),
  'northamerica-northeast1': new Region(['Montréal', 'Québec', 'Canada']),
  'southamerica-east1': new Region(['Osasco (São Paulo)', 'Brazil']),
  'us-central1': new Region(['Council Bluffs', 'Iowa', 'USA']),
  'us-east1': new Region(['Moncks Corner', 'South Carolina', 'USA']),
  'us-east4': new Region(['Ashburn', 'Northern Virginia', 'USA']),
  'us-west1': new Region(['The Dalles', 'Oregon', 'USA']),
  'us-west2': new Region(['Los Angeles', 'California', 'USA']),
  'us-west3': new Region(['Salt Lake City', 'Utah', 'USA']),
  'us-west4': new Region(['Las Vegas', 'Nevada', 'USA']),
};

/**
 * The Google Cloud Platform account model.
 */
export interface Account {
  /**
   * Returns a globally unique identifier for this Account.
   */
  getId(): string;

  /**
   * Returns a user-friendly name associated with the account.
   */
  getName(): Promise<string>;

  /**
   * Creates an Outline server on a Google Compute Engine VM instance.
   *
   * This method returns when the VM instance creation has been initiated.
   * The VM may not yet have been fully created, and the Shadowbox
   * Outline server may not be fully installed. See {@link ManagedServer#waitOnInstall}
   * to be notified when the server installation has completed.
   *
   * @param projectId - The GCP project ID.
   * @param description - A human-readable description of the server.
   * @param zoneId - The ID of the GCP zone to create the server in.
   */
  createServer(projectId: string, description: string, zoneId: string): Promise<ManagedServer>;

  /**
   * Lists the Outline servers in a given GCP project.
   *
   * @param projectId - The GCP project ID.
   */
  listServers(projectId: string): Promise<ManagedServer[]>;

  /**
   * Lists the Google Compute Engine locations available to given GCP project.
   *
   * @param projectId - The GCP project ID.
   */
  listLocations(projectId: string): Promise<ZoneMap>;

  /**
   * Creates a new Google Cloud Platform project.
   *
   * The project ID must conform to the following:
   * - must be 6 to 30 lowercase letters, digits, or hyphens
   * - must start with a letter
   * - no trailing hyphens
   *
   * @param id - The project ID.
   * @param billingAccount - The billing account ID.
   */
  createProject(id: string, billingAccountId: string): Promise<Project>;

  /** Lists the Google Cloud Platform projects available with the user. */
  listProjects(): Promise<Project[]>;

  /**
   * Lists the active Google Cloud Platform billing accounts associated with
   * the user.
   */
  listOpenBillingAccounts(): Promise<BillingAccount[]>;
}
