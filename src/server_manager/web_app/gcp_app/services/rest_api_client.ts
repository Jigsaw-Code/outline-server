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

import * as cloud from './cloud';
import * as cloud_provider from '../../../model/cloud_provider';
import {SCRIPT} from './install_script';
import {sleep} from '../../../infrastructure/sleep';
import {HttpClient} from '../../../infrastructure/fetch';
import {encodeFormData} from "../../../electron_app/fetch";

export class OAuthCredential {
  private accessToken?: string;

  constructor(private refreshToken: string) {
  }

  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  async refresh(): Promise<void> {
    this.accessToken = await refreshAccessToken(this.refreshToken);
  }

  async revoke(): Promise<void> {
    if (this.accessToken) {
      await revokeToken(this.accessToken);
    }
    if (this.refreshToken) {
      await revokeToken(this.refreshToken);
    }
  }
}

type RefreshAccessTokenResponse = Readonly<{
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}>;

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const authClient = new HttpClient("https://oauth2.googleapis.com/", {
    Host: "oauth2.googleapis.com",
    "Content-Type": "application/x-www-form-urlencoded",
  });

  const data = {
    // TODO: Duplicated from gcp_oauth_client.
    client_id: "276807089705-mbga5q4kilo17ikc20ttadtdvb4d25gd.apps.googleusercontent.com",
    client_secret: "cBFKMxmcHRWvjXF_GUTjXH8R",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  console.log(`formdata: ${encodeFormData(data)}`);
  const refreshAccessTokenResponse = await authClient.post<RefreshAccessTokenResponse>("token", encodeFormData(data));
  return refreshAccessTokenResponse.access_token;
}

export async function revokeToken(token: string) {
  const authClient = new HttpClient("https://oauth2.googleapis.com/", {
    Host: "oauth2.googleapis.com",
    "Content-Type": "application/x-www-form-urlencoded",
  });

  const queryString = `?token=${token}`;
  await authClient.get<void>(`revoke${queryString}`);
}


type Instance = Readonly<{
  id: string;
  creationTimestamp: string;
  name: string;
  description: string;
  tags: {
    items: string[];
    fingerprint: string;
  };
  machineType: string;
  zone: string;
  networkInterfaces: Array<{
    network: string;
    subnetwork: string;
    networkIP: string;
    ipv6Address: string;
    name: string;
    accessConfigs: Array<{
      type: string;
      name: string;
      natIP: string;
      setPublicPtr: boolean;
      publicPtrDomainName: string;
      networkTier: string;
      kind: string;
    }>;
  }>;
}>;
type GuestAttributes = Readonly<{
  variableKey: string;
  variableValue: string;
  queryPath: string;
  queryValue: {
    items: Array<{
      namespace: string;
      key: string;
      value: string;
    }>;
  };
}>;
type Region = Readonly<{
  id: string;
  creationTimestamp: string;
  name: string;
  description: string;
  status: string;
  zones: string[];
}>;
type Zone = Readonly<{
  id: string;
  creationTimestamp: string;
  name: string;
  description: string;
  status: string;
  region: string;
}>;
type IpAddress = Readonly<{
  id: string;
  creationTimestamp: string;
  name: string;
  description: string;
  address: string;
  prefixLength: number;
  status: "RESERVING" | "RESERVED" | "IN_USE";
  region: string;
  users: string[];
  networkTier: "PREMIUM" | "STANDARD";
  ipVersion: "IPV4" | "IPV6";
  addressType: "INTERNAL" | "EXTERNAL";
  purpose: "GCE_ENDPOINT" | "DNS_RESOLVER" | "VPC_PEERING" | "NAT_AUTO";
  subnetwork: string;
  network: string;
}>;
type Operation = Readonly<{
  id: string;
  name: string;
  targetId: string;
  status: string;
}>;
export type Project = Readonly<{
  projectNumber: string;
  projectId: string;
  lifecycleState: string;
}>;
export type ProjectBillingInfo = {
  name: string;
  projectId: string;
  billingAccountName?: string;
  billingEnabled?: boolean;
};
export type BillingAccount = Readonly<{
  name: string;
  open: boolean;
  displayName: string;
  masterBillingAccount: string;
}>;
type Service = Readonly<{
  name: string;
  parent: string;
  config: {
    name: string;
    title: string;
    apis: object[];
    documentation: object;
    quota: object;
    authentication: object;
    usage: object;
    endpoints: object[];
  },
  state: "STATE_UNSPECIFIED" | "ENABLED" | "DISABLED";
}>;
type ListInstancesResponse = Readonly<{items: Instance[]; nextPageToken: string}>;
type ListRegionsResponse = Readonly<{items: Region[]; nextPageToken: string}>;
type ListZonesResponse = Readonly<{items: Zone[]; nextPageToken: string}>;
type ListIpAddresses = Readonly<{items: IpAddress[]; nextPageToken: string}>;
export type ListProjectsResponse = Readonly<{projects: Project[]; nextPageToken: string}>;
export type ListBillingAccountsResponse = Readonly<{billingAccounts: BillingAccount[]; nextPageToken: string}>;
type GetServicesResponse = Readonly<{services: Service[]}>;

// TODO: Migrate to gAPI
export class GcpRestApiClient {
  private cloudBillingHttpClient: HttpClient;
  private cloudResourceManagerHttpClient: HttpClient;
  private computeHttpClient: HttpClient;
  private serviceUsageHttpClient: HttpClient;

  constructor(private projectId: string, private oauthCredential: OAuthCredential) {
    const headers = {
      "Content-type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${oauthCredential.getAccessToken()}`,
    };

    this.cloudBillingHttpClient = new HttpClient("https://cloudbilling.googleapis.com/", headers);
    this.cloudResourceManagerHttpClient = new HttpClient("https://cloudresourcemanager.googleapis.com/", headers);
    this.computeHttpClient = new HttpClient("https://compute.googleapis.com/", headers);
    this.serviceUsageHttpClient = new HttpClient("https://serviceusage.googleapis.com/", headers);
  }

  createInstance(zoneId: string, name: string, size: string, userData: string, label: string): Promise<Operation> {
    const data = {
      name,
      machineType: `zones/${zoneId}/machineTypes/${size}`,
      disks: [
        {
          boot: true,
          initializeParams: {
            sourceImage: "projects/ubuntu-os-cloud/global/images/family/ubuntu-1804-lts",
          },
        },
      ],
      networkInterfaces: [
        {
          network: "global/networks/default",
          // Empty accessConfigs necessary to allocate ephemeral IP
          accessConfigs: [{}],
        },
      ],
      serviceAccounts: [
        {
          scopes: [
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/compute.readonly",
            "https://www.googleapis.com/auth/devstorage.read_only",
          ],
        },
      ],
      labels: {
        // `${label}`: true,
      },
      tags: {
        items: [name],
      },
      metadata: {
        items: [
          {
            key: "enable-guest-attributes",
            value: "TRUE",
          },
          {
            key: "user-data",
            value: userData,
          },
        ],
      },
    };
    // @ts-ignore
    data.labels[label] = "true"; // TODO: Use label variable directly in data object and then remove this hack.
    return this.computeHttpClient.post<Operation>(
      `compute/v1/projects/${this.projectId}/zones/${zoneId}/instances`,
      data,
    );
  }

  deleteInstance(zoneId: string, instanceId: string): Promise<Operation> {
    return this.computeHttpClient.delete<Operation>(
      `compute/v1/projects/${this.projectId}/zones/${zoneId}/instances/${instanceId}`,
    );
  }

  getInstance(zoneId: string, instanceId: string): Promise<Instance> {
    return this.computeHttpClient.get<Instance>(
      `compute/v1/projects/${this.projectId}/zones/${zoneId}/instances/${instanceId}`,
    );
  }

  // TODO: Pagination
  listInstances(zoneId: string): Promise<ListInstancesResponse> {
    const filter = '?filter=labels.outline%3Dtrue';
    return this.computeHttpClient.get<ListInstancesResponse>(
      `compute/v1/projects/${this.projectId}/zones/${zoneId}/instances${filter}`,
    );
  }

  createStaticIp(name: string, regionId: string, ipAddress?: string): Promise<Operation> {
    const data = {
      name,
      ...(ipAddress && {address: ipAddress}),
    };
    return this.computeHttpClient.post<Operation>(
      `compute/v1/projects/${this.projectId}/regions/${regionId}/addresses`,
      data,
    );
  }

  deleteStaticIp(addressId: string, regionId: string): Promise<Operation> {
    return this.computeHttpClient.delete<Operation>(`compute/v1/projects/${this.projectId}/regions/${regionId}/addresses/${addressId}`);
  }

  listStaticIps(regionId: string, name?: string): Promise<ListIpAddresses> {
    const filter = `?filter=name%3D${name}`;
    return this.computeHttpClient.get<ListIpAddresses>(`compute/v1/projects/${this.projectId}/regions/${regionId}/addresses${filter}`);
  }

  async getGuestAttributes(zoneId: string, instanceId: string, namespace: string): Promise<GuestAttributes | undefined> {
    try {
      const optionalQueryPath = namespace ? `?queryPath=${namespace}%2F` : "";
      // We must await the call to getGuestAttributes to properly catch any exceptions.
      return await this.computeHttpClient.get<GuestAttributes>(
        `compute/v1/projects/${this.projectId}/zones/${zoneId}/instances/${instanceId}/getGuestAttributes${optionalQueryPath}`,
      );
    } catch (error) {
      // TODO: Distinguish between 404 not found and other errors.
      return undefined;
    }
  }

  createFirewall(name: string): Promise<Operation> {
    const data = {
      name,
      direction: "INGRESS",
      priority: 1000,
      targetTags: [name],
      allowed: [
        {
          IPProtocol: "all",
        },
      ],
      sourceRanges: ["0.0.0.0/0"],
    };
    return this.computeHttpClient.post<Operation>(`compute/v1/projects/${this.projectId}/global/firewalls`, data);
  }

  // TODO: Pagination
  listRegions(): Promise<ListRegionsResponse> {
    return this.computeHttpClient.get<ListRegionsResponse>(`compute/v1/projects/${this.projectId}/regions`);
  }

  // TODO: Pagination
  listZones(regionId?: string): Promise<ListZonesResponse> {
    const filter = regionId ? `?filter=region%3D%22https%3A%2F%2Fwww.googleapis.com%2Fcompute%2Fv1%2Fprojects%2F${this.projectId}%2Fregions%2F${regionId}` : "";
    return this.computeHttpClient.get<ListZonesResponse>(`compute/v1/projects/${this.projectId}/zones${filter}`);
  }

  createProject(projectId: string): Promise<Operation> {
    const data = {
      projectId,
      name: "Outline",
      labels: {
        outline: "true",
      },
    };
    return this.cloudResourceManagerHttpClient.post<Operation>("v1/projects", data);
  }

  listProjects(): Promise<ListProjectsResponse> {
    const filter = "?filter=(labels.outline%3Dtrue)%20AND%20(lifecycleState%3DACTIVE)";
    return this.cloudResourceManagerHttpClient.get<ListProjectsResponse>(`v1/projects${filter}`);
  }

  getProjectBillingInfo(projectId: string): Promise<ProjectBillingInfo> {
    return this.cloudBillingHttpClient.get<ProjectBillingInfo>(`v1/projects/${projectId}/billingInfo`);
  }

  updateProjectBillingInfo(projectId: string, projectBillingInfo: ProjectBillingInfo): Promise<ProjectBillingInfo> {
    return this.cloudBillingHttpClient.put<ProjectBillingInfo>(`v1/projects/${projectId}/billingInfo`, projectBillingInfo);
  }

  listBillingAccounts(): Promise<ListBillingAccountsResponse> {
    return this.cloudBillingHttpClient.get<ListBillingAccountsResponse>("v1/billingAccounts");
  }

  getServices(serviceIds: string[]): Promise<GetServicesResponse> {
    const formattedServiceIds = serviceIds.map(serviceId => `projects/${this.projectId}/services/${serviceId}`);
    const queryString = `?names=${formattedServiceIds.join("&")}`;
    return this.serviceUsageHttpClient.get<GetServicesResponse>(`v1/projects/${this.projectId}/services:batchGet${queryString}`);
  }

  enableServices(serviceIds: string[]): Promise<Operation> {
    const data = { serviceIds };
    return this.serviceUsageHttpClient.post<Operation>(`v1/projects/${this.projectId}/services:batchEnable`, data);
  }

  zoneWait(zoneId: string, operationId: string): Promise<Operation> {
    return this.computeHttpClient.post<Operation>(
      `compute/v1/projects/${this.projectId}/zones/${zoneId}/operations/${operationId}/wait`,
      {},
    );
  }

  regionWait(regionId: string, operationId: string): Promise<Operation> {
    return this.computeHttpClient.post<Operation>(
      `compute/v1/projects/${this.projectId}/regions/${regionId}/operations/${operationId}/wait`,
      {},
    );
  }

  globalWait(operationId: string): Promise<Operation> {
    return this.computeHttpClient.post<Operation>(
      `compute/v1/projects/${this.projectId}/global/operations/${operationId}/wait`,
      {},
    );
  }
}

export class GcpRestApiProviderService implements cloud.CloudProviderService {
  readonly cloudProvider = cloud_provider.Id.GCP;
  private gcpRestApiClient: GcpRestApiClient;

  // List compiled from documentation:
  // https://cloud.google.com/compute/docs/regions-zones
  private regionCountryMap = new Map<string, string>([
    ["asia-east1", "Changhua County, Taiwan"],
    ["asia-east2", "Hong Kong"],
    ["asia-northeast1", "Tokyo, Japan"],
    ["asia-northeast2", "Osaka, Japan"],
    ["asia-northeast3", "Seoul, South Korea"],
    ["asia-south1", "Mumbai, India"],
    ["asia-southeast1", "Jurong West, Singapore"],
    ["asia-southeast2", "Jakarta, Indonesia"],
    ["australia-southeast1", "Sydney, Australia"],
    ["europe-north1", "Hamina, Finland"],
    ["europe-west1", "St. Ghislain, Belgium"],
    ["europe-west2", "London, England, UK"],
    ["europe-west3", "Frankfurt, Germany"],
    ["europe-west4", "Eemshaven, Netherlands"],
    ["europe-west6", "Zürich, Switzerland"],
    ["northamerica-northeast1", "Montréal, Québec, Canada"],
    ["southamerica-east1", "Osasco (São Paulo), Brazil"],
    ["us-central1", "Council Bluffs, Iowa, USA"],
    ["us-east1", "Moncks Corner, South Carolina, USA"],
    ["us-east4", "Ashburn, Northern Virginia, USA"],
    ["us-west1", "The Dalles, Oregon, USA"],
    ["us-west2", "Los Angeles, California, USA"],
    ["us-west3", "Salt Lake City, Utah, USA"],
    ["us-west4", "Las Vegas, Nevada, USA"],
  ]);

  constructor(projectId: string, oauthCredential: OAuthCredential) {
    this.gcpRestApiClient = new GcpRestApiClient(projectId, oauthCredential);
  }

  async createInstance(name: string, bundleId: string, locationId: string): Promise<cloud.Instance> {
    const zoneId = locationId;
    const regionId = locationId.slice(0, -2);

    // Configure firewall
    const createFirewallOp = await this.gcpRestApiClient.createFirewall(name);
    await this.gcpRestApiClient.globalWait(createFirewallOp.name);

    // Create VM instance
    const createInstanceOp = await this.gcpRestApiClient.createInstance(
      zoneId,
      name,
      bundleId,
      this.getInstallScript(),
      "outline",
    );
    const createInstanceWait = await this.gcpRestApiClient.zoneWait(zoneId, createInstanceOp.name);

    // Lookup instance
    const instanceId = createInstanceWait.targetId;
    await this.getOutlineGuestAttributes(zoneId, instanceId);
    const instance = await this.getInstance(instanceId, zoneId);

    // Promote ephemeral IP to static IP
    const staticIpName = `${name}-ip`;
    const createStaticIpOp = await this.gcpRestApiClient.createStaticIp(staticIpName, regionId, instance.ip_address);
    await this.gcpRestApiClient.regionWait(regionId, createStaticIpOp.name);

    return instance;
  }

  async deleteInstance(instanceId: string, locationId: string): Promise<void> {
    const zoneId = locationId;
    const regionId = locationId.slice(0, -2);
    const getInstanceResponse = await this.gcpRestApiClient.getInstance(zoneId, instanceId);
    const listStaticIpsResponse = await this.gcpRestApiClient.listStaticIps(regionId, `${getInstanceResponse.name}-ip`);

    const address = listStaticIpsResponse.items.shift();
    if (address) {
      const deleteStaticIpOp = await this.gcpRestApiClient.deleteStaticIp(address.id, regionId);
      await this.gcpRestApiClient.regionWait(regionId, deleteStaticIpOp.name);
    }

    const deleteInstanceOp = await this.gcpRestApiClient.deleteInstance(locationId, instanceId);
    await this.gcpRestApiClient.zoneWait(locationId, deleteInstanceOp.name);
  }

  async getInstance(instanceId: string, locationId: string): Promise<cloud.Instance> {
    const instance = await this.gcpRestApiClient.getInstance(locationId, instanceId);
    const guestAttributes = await this.getOutlineGuestAttributes(locationId, instanceId);
    return GcpRestApiProviderService.toInstance(instance, guestAttributes);
  }

  // TODO: This doesn't return labels (guest attributes) because it requires a separate network call.
  async listInstances(locationId?: string): Promise<cloud.Instance[]> {
    const listZonesResponse = await this.gcpRestApiClient.listZones(locationId);

    const instances: cloud.Instance[] = [];
    for (const zone of listZonesResponse.items) {
      const listInstancesResponseForZone = await this.gcpRestApiClient.listInstances(zone.name);
      if (listInstancesResponseForZone.items) {
        const instancesForZone = await Promise.all(listInstancesResponseForZone.items.map(async (instance) => {
          const zoneName = instance.zone.split("/").pop()!;
          const guestAttributes = await this.getOutlineGuestAttributes(zoneName, instance.id);
          return GcpRestApiProviderService.toInstance(instance, guestAttributes);
        }));
        instances.push.apply(instances, instancesForZone);
      }
    }
    return instances;
  }

  async listLocations(): Promise<cloud.Location[]> {
    const regions = await this.gcpRestApiClient.listRegions();
    if (regions.items === undefined) {
      return [];
    }

    return regions.items.map((region) => {
      return {
        id: `${region.name}-a`,   // FIXME: Remove hardcoded zone
        name: `${region.name}-a`,
        country: this.regionCountryMap.get(region.name) || "Unknown",
      };
    });
  }

  listBundles(): Promise<cloud.Bundle> {
    throw new Error("NotImplemented");
  }

  // TODO: Add a timeout so that we don't infinitely loop.
  private async getOutlineGuestAttributes(zone: string, instanceId: string): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    while (!result.has("apiUrl") || !result.has("certSha256")) {
      await sleep(5 * 1000);
      const guestAttributes = await this.gcpRestApiClient.getGuestAttributes(zone, instanceId, "outline");
      // console.log(`Guest attributes: ${JSON.stringify(guestAttributes)}`);

      const attributes = guestAttributes?.queryValue?.items;
      if (attributes) {
        const apiUrl = attributes.find((a) => {
          return a.key === "apiUrl";
        });
        const certSha256 = attributes.find((a) => {
          return a.key === "certSha256" ? a.value : undefined;
        });

        if (apiUrl) {
          result.set("apiUrl", apiUrl.value);
        }
        if (certSha256) {
          result.set("certSha256", certSha256.value);
        }
      }
    }
    return result;
  }

  private static toInstance(instance: Instance, labels?: Map<string, string>): cloud.Instance {
    return {
      id: instance.id,
      name: instance.name,
      location: {
        id: instance.zone.split('/').pop()!,
      },
      ip_address: instance.networkInterfaces[0].accessConfigs[0].natIP,
      labels,
    };
  }

  private getInstallScript(): string {
    return "#!/bin/bash -eu\n" + SCRIPT;
  }
}
