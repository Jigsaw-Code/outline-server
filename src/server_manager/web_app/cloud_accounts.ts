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

type DigitalOceanAccountFactory = (accessToken: string) => digitalocean.Account;
type GcpAccountFactory = (refreshToken: string) => gcp.Account;

// ** DO NOT CHANGE THE VALUE **
// This identifier is persisted. Consider creating a new type like CloudAccountStorageKey below.
enum CloudId {
  DigitalOcean = 'digitalocean',
  GCP = 'gcp',
}

// type CloudAccountStorageKey<C extends CloudId> =
//   C extends CloudId.DigitalOcean ? 'digitalocean' :
//   C extends CloudId.GCP ? 'gcp' : 'unknown';

type CloudAccountJson<C extends CloudId> =
    C extends CloudId.DigitalOcean ? DigitalOceanAccountJson :
    C extends CloudId.GCP ? GcpAccountJson :
    null;

type AccountJson = {
  [C in CloudId]?: CloudAccountJson<CloudId>
};

type DigitalOceanAccountJson = {
  accessToken: string
};

type GcpAccountJson = {
  refreshToken: string,
};

export class CloudAccounts {
  private readonly ACCOUNTS_STORAGE_KEY = 'accounts-storage';

  private readonly accounts: AccountJson[] = [];

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private gcpAccountFactory: GcpAccountFactory,
      private storage = localStorage) {
    this.accounts = this.readAccountFromStorage();
  }

  connectDigitalOceanAccount(accessToken: string): digitalocean.Account {
    this.addAccount(CloudId.DigitalOcean, { accessToken });
    return this.getDigitalOceanAccount();
  }

  connectGcpAccount(refreshToken: string): gcp.Account {
    this.addAccount(CloudId.GCP, { refreshToken });
    return this.getGcpAccount();
  }

  disconnectDigitalOceanAccount(): void {
    this.removeAccount(CloudId.DigitalOcean);
    this.writeAccountsToStorage();
  }

  disconnectGcpAccount(): void {
    this.removeAccount(CloudId.GCP);
    this.writeAccountsToStorage();
  }

  getDigitalOceanAccount(): digitalocean.Account {
    const digitalOceanAccountJson = this.getAccountJson(CloudId.DigitalOcean) as DigitalOceanAccountJson;
    return digitalOceanAccountJson ? this.digitalOceanAccountFactory(digitalOceanAccountJson.accessToken) : null;
  }

  getGcpAccount(): gcp.Account {
    const gcpAccountJson = this.getAccountJson(CloudId.GCP) as GcpAccountJson;
    return gcpAccountJson ? this.gcpAccountFactory(gcpAccountJson.refreshToken) : null;
  }

  private addAccount(cloudId: CloudId, cloudAccountJson: CloudAccountJson<CloudId>): void {
    const accountJson = {
      [cloudId]: cloudAccountJson
    };
    this.accounts.push(accountJson);
    this.writeAccountsToStorage();
  }

  private removeAccount(cloudId: CloudId): void {
    const index = this.accounts.findIndex((account) => account.hasOwnProperty(cloudId));
    if (index > -1) {
      this.accounts.splice(index, 1);
    }
    this.writeAccountsToStorage();
  }

  private getAccountJson(cloudId: CloudId): CloudAccountJson<CloudId> {
    const accountJson = this.accounts.find((account) => account.hasOwnProperty(cloudId));
    return accountJson ? accountJson[cloudId] : null;
  }

  private readAccountFromStorage(): AccountJson[] {
    let result = [];
    const accountJsons = this.storage.getItem(this.ACCOUNTS_STORAGE_KEY);
    if (accountJsons) {
      result = JSON.parse(accountJsons);
    }
    return result;
  }

  private writeAccountsToStorage(): void {
    this.storage.setItem(this.ACCOUNTS_STORAGE_KEY, JSON.stringify(this.accounts));
  }
}
