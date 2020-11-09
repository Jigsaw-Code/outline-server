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

import * as server from '../model/server';
import {DataAmount, ManagedServerHost, MonetaryCost} from '../model/server';

import {ShadowboxServer} from './shadowbox_server';
import {GcpInstance, GcpRestApiProviderService} from "../cloud/gcp_api";
import {CloudProviderId} from "../model/cloud";

export class GcpServer extends ShadowboxServer implements server.ManagedServer {
  private readonly gcpHost: GcpHost;

  constructor(private instance: GcpInstance, private gcpProviderService: GcpRestApiProviderService) {
    super();
    this.gcpHost = new GcpHost(instance, gcpProviderService);
  }

  getCloudProviderId(): CloudProviderId {
    return CloudProviderId.GCP;
  }

  getHost(): ManagedServerHost {
    return this.gcpHost;
  }

  isInstallCompleted(): boolean {
    return true;
  }

  async waitOnInstall(resetTimeout: boolean): Promise<void> {
    await this.gcpProviderService.getInstance(this.instance.id, this.instance.location.id);
  }
}

class GcpHost implements server.ManagedServerHost {
  constructor(private instance: GcpInstance, private gcpProviderService: GcpRestApiProviderService) {}

  async delete(): Promise<void> {
    return this.gcpProviderService.deleteInstance(this.instance.id, this.instance.location.id);
  }

  getHostId(): string {
    return this.instance.id;
  }

  getMonthlyCost(): MonetaryCost {
    return undefined;
  }

  getMonthlyOutboundTransferLimit(): DataAmount {
    return undefined;
  }

  getRegionId(): string {
    return this.instance.location.id;
  }
}
