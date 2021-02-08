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

import {Account} from '../model/account';
import {ManagedServer} from "../model/server";
import * as crypto from "../infrastructure/crypto";
import * as do_install_script from "../install_scripts/do_install_script";
import {DigitalOceanSession} from "../cloud/digitalocean_api";
import {DigitaloceanServer, GetCityId} from "./digitalocean_server";
import {ShadowboxSettings} from "./shadowbox_server";

export type RegionId = string;
export type Location = {
  id: string;
  regions: RegionId[];
};

export enum Status {
  ACTIVE,
  EMAIL_UNVERIFIED,
  INVALID_BILLING_INFORMATION,
}

export class DigitalOceanAccount implements Account {
  private static readonly MACHINE_SIZE = 's-1vcpu-1gb';
  private static readonly SHADOWBOX_TAG = 'shadowbox';

  constructor(
      private apiClient: DigitalOceanSession,
      private shadowboxSettings: ShadowboxSettings,
      private debugMode: boolean,
      private disconnectFn: () => void) { }

  async getId(): Promise<string> {
    // TODO: Memoize
    return (await this.apiClient.getAccount()).uuid;
  }

  async getName(): Promise<string> {
    return (await this.apiClient.getAccount()).email;
  }

  async getStatus(): Promise<Status> {
    const account = await this.apiClient.getAccount();
    if (account.status === 'active') {
      return Status.ACTIVE;
    }
    if (!account.email_verified) {
      return Status.EMAIL_UNVERIFIED;
    }
    return Status.INVALID_BILLING_INFORMATION;
  }

  async listLocations(): Promise<Location[]> {
    const regions = await this.apiClient.getRegionInfo();
    const regionMap = new Map<string, Location>();
    regions.forEach((region) => {
      const cityId = GetCityId(region.slug);
      if (!regionMap.has(cityId)) {
        const location = { id: cityId, regions: [] as string[] };
        regionMap.set(cityId, location);
      }
      regionMap.get(cityId).regions.push(region.slug);
    });
    return [...regionMap.values()];
  }

  async createServer(name: string, regionId: RegionId): Promise<ManagedServer> {
    console.time('activeServer');
    console.time('servingServer');
    const installCommand = DigitalOceanAccount.getInstallScript(this.apiClient.accessToken, this.shadowboxSettings);
    const dropletSpec = {
      installCommand,
      size: DigitalOceanAccount.MACHINE_SIZE,
      image: 'docker-18-04',
      tags: [DigitalOceanAccount.SHADOWBOX_TAG],
    };

    const keyPair = await crypto.generateKeyPair();
    if (this.debugMode) {
      // Strip carriage returns, which produce weird blank lines when pasted into a terminal.
      const trimmedKey = keyPair.private.replace(/\r/g, '');
      console.debug(
          `private key for SSH access to new droplet:\n${trimmedKey}\n\n` +
          'Use "ssh -i keyfile root@[ip_address]" to connect to the machine');
    }
    const response = await this.apiClient.createDroplet(name, regionId, keyPair.public, dropletSpec);
    return new DigitaloceanServer(this.apiClient, response.droplet);
  }

  async listServers(): Promise<ManagedServer[]> {
    const droplets = await this.apiClient.getDropletsByTag(DigitalOceanAccount.SHADOWBOX_TAG);
    return droplets.map((droplet) => {
      return new DigitaloceanServer(this.apiClient, droplet);
    });
  }

  disconnect(): void {
    this.disconnectFn();
  }

  // cloudFunctions needs to define cloud::public_ip and cloud::add_tag.
  private static getInstallScript(accessToken: string, shadowboxSettings: ShadowboxSettings): string {
    const watchtowerRefreshSeconds = shadowboxSettings.imageId ? 30 : undefined;
    const sanitizedAccessToken = this.sanitizeToken(accessToken);
    // TODO: consider shell escaping these variables.
    return '#!/bin/bash -eu\n' +
        `export DO_ACCESS_TOKEN=${sanitizedAccessToken}\n` +
        (shadowboxSettings.imageId ? `export SB_IMAGE=${shadowboxSettings.imageId}\n` : '') +
        (watchtowerRefreshSeconds ? `export WATCHTOWER_REFRESH_SECONDS=${watchtowerRefreshSeconds}\n` : '') +
        (shadowboxSettings.sentryApiUrl ? `export SENTRY_API_URL="${shadowboxSettings.sentryApiUrl}"\n` : '') +
        (shadowboxSettings.metricsUrl ? `export SB_METRICS_URL=${shadowboxSettings.metricsUrl}\n` : '') +
        `export SB_DEFAULT_SERVER_NAME="${name}"\n` + do_install_script.SCRIPT;
  }

  private static sanitizeToken(input: string): string {
    const sanitizedInput = input.trim();
    const pattern = /^[A-Za-z0-9_\/-]+$/;
    if (!pattern.test(sanitizedInput)) {
      throw new Error('Invalid DigitalOcean Token');
    }
    return sanitizedInput;
  }
}
