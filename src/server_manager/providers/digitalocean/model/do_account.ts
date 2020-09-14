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

import {ManagedServer} from "../../../model/server";
import {Account, AccountData} from "../../../model/account";
import {DigitaloceanServer} from "../../../web_app/digitalocean_server";
import {LocalStorageRepository} from "../../../infrastructure/repository";
import {GcpRestApiProviderService} from "../../gcp/rest_api_client";
import {createDigitalOceanSession, DigitalOceanSession} from "../../../cloud/digitalocean_api";

export class DigitalOceanAccount extends Account {
  constructor(account: AccountData,
              accountRepository: LocalStorageRepository<AccountData, string>,
              cloudProviderService: GcpRestApiProviderService,
              private digitalOcean: DigitalOceanSession) {
    super(account, accountRepository, cloudProviderService);
  }

  async createServer(name: string, locationId: string): Promise<ManagedServer> {
    const instance = await this.cloudProviderService.createInstance(name, "", locationId);
    const accessToken = this.account.credential as string;
    const legacyDOClient = createDigitalOceanSession(accessToken);
    const dropletInfo = await legacyDOClient.getDroplet(Number(instance.id));
    return new DigitaloceanServer(this.digitalOcean, dropletInfo);
  }
}