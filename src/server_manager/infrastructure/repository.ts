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

import {Account, AccountId} from '../model/account';

export class LocalStorageRepository {
  private readonly accounts: Account[] = [];  // TODO: Switch to map
  constructor(private storageKey: string, private storage: Storage) {
    const serialized = storage.getItem(storageKey);
    if (serialized != null) {
      this.accounts = JSON.parse(serialized);
    }
  }

  add(account: Account): void {
    this.remove(account.id);
    this.accounts.push(account);
    this.save();
  }

  remove(id: AccountId): void {
    const index = this.accounts.findIndex((account) => this.compareAccountId(account.id, id));
    if (index > -1) {
      this.accounts.splice(index, 1);
    }
    this.save();
  }

  get(id: AccountId): Account|undefined {
    return this.accounts.find((account) => this.compareAccountId(account.id, id));
  }

  list(): Account[] {
    return Array.from(this.accounts.values());
  }

  private compareAccountId(first: AccountId, second: AccountId) {
    return first.name === second.name && first.provider === second.provider;
  }

  private save(): void {
    const serialized = JSON.stringify(this.list());
    this.storage.setItem(this.storageKey, serialized);
  }
}
