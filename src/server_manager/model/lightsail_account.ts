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

import {LocalStorageRepository} from '../infrastructure/repository';

import * as account from './account';
import * as server from './server';
import {LightsailSdkProviderService} from "../cloud/lightsail_api";
import {LightsailServer} from "../web_app/lightsail_server";
import {CloudProviderId} from "./cloud";

export class LightsailAccount implements account.Account {
  constructor(
      private providerService: LightsailSdkProviderService, private data: account.Data,
      private accountRepository: LocalStorageRepository<account.Data, string>) {}

  getCloudProviderId(): CloudProviderId {
    return CloudProviderId.Lightsail;
  }

  async getEmail(): Promise<string> {
    return 'blah';
  }

  async getStatus(): Promise<string> {
    return 'active';
  }

  async isVerified(): Promise<boolean> {
    return true;
  }

  getData(): account.Data {
    return this.data;
  }

  async getRegionMap(): Promise<Readonly<server.RegionMap>> {
    const locations = await this.providerService.listLocations();
    const regionMap: server.RegionMap = {};
    locations.forEach(location => {
      if (!(location.id in regionMap)) {
        regionMap[location.id] = [];
      }
      regionMap[location.id].push(location.id);
    });
    return regionMap;
  }

  async createServer(region: server.RegionId, name: string): Promise<server.ManagedServer> {
    const instance = await this.providerService.createInstance(name, 'micro_2_0', region);
    return new LightsailServer(instance, this.providerService);
  }

  async listServers(fetchFromHost = true): Promise<server.ManagedServer[]> {
    const instances = await this.providerService.listInstances();
    return Promise.all(
        instances.map((instance) => new LightsailServer(instance, this.providerService)));
  }

  async disconnect(): Promise<void> {
    this.accountRepository.remove(this.data.id);
  }
}