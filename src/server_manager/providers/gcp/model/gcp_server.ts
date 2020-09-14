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

import {ShadowboxServer} from "../../../web_app/shadowbox_server";
import * as server from "../../../model/server";
import {DataAmount, ManagedServerHost, MonetaryCost} from "../../../model/server";
import {GcpRestApiProviderService} from "../rest_api_client";
import {Instance} from "../../../cloud/cloud_provider_service";

export class GcpServer extends ShadowboxServer implements server.ManagedServer, server.ManagedServerHost  {
  constructor(private instance: Instance,
              private gcpProviderService: GcpRestApiProviderService) {
    super();
    this.waitOnInstall(true)
        .then(() => {
          this.setInstallCompleted();
        })
        .catch((e) => {
          console.error(`error installing server: ${e.message}`);
        });
  }

  getHost(): ManagedServerHost {
    return this;
  }

  isInstallCompleted(): boolean {
    return localStorage.getItem(this.getInstallCompletedStorageKey()) === 'true';
  }

  async waitOnInstall(resetTimeout: boolean): Promise<void> {
    const instance = await this.gcpProviderService.getInstance(this.instance.id, this.instance.location.id);
    const managementApiUrl = instance.labels!.get("apiUrl")!;
    this.setManagementApiUrl(managementApiUrl);
    this.isHealthy();
  }

  delete(): Promise<void> {
    return this.gcpProviderService.deleteInstance(this.instance.id, this.instance.location.id);
  }

  getHostId(): string {
    return this.instance.id;
  }

  getMonthlyCost(): MonetaryCost {
    return {
      usd: undefined,
    };
  }

  getMonthlyOutboundTransferLimit(): DataAmount {
    return {
      terabytes: undefined,
    };
  }

  getRegionId(): string {
    return this.instance.location.id;
  }


  private getInstallCompletedStorageKey() {
    return `gcp-${this.instance.id}-install-completed`;
  }

  private setInstallCompleted() {
    localStorage.setItem(this.getInstallCompletedStorageKey(), 'true');
  }
}