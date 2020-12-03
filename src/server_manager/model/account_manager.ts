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

import {Account, AccountId, DigitalOceanCredentials} from './account';
import {DigitalOceanAccount} from '../web_app/digitalocean_app/model/account';

/**
 * A rich domain model that provides functionality to connect and manage cloud
 * provider accounts.
 */
export interface AccountManager {
  /** Loads existing DigitalOcean account credentials. */
  loadDigitalOceanAccount(): Promise<DigitalOceanAccount|undefined>;

  /**
   * Connects to a DigitalOcean account.
   *
   * @param credentials - DigitalOcean account credentials.
   */
  connectDigitalOceanAccount(credentials: DigitalOceanCredentials): Promise<DigitalOceanAccount>;

  // TODO: Don't expose this
  remove<T extends Account>(id: AccountId): void;
}

/**
 * Factory interface for creating account domain models from persisted state.
 */
export interface AccountFactory<T extends Account> {
  constructAccount(persistedAccount: PersistedAccount): Promise<T>;
}

/** Account domain model persisted state */
export interface PersistedAccount {
  id: AccountId;
  credentials: object;
}
