// Copyright 2020 The Outline Authors
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

import {CloudProviderId} from "./cloud";
import {DigitalOceanServer} from "../web_app/digitalocean_app/digitalocean_server";
import {ManagedServer} from "./server";

export class AccountId {
  /** The cloud provider specific account identifier. */
  cloudSpecificId: string;

  /** The cloud provider enum. */
  cloudProviderId: CloudProviderId;
}

export interface Account {
  /**
   * The Account identifier that encapsulates the cloud provider (e.g.
   * DigitalOcean, GCP) and cloud specific account identifier.
   */
  getId(): AccountId;

  /**
   * The human readable account name to be displayed to the user. Ideally this
   * would be the email address or username used to log into the cloud
   * provider.
   */
  getDisplayName(): Promise<string>;

  // TODO:
  /** The cloud provider API credentials. */
  getCredentials(): object;

  /** Disconnects the cloud provider account and revokes credentials. */
  disconnect(): void;
}

export interface DigitalOceanAccount extends Account {
  registerAccountConnectionIssueListener(fn: () => void): void;

  /** An enum representing the status of the account. */
  getStatus(): Promise<DigitalOceanStatus>;

  /**
   * Returns a list of DigitalOceanLocation objects that support the
   * required cloud resources to setup an Outline server (e.g. Droplets,
   * Floating IPs).
   */
  listLocations(): Promise<DigitalOceanLocation[]>;

  /**
   * Creates an Outline server on DigitalOcean. The returned server will
   * not be fully initialized until ${@link DigitalOceanServer#waitOnInstall}
   * completes.
   *
   * @param name - The Outline server name.
   * @param location - The DigitalOcean data center location.
   */
  createServer(name: string, location: DigitalOceanLocation): Promise<ManagedServer>;

  /** Returns a list of Outline servers managed by the account. */
  listServers(fetchFromHost: boolean): Promise<ManagedServer[]>;
}

/**
 * Represents a location where DigitalOcean has data centers in and that support
 * the required resources to construct an Outline server (e.g. Droplets,
 * Floating IPs).
 */
export interface DigitalOceanLocation {
  /**
   * The location identifier. For DigitalOcean, this represents the “region”
   * (e.g. nyc) that the data centers are in.
   */
  regionId: string;

  /** A list of data center IDs available in the location (e.g. nyc1, nyc2). */
  dataCenterIds: string[];
}

/**
 * DigitalOcean API account credentials (e.g. OAuth access token or Personal
 * Access Token).
 */
export type DigitalOceanCredentials = string;

// TODO: Update with new statuses (e.g. WARNING, LOCKED)
/** Represents the status of the DigitalOcean account. */
export enum DigitalOceanStatus {
  /** Account is in good standing. */
  ACTIVE,

  /**
   * Account was created with an unverified email address. Email verification
   * is necessary for certain accounts (e.g. those registered via basic
   * authentication).
   */
  EMAIL_NOT_VERIFIED,

  /** Incorrect or incomplete billing account information. */
  INVALID_BILLING,

  UNKNOWN,
}
