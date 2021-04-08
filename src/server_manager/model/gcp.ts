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

import {ManagedServer, RegionId} from './server';

// Keys are region IDs like "us-central1".
// Values are zones like ["us-central1-a", "us-central1-b"].
export type ZoneId = string;
export type ZoneMap = {
  [regionId: string]: ZoneId[]
};

export type Project = {
  id: string,
  name: string,
};

export type BillingAccount = {
  id: string,
  name: string,
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
   * This method returns after the VM instance has been created. The Shadowbox
   * Outline server may not be fully installed. See {@link ManagedServer#waitOnInstall}
   * to be notified when the server installation has completed.
   *
   * @param projectId - The GCP project ID.
   * @param name - The name to be given to the server.
   * @param zoneId - The ID of the GCP zone to create the server in.
   */
  createServer(projectId: string, name: string, zoneId: string): Promise<ManagedServer>;

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

  /** Lists the Google Cloud Platform billing accounts associated with the user. */
  listBillingAccounts(): Promise<BillingAccount[]>;
}
