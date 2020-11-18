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

import {LocalStorageRepository} from '../infrastructure/repository';
import {DigitalOceanCloud, PersistedAccount} from '../web_app/digitalocean_app/digitalocean_cloud';
import {ShadowboxSettings} from '../web_app/shadowbox_server';

import {Account} from './account';

export class SupportedClouds {
  private readonly clouds: Cloud[] = [];

  constructor(
      private readonly domainEvents: EventEmitter,
      private readonly shadowboxSettings: ShadowboxSettings) {
    const digitalOceanStorageRepository = new LocalStorageRepository<PersistedAccount, string>(
        'accounts/digitalocean', localStorage, (entry: PersistedAccount) => entry.id);
    const digitalOceanCloud =
        new DigitalOceanCloud(domainEvents, shadowboxSettings, digitalOceanStorageRepository);
    this.clouds.push(digitalOceanCloud);
  }

  get(id: CloudProviderId): Cloud {
    return this.clouds.find((cloud) => cloud.getId() === id);
  }

  listClouds(): Cloud[] {
    return this.clouds;
  }
}

export interface Cloud {
  getId(): CloudProviderId;
  getName(): string;
  listAccounts(): Account[];
}

/** Enumeration of supported cloud providers. */
export enum CloudProviderId {
  DigitalOcean = 'DigitalOcean',
}
