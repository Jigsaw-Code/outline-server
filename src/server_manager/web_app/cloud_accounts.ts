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

import * as accounts from '../model/accounts';
import * as digitalocean from '../model/digitalocean';
import * as gcp from '../model/gcp';
import {DigitalOceanAccount, ShadowboxSettings} from './digitalocean_account';
import {GcpAccount} from './gcp_account';
import {HttpClient} from "../infrastructure/fetch";

type DigitalOceanAccountJson = {
  accessToken: string
};

type GcpAccountJson = {
  refreshToken: string,
};

/**
 * Manages connected cloud provider accounts.
 */
export class CloudAccounts implements accounts.CloudAccounts {
  private readonly LEGACY_DIGITALOCEAN_STORAGE_KEY = 'LastDOToken';
  private readonly DIGITALOCEAN_ACCOUNT_STORAGE_KEY = 'accounts.digitalocean';
  private readonly GCP_ACCOUNT_STORAGE_KEY = 'accounts.gcp';

  private digitalOceanAccount: DigitalOceanAccount = null;
  private gcpAccount: GcpAccount = null;

  constructor(
      private shadowboxSettings: ShadowboxSettings, private isDebugMode: boolean,
      private storage = localStorage) {
    this.load();
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

  /** Loads the saved cloud accounts from disk. */
  private load(): void {
    const digitalOceanAccountJsonString =
        this.storage.getItem(this.DIGITALOCEAN_ACCOUNT_STORAGE_KEY);
    if (!digitalOceanAccountJsonString) {
      const digitalOceanToken = this.loadLegacyDigitalOceanToken();
      if (digitalOceanToken) {
        this.digitalOceanAccount = this.createDigitalOceanAccount(digitalOceanToken);
        this.save();
      }
    } else {
      const digitalOceanAccountJson: DigitalOceanAccountJson =
          JSON.parse(digitalOceanAccountJsonString);
      this.digitalOceanAccount =
          this.createDigitalOceanAccount(digitalOceanAccountJson.accessToken);
    }

    const gcpAccountJsonString = this.storage.getItem(this.GCP_ACCOUNT_STORAGE_KEY);
    if (gcpAccountJsonString) {
      const gcpAccountJson: GcpAccountJson =
          JSON.parse(this.storage.getItem(this.GCP_ACCOUNT_STORAGE_KEY));
      // TODO: Exchange refreshToken for accessToken
      this.gcpAccount = this.createGcpAccount(gcpAccountJson.refreshToken);
    }
  }

  /** Loads legacy DigitalOcean access token. */
  private loadLegacyDigitalOceanToken(): string {
    return this.storage.getItem(this.LEGACY_DIGITALOCEAN_STORAGE_KEY);
  }

  /** Replace the legacy DigitalOcean access token. */
  private saveLegacyDigitalOceanToken(accessToken: string): void {
    this.storage.setItem(this.LEGACY_DIGITALOCEAN_STORAGE_KEY, accessToken);
  }

  private createDigitalOceanAccount(accessToken: string): DigitalOceanAccount {
    return new DigitalOceanAccount(accessToken, this.shadowboxSettings, this.isDebugMode);
  }

  private createGcpAccount(refreshToken: string): GcpAccount {
    return new GcpAccount(refreshToken);
  }

  private save(): void {
    if (this.digitalOceanAccount) {
      const accessToken = this.digitalOceanAccount.getAccessToken();
      const digitalOceanAccountJson: DigitalOceanAccountJson = {accessToken};
      this.storage.setItem(
          this.DIGITALOCEAN_ACCOUNT_STORAGE_KEY, JSON.stringify(digitalOceanAccountJson));

      // Update the persisted legacy DigitalOcean access token.
      this.saveLegacyDigitalOceanToken(accessToken);
    }
    if (this.gcpAccount) {
      const refreshToken = this.gcpAccount.getRefreshToken();
      const gcpAccountJson: GcpAccountJson = {refreshToken};
      this.storage.setItem(this.GCP_ACCOUNT_STORAGE_KEY, JSON.stringify(gcpAccountJson));
    }
  }

  /**
   * Refreshes a GCP access token.
   *
   * @see https://developers.google.com/identity/protocols/oauth2/native-app#offline
   */
  private async refreshGcpAccessToken(clientId: string, refreshToken: string): Promise<string> {
    const oAuthClient = new HttpClient('https://oauth2.googleapis.com/', {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    const data = {
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };
    const response = await oAuthClient.post<RefreshTokenResponse>('token', );
  }
}

type RefreshTokenResponse = Readonly<{
  access_token: string;
  expires_in: number,
}>;
