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

import {DigitalOceanSession, DropletInfo, RestApiSession} from '../cloud/digitalocean_api';
import * as crypto from '../infrastructure/crypto';
import * as do_install_script from '../install_scripts/do_install_script';
import * as digitalocean from '../model/digitalocean';
import * as server from '../model/server';

import {DigitalOceanServer} from './digitalocean_server';
import {getShellExportCommands, ShadowboxSettings} from './server_install';

// Tag used to mark Shadowbox Droplets.
const SHADOWBOX_TAG = 'shadowbox';
const MACHINE_SIZE = 's-1vcpu-1gb';

export class DigitalOceanAccount implements digitalocean.Account {
  private readonly digitalOcean: DigitalOceanSession;
  private servers: DigitalOceanServer[] = [];

  constructor(
    private id: string,
    private accessToken: string,
    private shadowboxSettings: ShadowboxSettings,
    private debugMode: boolean
  ) {
    this.digitalOcean = new RestApiSession(accessToken);
  }

  getId(): string {
    return this.id;
  }

  async getName(): Promise<string> {
    return (await this.digitalOcean.getAccount())?.email;
  }

  async getStatus(): Promise<digitalocean.Status> {
    const account = await this.digitalOcean.getAccount();
    if (account.status === 'active') {
      return digitalocean.Status.ACTIVE;
    }
    if (!account.email_verified) {
      return digitalocean.Status.EMAIL_UNVERIFIED;
    }
    return digitalocean.Status.MISSING_BILLING_INFORMATION;
  }

  // Return a list of regions indicating whether they are available and support
  // our target machine size.
  async listLocations(): Promise<Readonly<digitalocean.RegionOption[]>> {
    const regions = await this.digitalOcean.getRegionInfo();
    return regions.map((info) => ({
      cloudLocation: new digitalocean.Region(info.slug),
      available: info.available && info.sizes.indexOf(MACHINE_SIZE) !== -1,
    }));
  }

  // Creates a server and returning it when it becomes active.
  async createServer(region: digitalocean.Region, name: string): Promise<server.ManagedServer> {
    console.time('activeServer');
    console.time('servingServer');
    const keyPair = await crypto.generateKeyPair();
    const installCommand = getInstallScript(
      this.digitalOcean.accessToken,
      name,
      this.shadowboxSettings
    );

    const dropletSpec = {
      installCommand,
      size: MACHINE_SIZE,
      image: 'docker-18-04',
      tags: [SHADOWBOX_TAG],
    };
    if (this.debugMode) {
      // Strip carriage returns, which produce weird blank lines when pasted into a terminal.
      console.debug(
        `private key for SSH access to new droplet:\n${keyPair.private.replace(/\r/g, '')}\n\n` +
          'Use "ssh -i keyfile root@[ip_address]" to connect to the machine'
      );
    }
    const response = await this.digitalOcean.createDroplet(
      name,
      region.id,
      keyPair.public,
      dropletSpec
    );
    const server = this.createDigitalOceanServer(this.digitalOcean, response.droplet);
    server.onceDropletActive
      .then(async () => {
        console.timeEnd('activeServer');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _ of server.monitorInstallProgress()) {
          /* do nothing */
        }
        console.timeEnd('servingServer');
      })
      .catch((e) => console.log("Couldn't time installation", e));
    return server;
  }

  listServers(fetchFromHost = true): Promise<server.ManagedServer[]> {
    if (!fetchFromHost) {
      return Promise.resolve(this.servers); // Return the in-memory servers.
    }
    return this.digitalOcean.getDropletsByTag(SHADOWBOX_TAG).then((droplets) => {
      this.servers = [];
      return droplets.map((droplet) => {
        return this.createDigitalOceanServer(this.digitalOcean, droplet);
      });
    });
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  // Creates a DigitalOceanServer object and adds it to the in-memory server list.
  private createDigitalOceanServer(digitalOcean: DigitalOceanSession, dropletInfo: DropletInfo) {
    const server = new DigitalOceanServer(
      `${this.id}:${dropletInfo.id}`,
      digitalOcean,
      dropletInfo
    );
    this.servers.push(server);
    return server;
  }
}

function sanitizeDigitalOceanToken(input: string): string {
  const sanitizedInput = input.trim();
  const pattern = /^[A-Za-z0-9_/-]+$/;
  if (!pattern.test(sanitizedInput)) {
    throw new Error('Invalid DigitalOcean Token');
  }
  return sanitizedInput;
}

// cloudFunctions needs to define cloud::public_ip and cloud::add_tag.
function getInstallScript(
  accessToken: string,
  name: string,
  shadowboxSettings: ShadowboxSettings
): string {
  const sanitizedAccessToken = sanitizeDigitalOceanToken(accessToken);
  return (
    '#!/bin/bash -eu\n' +
    `export DO_ACCESS_TOKEN='${sanitizedAccessToken}'\n` +
    getShellExportCommands(shadowboxSettings, name) +
    do_install_script.SCRIPT
  );
}
