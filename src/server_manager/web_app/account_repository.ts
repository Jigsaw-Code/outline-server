// Copyright 2018 The Outline Authors
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

import {KeyValueStorage} from '../infrastructure/key_value_storage';
import {CloudProviderId} from '../model/cloud';
import {ManagedServerRepository} from '../model/server';
import {DigitalOceanServerRepositoryFactory, DigitalOceanSessionFactory} from './app';

// TODO: Make generic once we introduce the Account model.
export interface AccountPersistence {
  save(): Promise<object>;
  load(account: object): Promise<ManagedServerRepository>;
}

interface PersistedAccount {
  cloudProviderId: CloudProviderId;
  account: object;
}

export class AccountRepository {
  private accountModelFactories: Map<CloudProviderId, AccountPersistence> = new Map();

  constructor(
      private accountRepository: KeyValueStorage<PersistedAccount, string>,
      private storageKey: string) {
    this.accountModelFactories.set(
        CloudProviderId.DigitalOcean,
    );
  }

  getDigitalOceanAccount(): ManagedServerRepository {}

  setDigitalOceanAccount(account: ManagedServerRepository): Promise<void> {}

  list(): Promise<ManagedServerRepository> {}
}

interface DigitalOceanAccount {
  id: string;
  accessToken: string;
}

class DigitalOceanAccountPersistence implements AccountPersistence {
  constructor(
      private createDigitalOceanSession: DigitalOceanSessionFactory,
      private createDigitalOceanServerRepository: DigitalOceanServerRepositoryFactory) {}

  load(account: object): Promise<ManagedServerRepository> {
    const digitalOceanAccount = account as DigitalOceanAccount;
    const session = this.createDigitalOceanSession(digitalOceanAccount.accessToken);
    return this.createDigitalOceanServerRepository(session);
  }

  save(): Promise<object> {
    return undefined;
  }
}
