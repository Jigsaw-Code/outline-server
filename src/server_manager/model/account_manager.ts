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

import {LocalStorageRepository} from "../infrastructure/repository";
import {Account, Data, AccountModelFactory} from "./account";
import * as cloud_provider from "./cloud_provider";

export class AccountManager {
  // TODO: Align generics
  // tslint:disable-next-line:no-any
  private accountModelFactories: Map<cloud_provider.Id, AccountModelFactory<any>>;

  constructor(private accountRepository: LocalStorageRepository<Data, string>) {}

  // tslint:disable-next-line:no-any
  register<T extends Account>(cloudProviderId: cloud_provider.Id, factory: AccountModelFactory<T>) {
    this.accountModelFactories.set(cloudProviderId, factory);
  }

  add<T extends Account>(account: T) {
    this.accountRepository.set(account.getData());
  }

  remove<T extends Account>(account: T) {
    this.accountRepository.remove(account.getData().id);
  }

  list(): Promise<Account[]> {
    const accountDatas = this.accountRepository.list();
    return Promise.all(accountDatas.map((data) => {
      const factory = this.accountModelFactories.get(data.provider);
      return factory.createAccountModel(data);
    }));
  }
}
