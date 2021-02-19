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

type DigitalOceanAccountFactory = (accessToken: string) => Account;

export class CloudAccounts {
  private readonly DIGITALOCEAN_TOKEN_STORAGE_KEY = 'LastDOToken';

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private storage = localStorage) {}

  connectDigitalOceanAccount(token: string): Account {
    this.writeTokenToStorage(token);
    return this.getDigitalOceanAccount();
  }

  disconnectDigitalOceanAccount(): void {
    this.storage.removeItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }

  getDigitalOceanAccount(): Account {
    const token = this.getTokenFromStorage();
    if (token) {
      return this.digitalOceanAccountFactory(token);
    }
    return null;
  }

  private writeTokenToStorage(token: string): void {
    this.storage.setItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY, token);
  }

  private getTokenFromStorage(): string {
    return this.storage.getItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }
}
