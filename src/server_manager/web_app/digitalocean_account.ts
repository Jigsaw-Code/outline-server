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

import {Account, RegionMap} from "../model/account";
import {DigitalOceanSession, DropletInfo} from "../cloud/digitalocean_api";
import {DigitalOceanServer, GetCityId} from "./digitalocean_server";
import * as server from "../model/server";
import * as crypto from "../infrastructure/crypto";
import * as do_install_script from "../install_scripts/do_install_script";

// Tag used to mark Shadowbox Droplets.
const SHADOWBOX_TAG = 'shadowbox';
const MACHINE_SIZE = 's-1vcpu-1gb';

export class DigitalOceanAccount implements Account {
  private servers: DigitalOceanServer[] = [];

  constructor(
      private digitalOcean: DigitalOceanSession, private image: string, private metricsUrl: string,
      private sentryApiUrl: string|undefined, private debugMode: boolean) {}

  // Return a map of regions that are available and support our target machine size.
  getRegionMap(): Promise<Readonly<RegionMap>> {
    return this.digitalOcean.getRegionInfo().then((regions) => {
      const ret: RegionMap = {};
      regions.forEach((region) => {
        const cityId = GetCityId(region.slug);
        if (!(cityId in ret)) {
          ret[cityId] = [];
        }
        if (region.available && region.sizes.indexOf(MACHINE_SIZE) !== -1) {
          ret[cityId].push(region.slug);
        }
      });
      return ret;
    });
  }

  // Creates a server and returning it when it becomes active.
  createServer(region: server.RegionId, name: string): Promise<server.ManagedServer> {
    console.time('activeServer');
    console.time('servingServer');
    const onceKeyPair = crypto.generateKeyPair();
    const watchtowerRefreshSeconds = this.image ? 30 : undefined;
    const installCommand = getInstallScript(
        this.digitalOcean.accessToken, name, this.image, watchtowerRefreshSeconds, this.metricsUrl,
        this.sentryApiUrl);

    const dropletSpec = {
      installCommand,
      size: MACHINE_SIZE,
      image: 'docker-18-04',
      tags: [SHADOWBOX_TAG],
    };
    return onceKeyPair
    .then((keyPair) => {
      if (this.debugMode) {
        // Strip carriage returns, which produce weird blank lines when pasted into a terminal.
        console.debug(
            `private key for SSH access to new droplet:\n${
                keyPair.private.replace(/\r/g, '')}\n\n` +
            'Use "ssh -i keyfile root@[ip_address]" to connect to the machine');
      }
      return this.digitalOcean.createDroplet(name, region, keyPair.public, dropletSpec);
    })
    .then((response) => {
      return this.createDigitalOceanServer(this.digitalOcean, response.droplet);
    });
  }

  listServers(fetchFromHost = true): Promise<server.ManagedServer[]> {
    if (!fetchFromHost) {
      return Promise.resolve(this.servers);  // Return the in-memory servers.
    }
    return this.digitalOcean.getDropletsByTag(SHADOWBOX_TAG).then((droplets) => {
      this.servers = [];
      return droplets.map((droplet) => {
        return this.createDigitalOceanServer(this.digitalOcean, droplet);
      });
    });
  }

  // Creates a DigitalOceanServer object and adds it to the in-memory server list.
  private createDigitalOceanServer(digitalOcean: DigitalOceanSession, dropletInfo: DropletInfo) {
    const server = new DigitalOceanServer(digitalOcean, dropletInfo);
    this.servers.push(server);
    return server;
  }
}

function sanitizeDigitalOceanToken(input: string): string {
  const sanitizedInput = input.trim();
  const pattern = /^[A-Za-z0-9_\/-]+$/;
  if (!pattern.test(sanitizedInput)) {
    throw new Error('Invalid DigitalOcean Token');
  }
  return sanitizedInput;
}

// cloudFunctions needs to define cloud::public_ip and cloud::add_tag.
function getInstallScript(
    accessToken: string, name: string, image?: string, watchtowerRefreshSeconds?: number,
    metricsUrl?: string, sentryApiUrl?: string): string {
  const sanitizedAccessToken = sanitizeDigitalOceanToken(accessToken);
  // TODO: consider shell escaping these variables.
  return '#!/bin/bash -eu\n' +
      `export DO_ACCESS_TOKEN=${sanitizedAccessToken}\n` +
      (image ? `export SB_IMAGE=${image}\n` : '') +
      (watchtowerRefreshSeconds ?
          `export WATCHTOWER_REFRESH_SECONDS=${watchtowerRefreshSeconds}\n` :
          '') +
      (sentryApiUrl ? `export SENTRY_API_URL="${sentryApiUrl}"\n` : '') +
      (metricsUrl ? `export SB_METRICS_URL=${metricsUrl}\n` : '') +
      `export SB_DEFAULT_SERVER_NAME="${name}"\n` + do_install_script.SCRIPT;
}
