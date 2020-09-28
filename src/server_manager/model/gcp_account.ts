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

import {LocalStorageRepository} from '../infrastructure/repository';
import {GcpRestApiProviderService} from '../web_app/gcp_app/services/rest_api_client';
import {GcpServer} from '../web_app/gcp_server';

import * as account from './account';
import * as server from './server';

export class GcpAccount implements account.Account {
  constructor(
      private gcpProviderService: GcpRestApiProviderService, private data: account.Data,
      private accountRepository: LocalStorageRepository<account.Data, string>) {}

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
    const locations = await this.gcpProviderService.listLocations();
    const regionMap: server.RegionMap = {};
    locations.forEach(location => {
      regionMap[location.id].push(location.id);
    });
    return regionMap;
  }

  async createServer(region: server.RegionId, name: string): Promise<server.ManagedServer> {
    const instance = await this.gcpProviderService.createInstance(name, 'f1-micro', region);
    return new GcpServer(instance, this.gcpProviderService);
  }

  async listServers(fetchFromHost = true): Promise<server.ManagedServer[]> {
    const instances = await this.gcpProviderService.listInstances();
    return Promise.all(
        instances.map((instance) => new GcpServer(instance, this.gcpProviderService)));
  }

  async disconnect(): Promise<void> {
    this.accountRepository.remove(this.data.id);
  }
}
