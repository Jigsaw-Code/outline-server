/*
  Copyright 2020 The Outline Authors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import {EventEmitter} from 'eventemitter3';

import {KeyValueStorage} from '../../infrastructure/key_value_storage';
import {Account, DigitalOceanCredentials} from '../../model/account';
import {Cloud, CloudProviderId} from '../../model/cloud';
import {ShadowboxSettings} from '../shadowbox_server';

import {DigitalOceanAccount} from './digitalocean_account';

// TODO: Add migration from lastDOToken
export const LEGACY_DIGITALOCEAN_ACCOUNT_ID = '_LEGACY_DIGITALOCEAN_ACCOUNT_ID_';

export class DigitalOceanCloud implements Cloud {
  constructor(
      private domainEvents: EventEmitter, private shadowboxSettings: ShadowboxSettings,
      private storageRepository: KeyValueStorage<PersistedAccount, string>) {}

  getId(): CloudProviderId {
    return CloudProviderId.DigitalOcean;
  }

  getName(): string {
    return 'DigitalOcean';
  }

  listAccounts(): Account[] {
    const persistedAccount = this.storageRepository.get(LEGACY_DIGITALOCEAN_ACCOUNT_ID);
    return persistedAccount ?
        [this.connectAccount(LEGACY_DIGITALOCEAN_ACCOUNT_ID, persistedAccount.credentials)] :
        [];
  }

  connectAccount(id: string, credentials: DigitalOceanCredentials): DigitalOceanAccount {
    const account = new DigitalOceanAccount(
        id, credentials, this.domainEvents, () => this.storageRepository.remove(id),
        this.shadowboxSettings);
    this.storageRepository.set({id, credentials});
    return account;
  }
}

export interface PersistedAccount {
  id: string;
  credentials: DigitalOceanCredentials;
}
