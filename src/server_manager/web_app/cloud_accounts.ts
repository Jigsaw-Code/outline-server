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

import * as cloud from '../model/cloud';
import * as digitalocean from '../model/digitalocean';
import * as gcp from '../model/gcp';
import {DigitalOceanAccount, ShadowboxSettings} from './digitalocean_account';
import {GcpAccount} from './gcp_account';

export type AccountJson = {
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
export class CloudAccounts implements cloud.CloudAccounts {
  private readonly LEGACY_DIGITALOCEAN_STORAGE_KEY = 'LastDOToken';
  private readonly ACCOUNTS_STORAGE_KEY = 'accounts-storage';

  private digitalOceanAccount: DigitalOceanAccount = null;
  private gcpAccount: GcpAccount = null;

  constructor(
      private shadowboxSettings: ShadowboxSettings,
      private isDebugMode: boolean,
      private storage = localStorage) {}

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
        this.digitalOceanAccount = this.createDigitalOceanAccount(digitalOceanToken);
      }
      this.save();
    }

    const accountJsons: AccountJson[] = accountJsonsString ? JSON.parse(accountJsonsString) : [];
    accountJsons.forEach((accountJson) => {
      if (accountJson.digitalocean) {
        this.digitalOceanAccount =
            this.createDigitalOceanAccount(accountJson.digitalocean.accessToken);
      } else if (accountJson.gcp) {
        this.gcpAccount = this.createGcpAccount(accountJson.gcp.refreshToken);
      }
    });
  }

  /** See {@link CloudAccounts#connectDigitalOceanAccount} */
  connectDigitalOceanAccount(accessToken: string): digitalocean.Account {
    this.digitalOceanAccount = this.createDigitalOceanAccount(accessToken);
    this.save();
    return this.digitalOceanAccount;
  }

  /** See {@link CloudAccounts#connectGcpAccount} */
  connectGcpAccount(refreshToken: string): gcp.Account {
    this.gcpAccount = this.createGcpAccount(refreshToken);
    this.save();
    return this.gcpAccount;
  }

  /** See {@link CloudAccounts#disconnectDigitalOceanAccount} */
  disconnectDigitalOceanAccount(): void {
    this.digitalOceanAccount = null;
    this.save();
  }

  /** See {@link CloudAccounts#disconnectGcpAccount} */
  disconnectGcpAccount(): void {
    this.gcpAccount = null;
    this.save();
  }

  /** See {@link CloudAccounts#getDigitalOceanAccount} */
  getDigitalOceanAccount(): digitalocean.Account {
    return this.digitalOceanAccount;
  }

  /** See {@link CloudAccounts#getGcpAccount} */
  getGcpAccount(): gcp.Account {
    return this.gcpAccount;
  }

  private createDigitalOceanAccount(accessToken: string): DigitalOceanAccount {
    return new DigitalOceanAccount(accessToken, this.shadowboxSettings, this.isDebugMode);
  }

  private createGcpAccount(refreshToken: string): GcpAccount {
    return new GcpAccount(refreshToken);
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
      const refreshToken = this.gcpAccount.getRefreshToken();
      const accountJson = {gcp: {refreshToken}};
      accountJsons.push(accountJson);
    }
    this.storage.setItem(this.ACCOUNTS_STORAGE_KEY, JSON.stringify(accountJsons));
  }
}
