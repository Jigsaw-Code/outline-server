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
import {LocalStorageRepository} from '../infrastructure/repository';

import {Account, AccountId, DigitalOceanCredentials} from './account';
import {CloudProviderId} from './cloud';
import {DigitalOceanAccount} from '../web_app/digitalocean_app/digitalocean_account';
import {DigitalOceanConnectAccountApp} from '../web_app/digitalocean_app/connect_account_app';

export const ACCOUNT_MANAGER_KEY_EXTRACTOR = (entry: PersistedAccount) => entry.id;
export const ACCOUNT_MANAGER_KEY_COMPARATOR = (k1: AccountId, k2: AccountId) =>
    k1.cloudProviderId === k2.cloudProviderId &&
    k1.cloudSpecificId === k2.cloudSpecificId;

// TODO: Add migration from lastDOToken
export const LEGACY_DIGITALOCEAN_ACCOUNT_ID: AccountId = {
  cloudSpecificId: '_LEGACY_DIGITALOCEAN_ACCOUNT_ID_',
  cloudProviderId: CloudProviderId.DigitalOcean,
};

/**
 * A rich domain model that provides functionality to connect and manage cloud
 * provider accounts.
 */
export class AccountManager {
  // tslint:disable-next-line:no-any
  private accountFactories: Map<CloudProviderId, AccountFactory<any>> = new Map();

  constructor(private storageRepository: LocalStorageRepository<PersistedAccount, AccountId>) {}

  initializeCloudProviders(digitalOceanConnectAccountApp: DigitalOceanConnectAccountApp) {
    this.register(CloudProviderId.DigitalOcean, digitalOceanConnectAccountApp);
  }

  /** Loads existing DigitalOcean account credentials. */
  async loadDigitalOceanAccount(): Promise<DigitalOceanAccount|undefined> {
    return this.find(LEGACY_DIGITALOCEAN_ACCOUNT_ID) as Promise<DigitalOceanAccount|undefined>;
  }

  /**
   * Connects to a DigitalOcean account.
   *
   * @param credentials - DigitalOcean account credentials.
   */
  async connectDigitalOceanAccount(credentials: DigitalOceanCredentials): Promise<DigitalOceanAccount> {
    const persistedAccount = {
      id: LEGACY_DIGITALOCEAN_ACCOUNT_ID,
      credentials: credentials as unknown as object,
    };
    const account = await this.accountFactories.get(CloudProviderId.DigitalOcean).constructAccount(persistedAccount);
    this.add(account);
    return account;
  }

  /** Lists all connected accounts. */
  listAccounts(): Promise<Account[]> {
    const persistedAccounts = this.storageRepository.list();
    return Promise.all(persistedAccounts.map((entry) => {
      return this.loadAccount(entry);
    }));
  }

  // TODO: Don't expose this
  remove<T extends Account>(id: AccountId): void {
    this.storageRepository.remove(id);
  }

  private async find(id: AccountId): Promise<Account|undefined> {
    const persistedAccount = this.storageRepository.get(id);
    return persistedAccount ? this.loadAccount(persistedAccount) : undefined;
  }

  private add<T extends Account>(account: T): void {
    const persistedAccount = this.saveAccount(account);
    this.storageRepository.set(persistedAccount);
  }

  private register<T extends Account>(cloudProviderId: CloudProviderId, factory: AccountFactory<T>) {
    this.accountFactories.set(cloudProviderId, factory);
  }

  private loadAccount(persistedAccount: PersistedAccount) {
    return this.accountFactories.get(persistedAccount.id.cloudProviderId)
        .constructAccount(persistedAccount);
  }

  private saveAccount<T extends Account>(account: T): PersistedAccount {
    return {
      id: account.getId(),
      credentials: account.getCredentials(),
    };
  }
}

export interface PersistedAccount {
  id: AccountId;
  credentials: object;
}

export interface AccountFactory<T extends Account> {
  constructAccount(persistedAccount: PersistedAccount): Promise<T>;
}
