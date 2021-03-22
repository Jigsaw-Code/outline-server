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

import {HttpClient} from '../infrastructure/fetch';

/** @see https://cloud.google.com/compute/docs/reference/rest/v1/instances */
export type Instance = Readonly<{
  id: string; creationTimestamp: string; name: string; description: string;
  tags: {items: string[]; fingerprint: string;};
  machineType: string;
  zone: string;
  networkInterfaces: Array<{
    network: string; subnetwork: string; networkIP: string; ipv6Address: string; name: string;
    accessConfigs: Array<{
      type: string; name: string; natIP: string; setPublicPtr: boolean; publicPtrDomainName: string;
      networkTier: string;
      kind: string;
    }>;
  }>;
}>;

/**
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/getGuestAttributes#response-body
 */
type GuestAttributes = Readonly<{
  variableKey: string; variableValue: string; queryPath: string;
  queryValue: {items: Array<{namespace: string; key: string; value: string;}>;};
}>;

/** @see https://cloud.google.com/compute/docs/reference/rest/v1/zones */
type Zone = Readonly<{
  id: string; creationTimestamp: string; name: string; description: string; status: 'UP' | 'DOWN';
  region: string;
}>;

/**
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/globalOperations
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/zoneOperations
 */
type Operation = Readonly<{id: string; name: string; targetId: string; status: string;}>;

/** @see https://cloud.google.com/resource-manager/reference/rest/v1/projects */
export type Project = Readonly<{projectNumber: string; projectId: string; lifecycleState: string;}>;

/** https://cloud.google.com/billing/docs/reference/rest/v1/billingAccounts */
export type BillingAccount =
    Readonly<{name: string; open: boolean; displayName: string; masterBillingAccount: string;}>;

/** https://cloud.google.com/billing/docs/reference/rest/v1/ProjectBillingInfo */
export type ProjectBillingInfo = Readonly<
    {name: string; projectId: string; billingAccountName?: string; billingEnabled?: boolean;}>;

/**
 * @see https://accounts.google.com/.well-known/openid-configuration for
 * supported claims.
 *
 * Note: The supported claims are optional and not guaranteed to be in the
 * response.
 */
export type UserInfo = Readonly<{
  email: string,
}>;

type ListInstancesResponse = Readonly<{items: Instance[]; nextPageToken: string}>;
type ListZonesResponse = Readonly<{items: Zone[]; nextPageToken: string}>;
type ListProjectsResponse = Readonly<{projects: Project[]; nextPageToken: string}>;
type ListBillingAccountsResponse =
    Readonly<{billingAccounts: BillingAccount[]; nextPageToken: string}>;

export class RestApiClient {
  private cloudBillingHttpClient: HttpClient;
  private cloudResourceManagerHttpClient: HttpClient;
  private computeHttpClient: HttpClient;

  constructor(private accessToken: string) {
    const headers = new Map<string, string>([
      ['Content-type', 'application/json'],
      ['Accept', 'application/json'],
      ['Authorization', `Bearer ${accessToken}`],
    ]);
    this.cloudBillingHttpClient = new HttpClient('https://cloudbilling.googleapis.com/', headers);
    this.cloudResourceManagerHttpClient =
        new HttpClient('https://cloudresourcemanager.googleapis.com/', headers);
    this.computeHttpClient = new HttpClient('https://compute.googleapis.com/', headers);
  }

  /**
   * Creates a new Google Compute Engine VM instance in a specified GCP project.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/insert
   *
   * @param projectId - The GCP project ID.
   * @param name - The name to be given to the created instance. See online
   *   documentation for naming requirements.
   * @param zoneId - The zone in which to create the instance.
   * @param installScript - A script to run once the instance has launched.
   */
  createInstance(
      projectId: string, name: string, zoneId: string, size: string,
      installScript: string): Promise<Operation> {
    const data = {
      name,
      machineType: `zones/${zoneId}/machineTypes/${size}`,
      disks: [
        {
          boot: true,
          initializeParams: {
            sourceImage: 'projects/ubuntu-os-cloud/global/images/family/ubuntu-1804-lts',
          },
        },
      ],
      networkInterfaces: [
        {
          network: 'global/networks/default',
          // Empty accessConfigs necessary to allocate ephemeral IP
          accessConfigs: [{}],
        },
      ],
      serviceAccounts: [
        {
          scopes: [
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/compute.readonly',
            'https://www.googleapis.com/auth/devstorage.read_only',
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
            key: 'enable-guest-attributes',
            value: 'TRUE',
          },
          {
            key: 'user-data',
            value: installScript,
          },
        ],
      },
    };
    // TODO: Figure out how to do this in the object itself.
    // @ts-ignore
    data.labels[label] = 'true';
    return this.computeHttpClient.post<Operation>(
        `compute/v1/projects/${projectId}/zones/${zoneId}/instances`,
        data,
    );
  }

  /**
   * Deletes a specified Google Compute Engine VM instance.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/delete
   *
   * @param projectId - The GCP project ID.
   * @param instanceId - The ID of the instance to delete.
   * @param zoneId - The zone in which the instance resides.
   */
  deleteInstance(projectId: string, instanceId: string, zoneId: string): Promise<Operation> {
    return this.computeHttpClient.delete<Operation>(
        `compute/v1/projects/${projectId}/zones/${zoneId}/instances/${instanceId}`,
    );
  }

  /**
   * Gets the specified Google Compute Engine VM instance resource.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/get
   *
   * @param projectId - The GCP project ID.
   * @param instanceId - The ID of the instance to retrieve.
   * @param zoneId - The zone in which the instance resides.
   */
  getInstance(projectId: string, instanceId: string, zoneId: string): Promise<Instance> {
    return this.computeHttpClient.get<Instance>(
        `compute/v1/projects/${projectId}/zones/${zoneId}/instances/${instanceId}`,
    );
  }

  /**
   * Lists the Google Compute Engine VM instances in a specified zone.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/list
   *
   * @param projectId - The GCP project ID.
   * @param zoneId - The zone to query.
   */
  // TODO: Pagination
  listInstances(projectId: string, zoneId: string): Promise<ListInstancesResponse> {
    const filter = '?filter=labels.outline%3Dtrue';
    return this.computeHttpClient.get<ListInstancesResponse>(
        `compute/v1/projects/${projectId}/zones/${zoneId}/instances${filter}`,
    );
  }

  /**
   * Creates a static IP address.
   *
   * If no IP address is provided, a new static IP address is created. If an
   * ephemeral IP address is provided, it is promoted to a static IP address.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/addresses/insert
   *
   * @param projectId - The GCP project ID.
   * @param name - The name to be given to be applied to the resource.
   * @param regionId - The GCP region.
   * @param ipAddress - (optional) The ephemeral IP address to promote to static.
   */
  createStaticIp(projectId: string, name: string, regionId: string, ipAddress?: string):
      Promise<Operation> {
    const data = {
      name,
      ...(ipAddress && {address: ipAddress}),
    };
    return this.computeHttpClient.post<Operation>(
        `compute/v1/projects/${projectId}/regions/${regionId}/addresses`,
        data,
    );
  }

  /**
   * Deletes a static IP address.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/addresses/delete
   *
   * @param projectId - The GCP project ID.
   * @param addressId - The ID of the static IP address resource.
   * @param regionId - The GCP region of the resource.
   */
  deleteStaticIp(projectId: string, addressId: string, regionId: string): Promise<Operation> {
    return this.computeHttpClient.delete<Operation>(
        `compute/v1/projects/${projectId}/regions/${regionId}/addresses/${addressId}`);
  }

  /**
   * Lists the guest attributes applied to the specified Google Compute Engine VM instance.
   *
   * @see https://cloud.google.com/compute/docs/storing-retrieving-metadata#guest_attributes
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/getGuestAttributes
   *
   * @param projectId - The GCP project ID.
   * @param instanceId - The ID of the VM instance.
   * @param zoneId - The zone in which the instance resides.
   * @param namespace - The namespace of the guest attributes.
   */
  async getGuestAttributes(
      projectId: string, instanceId: string, zoneId: string,
      namespace: string): Promise<GuestAttributes|undefined> {
    try {
      const optionalQueryPath = namespace ? `?queryPath=${namespace}%2F` : '';
      // We must await the call to getGuestAttributes to properly catch any exceptions.
      return await this.computeHttpClient.get<GuestAttributes>(
          `compute/v1/projects/${projectId}/zones/${zoneId}/instances/${
              instanceId}/getGuestAttributes${optionalQueryPath}`,
      );
    } catch (error) {
      // TODO: Distinguish between 404 not found and other errors.
      return undefined;
    }
  }

  /**
   * Creates a firewall under the specified GCP project.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/firewalls/insert
   *
   * @param projectId - The GCP project ID.
   * @param name - The name of the firewall.
   */
  createFirewall(projectId: string, name: string): Promise<Operation> {
    const data = {
      name,
      direction: 'INGRESS',
      priority: 1000,
      targetTags: [name],
      allowed: [
        {
          IPProtocol: 'all',
        },
      ],
      sourceRanges: ['0.0.0.0/0'],
    };
    return this.computeHttpClient.post<Operation>(
        `compute/v1/projects/${projectId}/global/firewalls`, data);
  }

  /**
   * Lists the zones available to a given GCP project.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/zones/list
   *
   * @param projectId - The GCP project ID.
   * @param regionId - (optional) The region to filter by.
   */
  // TODO: Pagination
  listZones(projectId: string, regionId?: string): Promise<ListZonesResponse> {
    const filter = regionId ?
        `?filter=region%3D%22https%3A%2F%2Fwww.googleapis.com%2Fcompute%2Fv1%2Fprojects%2F${
            projectId}%2Fregions%2F${regionId}` :
        '';
    return this.computeHttpClient.get<ListZonesResponse>(
        `compute/v1/projects/${projectId}/zones${filter}`);
  }

  /**
   * Creates a new GCP project with label "outline"
   *
   * The project ID must conform to the following:
   * - must be 6 to 30 lowercase letters, digits, or hyphens
   * - must start with a letter
   * - no trailing hyphens
   *
   * @see https://cloud.google.com/resource-manager/reference/rest/v1/projects/create
   *
   * @param projectId - The unique user-assigned project ID.
   * @param name - The project display name.
   */
  createProject(projectId: string, name: string): Promise<Operation> {
    const data = {
      projectId,
      name,
      labels: {
        outline: 'true',
      },
    };
    return this.cloudResourceManagerHttpClient.post<Operation>('v1/projects', data);
  }

  /**
   * Lists the "Outline" GCP projects that the user has access to.
   *
   * @see https://cloud.google.com/resource-manager/reference/rest/v1/projects/list
   */
  listProjects(): Promise<ListProjectsResponse> {
    const filter = '?filter=labels.outline%20%3D%20true';
    return this.cloudResourceManagerHttpClient.get<ListProjectsResponse>(`v1/projects${filter}`);
  }

  /**
   * Gets the billing information for a specified GCP project.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/projects/getBillingInfo
   *
   * @param projectId - The GCP project ID.
   */
  getProjectBillingInfo(projectId: string): Promise<ProjectBillingInfo> {
    return this.cloudBillingHttpClient.get<ProjectBillingInfo>(
        `v1/projects/${projectId}/billingInfo`);
  }

  /**
   * Associates a GCP project with a billing account.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/projects/updateBillingInfo
   *
   * @param projectId - The GCP project ID.
   * @param projectBillingInfo - The billing info.
   */
  updateProjectBillingInfo(projectId: string, projectBillingInfo: ProjectBillingInfo):
      Promise<ProjectBillingInfo> {
    return this.cloudBillingHttpClient.put<ProjectBillingInfo>(
        `v1/projects/${projectId}/billingInfo`, projectBillingInfo);
  }

  /**
   * Lists the billing accounts that the user has access to.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/billingAccounts/list
   */
  listBillingAccounts(): Promise<ListBillingAccountsResponse> {
    return this.cloudBillingHttpClient.get<ListBillingAccountsResponse>('v1/billingAccounts');
  }

  /**
   * Waits for a specified Google Compute Engine zone operation to complete.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/zoneOperations/wait
   *
   * @param projectId - The GCP project ID.
   * @param zoneId - The zone ID.
   * @param operationId - The operation ID.
   */
  gceZoneWait(projectId: string, zoneId: string, operationId: string): Promise<Operation> {
    return this.computeHttpClient.post<Operation>(
        `compute/v1/projects/${projectId}/zones/${zoneId}/operations/${operationId}/wait`,
        {},
    );
  }

  /**
   * Waits for a specified Google Compute Engine global operation to complete.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/globalOperations/wait
   *
   * @param projectId - The GCP project ID.
   * @param operationId - The operation ID.
   */
  gceGlobalWait(projectId: string, operationId: string): Promise<Operation> {
    return this.computeHttpClient.post<Operation>(
        `compute/v1/projects/${projectId}/global/operations/${operationId}/wait`,
        {},
    );
  }
}
