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
import {Account, CloudId} from "../model/account";

type DigitalOceanAccountFactory = (accessToken: string) => digitalocean.Account;
type GcpAccountFactory = (refreshToken: string) => gcp.Account;

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

export class CloudAccounts {
  private readonly ACCOUNTS_STORAGE_KEY = 'accounts-storage';

  private readonly accounts: Account[] = [];

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private gcpAccountFactory: GcpAccountFactory,
      private storage = localStorage) {
    const accountJsons = this.readAccountsFromStorage();
    this.accounts = accountJsons.map((accountJson) => this.getAccount(accountJson));
  }

  connectDigitalOceanAccount(accessToken: string): digitalocean.Account {
    const accountJson = {
      digitalocean: { accessToken }
    };
    this.addAndSaveAccountJson(accountJson);
    const account = this.getAccount(accountJson) as digitalocean.Account;
    this.accounts.push(account);
    return account;
  }

  connectGcpAccount(refreshToken: string): gcp.Account {
    const accountJson = {
      gcp: { refreshToken }
    };
    this.addAndSaveAccountJson(accountJson);
    const account = this.getAccount(accountJson) as gcp.Account;
    this.accounts.push(account);
    return account;
  }

  disconnectDigitalOceanAccount(): void {
    // TODO:
  }

  disconnectGcpAccount(): void {
    // TODO:
  }

  getDigitalOceanAccount(): digitalocean.Account {
    return this.accounts.find((account) => account.getCloudId() === CloudId.DigitalOcean) as digitalocean.Account;
  }

  getGcpAccount(): gcp.Account {
    return this.accounts.find((account) => account.getCloudId() === CloudId.GCP) as gcp.Account;
  }

  private addAndSaveAccountJson(accountJson: AccountJson): void {
    const accountJsons = this.readAccountsFromStorage();
    accountJsons.push(accountJson);
    this.writeAccountsToStorage(accountJsons);
  }

  private getAccount(accountJson: AccountJson): Account {
    if (accountJson.digitalocean) {
      return this.digitalOceanAccountFactory(accountJson.digitalocean.accessToken);
    } else if (accountJson.gcp) {
      return this.gcpAccountFactory(accountJson.gcp.refreshToken);
    } else {
      return null;
    }
  }

  private readAccountsFromStorage(): AccountJson[] {
    let result = [];
    const accountJsons = this.storage.getItem(this.ACCOUNTS_STORAGE_KEY);
    if (accountJsons) {
      result = JSON.parse(accountJsons);
    }
    return result;
  }

  private writeAccountsToStorage(accountJsons: AccountJson[]): void {
    this.storage.setItem(this.ACCOUNTS_STORAGE_KEY, JSON.stringify(accountJsons));
  }
}
