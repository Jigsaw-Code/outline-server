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
import {CloudProviderId} from "../model/cloud";
import {LightsailInstance, LightsailSdkProviderService} from "../cloud/lightsail_api";

export class LightsailServer extends ShadowboxServer implements server.ManagedServer {
  private readonly host: LightsailHost;

  constructor(private instance: LightsailInstance, private lightsailProviderService: LightsailSdkProviderService) {
    super();
    this.host = new LightsailHost(instance, lightsailProviderService);
  }

  getCloudProviderId(): CloudProviderId {
    return CloudProviderId.Lightsail;
  }

  getHost(): ManagedServerHost {
    return this.host;
  }

  isInstallCompleted(): boolean {
    return true;
  }

  async waitOnInstall(resetTimeout: boolean): Promise<void> {
    await this.lightsailProviderService.getInstance(this.instance.id, this.instance.location.id);
  }
}

class LightsailHost implements server.ManagedServerHost {
  constructor(private instance: LightsailInstance, private lightsailProviderService: LightsailSdkProviderService) {}

  async delete(): Promise<void> {
    return this.lightsailProviderService.deleteInstance(this.instance.id, this.instance.location.id);
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
