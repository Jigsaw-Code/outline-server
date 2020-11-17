/*
  Copyright 2020 The Outline Authors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

/** Enumeration of supported cloud providers. */
export enum CloudProviderId {
  DigitalOcean = 'DigitalOcean',
}

/** DigitalOcean REST API wrapper */
export interface DigitalOceanApi {
  /** @see https://developers.digitalocean.com/documentation/v2/#get-user-information */
  getAccount(): Promise<Account>;

  /** @see */
  createDroplet(
      displayName: string, region: string, publicKeyForSSH: string,
      dropletSpec: DigitalOceanDropletSpecification): Promise<{droplet: DropletInfo}>;

  /** @see */
  deleteDroplet(dropletId: number): Promise<void>;

  /** @see https://developers.digitalocean.com/documentation/v2/#regions */
  getRegionInfo(): Promise<RegionInfo[]>;

  /** @see https://developers.digitalocean.com/documentation/v2/#retrieve-an-existing-droplet-by-id */
  getDroplet(dropletId: number): Promise<DropletInfo>;

  /** @see */
  getDropletTags(dropletId: number): Promise<string[]>;

  /** @see */
  getDropletsByTag(tag: string): Promise<DropletInfo[]>;

  /** @see */
  getDroplets(): Promise<DropletInfo[]>;
}

export interface DigitalOceanDropletSpecification {
  installCommand: string;
  size: string;
  image: string;
  tags: string[];
}

export type DropletInfo = Readonly<{
  id: number;
  status: 'new' | 'active';
  tags: string[];
  region: {
    readonly slug: string;
  };
  size: Readonly<{
    transfer: number;
    price_monthly: number;
  }>;
  networks: Readonly<{
    v4: ReadonlyArray<
        Readonly<{
          type: string;
          ip_address: string;}
            >>;
  }>;
}>;

export type Account = Readonly<{
  email: string;
  uuid: string;
  email_verified: boolean;
  status: string;
}>;

export type RegionInfo = Readonly<{
  slug: string;
  name: string;
  sizes: string[];
  available: boolean;
  features: string[];
}>;

export type DigitalOceanError = Readonly<{
  id: string;
  message: string;
  request_id?: string;
}>;
