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

  // TODO: Consider passing the refreshToken instead of the client.
  constructor(
      private projectId: string, private instance: gcp_api.Instance,
      private apiClient: gcp_api.RestApiClient) {
    super(instance.id);
    this.gcpHost = new GcpHost(projectId, instance, apiClient);
  }

  getHost(): ManagedServerHost {
    return this.gcpHost;
  }

  isInstallCompleted(): boolean {
    return this.installState !== InstallState.UNKNOWN;
  }

  async waitOnInstall(): Promise<void> {
    while (this.installState === InstallState.UNKNOWN) {
      const outlineGuestAttributes = await this.getOutlineGuestAttributes(
          this.projectId, this.instance.id, this.instance.zone);
      if (outlineGuestAttributes.has('apiUrl') && outlineGuestAttributes.has('certSha256')) {
        const certSha256 = outlineGuestAttributes.get('certSha256');
        const apiUrl = outlineGuestAttributes.get('apiUrl');
        trustCertificate(btoa(certSha256));
        this.setManagementApiUrl(apiUrl);
        this.installState = InstallState.SUCCESS;
      } else if (outlineGuestAttributes.has('install-error')) {
        this.installState = InstallState.ERROR;
        throw new errors.ServerInstallFailedError();
      }

      await sleep(GcpServer.GUEST_ATTRIBUTES_POLLING_INTERVAL_MS);
    }

    // TODO: Handle user clicking cancel and deleting server.
  }

  private async getOutlineGuestAttributes(projectId: string, instanceId: string, zone: string):
      Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const guestAttributes =
        await this.apiClient.getGuestAttributes(projectId, instanceId, zone, 'outline/');
    // console.log(`Guest attributes: ${JSON.stringify(guestAttributes)}`);
    const attributes = guestAttributes?.queryValue?.items;
    if (attributes) {
      const apiUrlAttr = attributes.find((attribute) => {
        return attribute.key === 'apiUrl';
      });
      const certSha256Attr = attributes.find((attribute) => {
        return attribute.key === 'certSha256';
      });
      const installErrorAttr = attributes.find((attribute) => {
        return attribute.key === 'install-error';
      });

      if (apiUrlAttr) {
        result.set('apiUrl', apiUrlAttr.value);
      }
      if (certSha256Attr) {
        result.set('certSha256', certSha256Attr.value);
      }
      if (installErrorAttr) {
        result.set('install-error', installErrorAttr.value);
      }
    }
    return result;
  }
}

class GcpHost implements server.ManagedServerHost {
  constructor(
      private projectId: string, private instance: gcp_api.Instance,
      private apiClient: gcp_api.RestApiClient) {}

  async delete(): Promise<void> {
    await this.apiClient.deleteInstance(this.projectId, this.instance.id, this.instance.zone);
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
    return this.instance.zone;
  }
}
