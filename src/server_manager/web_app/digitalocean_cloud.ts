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

import {DigitalOceanAccount} from "./digitalocean_account";
import {createDigitalOceanSession} from "../cloud/digitalocean_api";
import {ShadowboxSettings} from "./shadowbox_server";
import {Cloud} from "../model/cloud";

export class DigitalOceanCloud implements Cloud {
  private static readonly ACCOUNT_STORAGE_KEY = 'DigitalOceanAccounts';

  private readonly accounts = new Set<string>();

  constructor(
      private storage: Storage, private shadowboxSettings: ShadowboxSettings,
      private debugMode: boolean) {
    const serialized = storage.getItem(DigitalOceanCloud.ACCOUNT_STORAGE_KEY);
    if (serialized != null) {
      (JSON.parse(serialized) as string[]).map((account) => this.accounts.add(account));
    }
  }

  connectAccount(accessToken: string): DigitalOceanAccount {
    this.addAccount(accessToken);
    return this.createDigitalOceanAccount(accessToken);
  }

  listAccounts(): DigitalOceanAccount[] {
    return [...this.accounts].map((accessToken) => this.createDigitalOceanAccount(accessToken));
  }

  private createDigitalOceanAccount(accessToken: string): DigitalOceanAccount {
    const doApiClient = createDigitalOceanSession(accessToken);
    return new DigitalOceanAccount(doApiClient, this.shadowboxSettings, this.debugMode, () => this.deleteAccount(accessToken));
  }

  private deleteAccount(accessToken: string): void {
    this.accounts.delete(accessToken);
    this.saveAccounts();
  }

  private addAccount(accessToken: string): void {
    this.accounts.add(accessToken);
    this.saveAccounts();
  }

  private saveAccounts(): void {
    this.storage.setItem(DigitalOceanCloud.ACCOUNT_STORAGE_KEY, JSON.stringify([...this.accounts]));
  }
}
