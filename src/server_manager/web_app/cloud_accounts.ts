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

type DigitalOceanAccountFactory =
    (id: string, name: string, accessToken: string) => Account;

type PersistedDigitalOceanAccount = {
  id: string,
  name: string,
  credential: string,
};

enum CloudId {
  DigitalOcean,
}

export class CloudAccounts {
  // TODO: We need to migrate this if we decide to use the same key.
  private readonly DIGITALOCEAN_TOKEN_STORAGE_KEY = 'LastDOToken';

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private storage = localStorage) {}

  connectDigitalOceanAccount(oauthResult: DigitalOceanOAuthResult): Account {
    const persistedAccount = {
      id: oauthResult.uuid,
      name: oauthResult.email,
      credential: oauthResult.accessToken,
    };
    this.writeDigitalOceanAccount(persistedAccount);
    return this.getDigitalOceanAccount();
  }

  disconnectDigitalOceanAccount(): void {
    this.storage.removeItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }

  getDigitalOceanAccount(): Account {
    const persistedAccount = this.readDigitalOceanAccount();
    if (persistedAccount) {
      const accountId = this.makeUniqueAccountId(persistedAccount.id, CloudId.DigitalOcean);
      return this.digitalOceanAccountFactory(
          accountId, persistedAccount.name, persistedAccount.credential);
    }
    return null;
  }

  private writeDigitalOceanAccount(persistedAccount: PersistedDigitalOceanAccount): void {
    this.storage.setItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY, JSON.stringify(persistedAccount));
  }

  private readDigitalOceanAccount(): PersistedDigitalOceanAccount {
    let result = null;
    const data = this.storage.getItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
    if (data) {
      result = JSON.parse(data);
    }
    return result;
  }

  private makeUniqueAccountId(cloudSpecificAccountId: string, cloudId: CloudId): string {
    return `${cloudId}#${cloudSpecificAccountId}`;
  }
}
