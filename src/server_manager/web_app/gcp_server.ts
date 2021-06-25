// Copyright 2021 The Outline Authors
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

import * as gcp_api from '../cloud/gcp_api';
import * as errors from '../infrastructure/errors';
import {sleep} from '../infrastructure/sleep';
import {Zone} from '../model/gcp';
import * as server from '../model/server';
import {DataAmount, ManagedServerHost, MonetaryCost} from '../model/server';

import {ShadowboxServer} from './shadowbox_server';

enum InstallState {
  // Unknown state - server may still be installing.
  UNKNOWN = 0,
  // Server is running and has the API URL and certificate fingerprint set.
  SUCCESS,
  // Server is in an error state.
  ERROR,
  // Server has been deleted.
  DELETED
}

export class GcpServer extends ShadowboxServer implements server.ManagedServer {
  private static readonly GUEST_ATTRIBUTES_POLLING_INTERVAL_MS = 5 * 1000;

  private readonly gcpHost: GcpHost;
  private installState: InstallState = InstallState.UNKNOWN;

  constructor(
      id: string, private projectId: string, private instance: gcp_api.Instance,
      private apiClient: gcp_api.RestApiClient) {
    super(id);
    this.gcpHost = new GcpHost(projectId, instance, apiClient, this.onDelete.bind(this));
  }

  getHost(): ManagedServerHost {
    return this.gcpHost;
  }

  isInstallCompleted(): boolean {
    return this.installState !== InstallState.UNKNOWN;
  }

  async waitOnInstall(): Promise<void> {
    while (this.installState === InstallState.UNKNOWN) {
      const zoneId = this.instance.zone.substring(this.instance.zone.lastIndexOf('/') + 1);
      const outlineGuestAttributes =
          await this.getOutlineGuestAttributes(this.projectId, this.instance.id, zoneId);
      if (outlineGuestAttributes.has('apiUrl') && outlineGuestAttributes.has('certSha256')) {
        const certSha256 = outlineGuestAttributes.get('certSha256');
        const apiUrl = outlineGuestAttributes.get('apiUrl');
        trustCertificate(certSha256);
        this.setManagementApiUrl(apiUrl);
        this.installState = InstallState.SUCCESS;
      } else if (outlineGuestAttributes.has('install-error')) {
        this.installState = InstallState.ERROR;
        throw new errors.ServerInstallFailedError();
      }

      await sleep(GcpServer.GUEST_ATTRIBUTES_POLLING_INTERVAL_MS);
    }
  }

  private async getOutlineGuestAttributes(projectId: string, instanceId: string, zone: string):
      Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const guestAttributes =
        await this.apiClient.getGuestAttributes(projectId, instanceId, zone, 'outline/');
    const attributes = guestAttributes?.queryValue?.items ?? [];
    attributes.forEach((entry) => {
      result.set(entry.key, entry.value);
    });
    return result;
  }

  private onDelete() {
    // TODO: Consider setInstallState.
    this.installState = InstallState.DELETED;
  }
}

class GcpHost implements server.ManagedServerHost {
  constructor(
      private projectId: string, private instance: gcp_api.Instance,
      private apiClient: gcp_api.RestApiClient, private deleteCallback: Function) {}

  // TODO: Throw error and show message on failure
  async delete(): Promise<void> {
    const zone = this.getCloudLocation();
    await this.apiClient.deleteStaticIp(this.projectId, this.instance.name, zone.regionId);
    this.apiClient.deleteInstance(this.projectId, this.instance.id, zone.id);
    this.deleteCallback();
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

  getCloudLocation(): Zone {
    const zoneId = this.instance.zone.substring(this.instance.zone.lastIndexOf('/') + 1);
    return new Zone(zoneId);
  }
}
