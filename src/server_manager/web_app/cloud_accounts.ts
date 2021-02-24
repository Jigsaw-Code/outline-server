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

type DigitalOceanAccountFactory = (accessToken: string) => digitalocean.Account;

export class CloudAccounts {
  private readonly DIGITALOCEAN_TOKEN_STORAGE_KEY = 'LastDOToken';

  constructor(
      private digitalOceanAccountFactory: DigitalOceanAccountFactory,
      private storage = localStorage) { }

  connectDigitalOceanAccount(accessToken: string): digitalocean.Account {
    this.storage.setItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY, accessToken);
    return this.digitalOceanAccountFactory(accessToken);
  }

  disconnectDigitalOceanAccount(): void {
    this.storage.removeItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }

  getDigitalOceanAccount(): digitalocean.Account {
    const accessToken = this.storage.getItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
    return accessToken ? this.digitalOceanAccountFactory(accessToken) : null;
  }
}
