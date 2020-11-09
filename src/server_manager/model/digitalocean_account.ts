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

import {Account, DigitalOceanSession, HttpError, NetworkError} from '../cloud/digitalocean_api';
import * as crypto from '../infrastructure/crypto';
import {LocalStorageRepository} from '../infrastructure/repository';
import * as do_install_script from '../install_scripts/do_install_script';
import {DigitalOceanServer, GetCityId} from '../web_app/digitalocean_server';

import * as account from './account';
import * as server from './server';
import {EventEmitter} from "eventemitter3";
import {CloudProviderId} from "./cloud";

const SHADOWBOX_TAG = 'shadowbox';
const MACHINE_SIZE = 's-1vcpu-1gb';

export class DigitalOceanAccount implements account.Account {
  /**
   * Event that signals an issue connecting to the DigitalOcean API. This
   * usually means an invalid authentication, CORS, or network issue.
   *
   * @event account-connectivity-issue
   * @property {DigitalOceanAccount} account
   */
  public static EVENT_ACCOUNT_CONNECTIVITY_ISSUE = 'account-connectivity-issue';

  private servers: server.ManagedServer[] = [];

  constructor(
      private domainEvents: EventEmitter, private data: account.Data,
      private accountRepository: LocalStorageRepository<account.Data, string>,
      private digitalOcean: DigitalOceanSession, private image: string, private metricsUrl: string,
      private sentryApiUrl: string|undefined, private debugMode: boolean) {}

  registerAccountConnectionIssueListener(fn: () => void) {
    this.domainEvents.on(DigitalOceanAccount.EVENT_ACCOUNT_CONNECTIVITY_ISSUE, fn);
  }

  getCloudProviderId(): CloudProviderId {
    return CloudProviderId.DigitalOcean;
  }

  async getEmail() {
    // TODO: Cache the account so that we don't make a network request each time
    // we need account information.
    const response = await this.digitalOcean.getAccount();
    return response.email;
  }

  async getStatus(): Promise<string> {
    const response = await this.digitalOcean.getAccount();
    return response.status;
  }

  async isVerified(): Promise<boolean> {
    const response = await this.digitalOcean.getAccount();
    return response.email_verified;
  }

  async getAccount(): Promise<Account> {
    try {
      return await this.digitalOcean.getAccount();
    } catch (error) {
      this.processError(error);
    }
  }

  getData() {
    return this.data;
  }

  // Return a map of regions that are available and support our target machine size.
  async getRegionMap(): Promise<Readonly<server.RegionMap>> {
    try {
      const regionInfos = await this.digitalOcean.getRegionInfo();
      const ret: server.RegionMap = {};
      regionInfos.forEach((region) => {
        const cityId = GetCityId(region.slug);
        if (!(cityId in ret)) {
          ret[cityId] = [];
        }
        if (region.available && region.sizes.indexOf(MACHINE_SIZE) !== -1) {
          ret[cityId].push(region.slug);
        }
      });
      return ret;
    } catch (error) {
      this.processError(error);
    }
  }

  // Creates a server and returning it when it becomes active.
  async createServer(region: server.RegionId, name: string): Promise<server.ManagedServer> {
    console.time('activeServer');
    console.time('servingServer');
    const watchtowerRefreshSeconds = this.image ? 30 : undefined;
    const installCommand = this.getInstallScript(
        this.digitalOcean.accessToken, name, this.image, watchtowerRefreshSeconds, this.metricsUrl, this.sentryApiUrl);

    const dropletSpec = {
      installCommand,
      size: MACHINE_SIZE,
      image: 'docker-18-04',
      tags: [SHADOWBOX_TAG],
    };

    const keyPair = await crypto.generateKeyPair();
    if (this.debugMode) {
      // Strip carriage returns, which produce weird blank lines when pasted into a terminal.
      console.debug(
          `private key for SSH access to new droplet:\n${keyPair.private.replace(/\r/g, '')}\n\n` +
          'Use "ssh -i keyfile root@[ip_address]" to connect to the machine');
    }

    try {
      const droplet =
          await this.digitalOcean.createDroplet(name, region, keyPair.public, dropletSpec);
      const server = new DigitalOceanServer(this.digitalOcean, droplet.droplet);
      this.servers.push(server);
      return server;
    } catch (error) {
      this.processError(error);
    }
  }

  async listServers(fetchFromHost = true): Promise<server.ManagedServer[]> {
    if (!fetchFromHost) {
      return Promise.resolve(this.servers);  // Return the in-memory servers.
    }

    try {
      const droplets = await this.digitalOcean.getDropletsByTag(SHADOWBOX_TAG);
      this.servers = droplets.map((droplet) => new DigitalOceanServer(this.digitalOcean, droplet));
      return this.servers;
    } catch (error) {
      this.processError(error);
    }
  }

  async disconnect(): Promise<void> {
    this.accountRepository.remove(this.data.id);
  }

  // cloudFunctions needs to define cloud::public_ip and cloud::add_tag.
  private getInstallScript(
      accessToken: string, name: string, image?: string, watchtowerRefreshSeconds?: number,
      metricsUrl?: string, sentryApiUrl?: string): string {
    const sanitizedAccessToken = this.sanitizeDigitalOceanToken(accessToken);
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

  private sanitizeDigitalOceanToken(input: string): string {
    const sanitizedInput = input.trim();
    const pattern = /^[A-Za-z0-9_\/-]+$/;
    if (!pattern.test(sanitizedInput)) {
      throw new Error('Invalid DigitalOcean Token');
    }
    return sanitizedInput;
  }

  private processError(error: Error) {
    if (error instanceof HttpError) {
      if (error.getStatusCode() === 401) {
        this.domainEvents.emit(DigitalOceanAccount.EVENT_ACCOUNT_CONNECTIVITY_ISSUE);
      } else {
        console.error(`DigitalOcean API request failed with status 
              ${error.getStatusCode()} and message: ${error.getMessage()}`);
      }
    } else if (error instanceof NetworkError) {
      this.domainEvents.emit(DigitalOceanAccount.EVENT_ACCOUNT_CONNECTIVITY_ISSUE);
    } else {
      console.error(`DigitalOceanSession error: ${error.message}`);
    }
  }
}
