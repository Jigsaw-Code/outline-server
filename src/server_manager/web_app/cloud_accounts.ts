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

import * as digitalocean from '../model/digitalocean';
import * as gcp from '../model/gcp';
import {DigitalOceanAccount} from './digitalocean_account';
import {GcpAccount} from './gcp_account';

type DigitalOceanAccountFactory = (accessToken: string) => DigitalOceanAccount;
type GcpAccountFactory = (refreshToken: string) => GcpAccount;

type AccountJson = {
  digitalocean?: DigitalOceanAccountJson,
  gcp?: GcpAccountJson,
};

type DigitalOceanAccountJson = {
  accessToken: string
};

type GcpAccountJson = {
  refreshToken: string,
};

/**
 * Manages connected cloud provider accounts.
 */
export class CloudAccounts {
  private readonly LEGACY_DIGITALOCEAN_STORAGE_KEY = 'LastDOToken';
  private readonly ACCOUNTS_STORAGE_KEY = 'accounts-storage';

  private digitalOceanAccount: DigitalOceanAccount = null;
  private gcpAccount: GcpAccount = null;

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private gcpAccountFactory: GcpAccountFactory, private storage = localStorage) {}

  /**
   * Loads the saved cloud accounts from disk.
   *
   * NOTE: This method must be called before calls to any other CloudAccounts
   * methods. Failure to do so may result in accounts being disconnected or
   * overwritten.
   */
  load(): void {
    const accountJsonsString = this.storage.getItem(this.ACCOUNTS_STORAGE_KEY);

    // Migrate any legacy DigitalOcean access token.
    if (!accountJsonsString) {
      const digitalOceanToken = this.storage.getItem(this.LEGACY_DIGITALOCEAN_STORAGE_KEY);
      if (digitalOceanToken) {
        this.digitalOceanAccount = this.digitalOceanAccountFactory(digitalOceanToken);
      }
      this.save();
    }

    const accountJsons: AccountJson[] = accountJsonsString ? JSON.parse(accountJsonsString) : [];
    accountJsons.forEach((accountJson) => {
      if (accountJson.digitalocean) {
        this.digitalOceanAccount =
            this.digitalOceanAccountFactory(accountJson.digitalocean.accessToken);
      } else if (accountJson.gcp) {
        this.gcpAccount = this.gcpAccountFactory(accountJson.gcp.refreshToken);
      }
    });
  }

  /**
   * Connects a DigitalOcean account.
   *
   * Only one DigitalOcean account can be connected at any given time.
   * Subsequent calls to this method will overwrite any previously connected
   * DigtialOcean account.
   *
   * @param accessToken: The DigitalOcean access token.
   */
  connectDigitalOceanAccount(accessToken: string): digitalocean.Account {
    this.digitalOceanAccount = this.digitalOceanAccountFactory(accessToken);
    this.save();
    return this.digitalOceanAccount;
  }

  /**
   * Connects a Google Cloud Platform account.
   *
   * Only one Google Cloud Platform account can be connected at any given time.
   * Subsequent calls to this method will overwrite any previously connected
   * Google Cloud Platform account.
   *
   * @param refreshToken: The GCP refresh token.
   */
  connectGcpAccount(refreshToken: string): gcp.Account {
    this.gcpAccount = this.gcpAccountFactory(refreshToken);
    this.save();
    return this.gcpAccount;
  }

  /**
   * Disconnects the DigitalOcean account.
   */
  disconnectDigitalOceanAccount(): void {
    this.digitalOceanAccount = null;
    this.save();
  }

  /**
   * Disconnects the Google Cloud Platform account.
   */
  disconnectGcpAccount(): void {
    this.gcpAccount = null;
    this.save();
  }

  /**
   * @returns the connected DigitalOcean account (or null if none exists).
   */
  getDigitalOceanAccount(): digitalocean.Account {
    return this.digitalOceanAccount;
  }

  /**
   * @returns the connected Google Cloud Platform account (or null if none exists).
   */
  getGcpAccount(): gcp.Account {
    return this.gcpAccount;
  }

  private save(): void {
    const accountJsons: AccountJson[] = [];
    if (this.digitalOceanAccount) {
      const accessToken = this.digitalOceanAccount.getAccessToken();
      const accountJson = {digitalocean: {accessToken}};
      accountJsons.push(accountJson);

      // Replace the legacy DigitalOcean access token.
      this.storage.setItem(this.LEGACY_DIGITALOCEAN_STORAGE_KEY, accessToken);
    }
    if (this.gcpAccount) {
      const accountJson = {gcp: {refreshToken: this.gcpAccount.getRefreshToken()}};
      accountJsons.push(accountJson);
    }
    this.storage.setItem(this.ACCOUNTS_STORAGE_KEY, JSON.stringify(accountJsons));
  }
}
