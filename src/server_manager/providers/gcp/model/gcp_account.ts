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
import {AccountData, Account} from "../../../model/account";
import {GcpServer} from "./gcp_server";
import {LocalStorageRepository} from "../../../infrastructure/repository";
import {GcpRestApiProviderService} from "../rest_api_client";
import {OAuthCredential} from "../oauth_client";

export class GcpAccount extends Account {
  constructor(account: AccountData,
              accountRepository: LocalStorageRepository<AccountData, string>,
              protected cloudProviderService: GcpRestApiProviderService) {
    super(account, accountRepository, cloudProviderService);
  }

  async createServer(name: string, projectId: string, locationId: string): Promise<ManagedServer> {
    const instance = await this.cloudProviderService.createInstance(name, "", locationId);
    return new GcpServer(instance, this.cloudProviderService);
  }

  async disconnect(): Promise<void> {
    super.disconnect();
    const oauthCredential = this.account.credential as OAuthCredential;
    if (oauthCredential) {
      await oauthCredential.revoke();
    }
  }
}