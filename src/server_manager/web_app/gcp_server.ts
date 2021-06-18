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
import {ZoneId} from '../model/gcp';
import {GeoLocation, Zone} from '../model/zone';
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

export function getRegionId(zoneId: ZoneId): string {
  return zoneId.substring(0, zoneId.lastIndexOf('-'));
}

/** @see https://cloud.google.com/compute/docs/regions-zones */
export const LOCATION_MAP: {[regionId: string]: GeoLocation} = {
  'asia-east1': GeoLocation.CHANGHUA,
  'asia-east2': GeoLocation.HONGKONG,
  'asia-northeast1': GeoLocation.TOKYO,
  'asia-northeast2': GeoLocation.OSAKA,
  'asia-northeast3': GeoLocation.SEOUL,
  'asia-south1': GeoLocation.MUMBAI,
  'asia-southeast1': GeoLocation.JURONG_WEST,
  'asia-southeast2': GeoLocation.JAKARTA,
  'australia-southeast1': GeoLocation.SYDNEY,
  'europe-north1': GeoLocation.HAMINA,
  'europe-west1': GeoLocation.ST_GHISLAIN,
  'europe-west2': GeoLocation.LONDON,
  'europe-west3': GeoLocation.FRANKFURT,
  'europe-west4': GeoLocation.EEMSHAVEN,
  'europe-west6': GeoLocation.ZURICH,
  'europe-central2': GeoLocation.WARSAW,
  'northamerica-northeast1': GeoLocation.MONTREAL,
  'southamerica-east1': GeoLocation.OSASCO,
  'us-central1': GeoLocation.COUNCIL_BLUFFS,
  'us-east1': GeoLocation.MONCKS_CORNER,
  'us-east4': GeoLocation.ASHBURN,
  'us-west1': GeoLocation.THE_DALLES,
  'us-west2': GeoLocation.LOS_ANGELES,
  'us-west3': GeoLocation.SALT_LAKE_CITY,
  'us-west4': GeoLocation.LAS_VEGAS,
};

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

  private getZoneId(): ZoneId {
    return this.instance.zone.substring(this.instance.zone.lastIndexOf('/') + 1);
  }

  // TODO: Throw error and show message on failure
  async delete(): Promise<void> {
    const zoneId = this.getZoneId();
    const regionId = getRegionId(zoneId);
    await this.apiClient.deleteStaticIp(this.projectId, this.instance.name, regionId);
    this.apiClient.deleteInstance(this.projectId, this.instance.id, zoneId);
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

  getZone(): Zone {
    const zoneId = this.getZoneId();
    return {
      id: zoneId,
      info: {
        geoLocation: LOCATION_MAP[getRegionId(zoneId)],
        available: true
      }
    };
  }
}
