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

import {DigitalOceanSession} from '../cloud/digitalocean_api';
import {DigitalOceanAccount} from './digitalocean_account';

type DigitalOceanSessionFactory = (accessToken: string) => DigitalOceanSession;
type DigitalOceanAccountFactory = (session: DigitalOceanSession) => DigitalOceanAccount;

// TODO: this class combines URL manipulation with persistence logic.
// Consider moving the URL manipulation logic to a separate class, so we
// can pass in other implementations when the global "window" is not present.
export class CloudAccounts {
  private readonly DIGITALOCEAN_TOKEN_STORAGE_KEY = 'LastDOToken';

  constructor(
      private digitalOceanSessionFactory: DigitalOceanSessionFactory,
      private digitalOceanAccountFactory: DigitalOceanAccountFactory) {}

  connectDigitalOceanAccount(token: string): DigitalOceanAccount {
    this.writeTokenToStorage(token);
    return this.getDigitalOceanAccount();
  }

  disconnectDigitalOceanAccount(): void {
    localStorage.removeItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }

  getDigitalOceanAccount(): DigitalOceanAccount {
    const token = this.getTokenFromStorage();
    if (token) {
      const digitalOceanSession = this.digitalOceanSessionFactory(token);
      return this.digitalOceanAccountFactory(digitalOceanSession);
    }
    return null;
  }

  private writeTokenToStorage(token: string): void {
    localStorage.setItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY, token);
  }

  private getTokenFromStorage(): string {
    return localStorage.getItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }
}
