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

import {Account} from '../model/digitalocean';

export enum CloudId {
  DigitalOcean= 'digitalocean',
}

type DigitalOceanAccountFactory = (id: string, name: string, accessToken: string) => Account;

type AccountJson = {
  type: CloudId,
  account: object,
};

type DigitalOceanAccountJson = {
  uuid: string,
  email: string,
  accessToken: string,
};

export class CloudAccounts {
  // // TODO: Support legacy DigitalOcean account
  // private readonly DIGITALOCEAN_TOKEN_STORAGE_KEY = 'LastDOToken';
  private readonly ACCOUNTS_STORAGE_KEY = 'accounts-storage';

  private accounts: AccountJson[] = [];

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private storage = localStorage) {
    this.accounts = this.readAccountFromStorage();
  }

  connectDigitalOceanAccount(oauthResult: DigitalOceanOAuthResult): Account {
    const digitalOceanAccountJson = {
      uuid: oauthResult.uuid,
      email: oauthResult.email,
      accessToken: oauthResult.accessToken,
    };
    this.addAccount(CloudId.DigitalOcean, digitalOceanAccountJson);
    return this.getDigitalOceanAccount();
  }

  disconnectDigitalOceanAccount(): void {
    this.removeAccount(CloudId.DigitalOcean);
  }

  getDigitalOceanAccount(): Account {
    const accountJson = this.getAccount(CloudId.DigitalOcean);
    if (accountJson) {
      const digitalOceanAccountJson: DigitalOceanAccountJson = JSON.parse(JSON.stringify(accountJson.account));
      return this.digitalOceanAccountFactory(digitalOceanAccountJson.uuid, digitalOceanAccountJson.email, digitalOceanAccountJson.accessToken);
    }
    return null;
  }

  private addAccount(cloudId: CloudId, cloudAccountJson: object): void {
    const accountJson = {
      type: cloudId,
      account: cloudAccountJson,
    };
    this.accounts.push(accountJson);
    this.saveAccountsToStorage();
  }

  private removeAccount(cloudId: CloudId) {
    const index = this.accounts.findIndex((account) => account.type === cloudId);
    if (index > -1) {
      this.accounts.splice(index, 1);
    }
    this.saveAccountsToStorage();
  }

  private getAccount(cloudId: CloudId): AccountJson {
    return this.accounts.find(account => account.type === cloudId);
  }

  private readAccountFromStorage(): AccountJson[] {
    let result = [];
    const accountJsons = this.storage.getItem(this.ACCOUNTS_STORAGE_KEY);
    if (accountJsons) {
      result = JSON.parse(accountJsons);
    }
    return result;
  }

  private saveAccountsToStorage(): void {
    this.storage.setItem(this.ACCOUNTS_STORAGE_KEY, JSON.stringify(this.accounts));
  }
}
