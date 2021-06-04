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

// TODO: Share the same OAuth config between electron app and renderer.
// Keep this in sync with {@link gcp_oauth.ts#OAUTH_CONFIG}
const GCP_OAUTH_CLIENT_ID =
    '946220775492-osi1dm2rhhpo4upm6qqfv9fiivv1qu6c.apps.googleusercontent.com';

export class GcpError extends Error {
  constructor(code: number, message?: string) {
    // ref:
    // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
    super(`Error ${code}: ${message}`);                 // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype);  // restore prototype chain
    this.name = new.target.name;
  }
}

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

type Status = Readonly<{code: number; message: string}>;

/** @see https://cloud.google.com/resource-manager/reference/rest/Shared.Types/Operation */
export type ResourceManagerOperation = Readonly<{name: string; done: boolean; error: Status;}>;

/**
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/globalOperations
 * @see https://cloud.google.com/compute/docs/reference/rest/v1/zoneOperations
 */
type ComputeEngineOperation = Readonly<
    {id: string; name: string; targetId: string; status: string; error: {errors: Status[]}}>;

/**
 * @see https://cloud.google.com/service-usage/docs/reference/rest/Shared.Types/ListOperationsResponse#Operation
 */
type ServiceUsageOperation = Readonly<{name: string; done: boolean; error: Status;}>;

/** @see https://cloud.google.com/resource-manager/reference/rest/v1/projects */
export type Project =
    Readonly<{projectNumber: string; projectId: string; name: string, lifecycleState: string;}>;

/** @see https://cloud.google.com/compute/docs/reference/rest/v1/firewalls/get#response-body */
type Firewall = Readonly<{id: string; name: string;}>;

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
export type UserInfo = Readonly<{email: string;}>;

type Service = Readonly<
    {name: string; config: {name: string;}; state: 'STATE_UNSPECIFIED' | 'DISABLED' | 'ENABLED';}>;

type ListInstancesResponse = Readonly<{items: Instance[]; nextPageToken: string;}>;
type ListZonesResponse = Readonly<{items: Zone[]; nextPageToken: string;}>;
type ListProjectsResponse = Readonly<{projects: Project[]; nextPageToken: string;}>;
type ListFirewallsResponse = Readonly<{items: Firewall[]; nextPageToken: string;}>;
type ListBillingAccountsResponse =
    Readonly<{billingAccounts: BillingAccount[]; nextPageToken: string}>;
type ListEnabledServicesResponse = Readonly<{services: Service[]; nextPageToken: string;}>;
type RefreshAccessTokenResponse = Readonly<{access_token: string; expires_in: number;}>;

export class HttpError extends Error {
  constructor(private statusCode: number, message?: string) {
    super(message);
  }

  getStatusCode(): number {
    return this.statusCode;
  }
}

export class RestApiClient {
  private readonly GCP_HEADERS = new Map<string, string>([
    ['Content-type', 'application/json'],
    ['Accept', 'application/json'],
  ]);

  private accessToken: string;

  constructor(private refreshToken: string) {}

  /**
   * Creates a new Google Compute Engine VM instance in a specified GCP project.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/insert
   *
   * @param projectId - The GCP project ID.
   * @param zoneId - The zone in which to create the instance.
   * @param data - Request body data. See documentation.
   */
  async createInstance(projectId: string, zoneId: string, data: {}): Promise<ComputeEngineOperation> {
    const operation = await this.fetchAuthenticated<ComputeEngineOperation>(
        'POST',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/instances`),
        this.GCP_HEADERS, null, data);
    return await this.computeEngineOperationZoneWait(projectId, zoneId, operation.name);
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
  async deleteInstance(projectId: string, instanceId: string, zoneId: string): Promise<void> {
    const operation = await this.fetchAuthenticated<ComputeEngineOperation>(
        'DELETE',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/instances/${instanceId}`),
        this.GCP_HEADERS);
    await this.computeEngineOperationZoneWait(projectId, zoneId, operation.name);
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
    return this.fetchAuthenticated(
        'GET',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/instances/${instanceId}`),
        this.GCP_HEADERS);
  }

  /**
   * Lists the Google Compute Engine VM instances in a specified zone.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/instances/list
   *
   * @param projectId - The GCP project ID.
   * @param zoneId - The zone to query.
   * @param filter - See documentation.
   */
  // TODO: Pagination
  listInstances(projectId: string, zoneId: string, filter?: string):
      Promise<ListInstancesResponse> {
    let parameters = null;
    if (filter) {
      parameters = new Map<string, string>([
        ['filter', filter],
      ]);
    }
    return this.fetchAuthenticated(
        'GET',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/instances`),
        this.GCP_HEADERS, parameters);
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
   * @param regionId - The GCP region.
   * @param data - Request body data. See documentation.
   */
  async createStaticIp(projectId: string, regionId: string, data: {}): Promise<ComputeEngineOperation> {
    const operation = await this.fetchAuthenticated<ComputeEngineOperation>(
        'POST',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${
            regionId}/addresses`),
        this.GCP_HEADERS, null, data);
    return await this.computeEngineOperationRegionWait(projectId, regionId, operation.name);
  }

  /**
   * Deletes a static IP address.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/addresses/delete
   *
   * @param projectId - The GCP project ID.
   * @param addressName - The name of the static IP address resource.
   * @param regionId - The GCP region of the resource.
   */
  async deleteStaticIp(projectId: string, addressName: string, regionId: string): Promise<void> {
    const operation = await this.fetchAuthenticated<ComputeEngineOperation>(
        'DELETE',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${
            regionId}/addresses/${addressName}`),
        this.GCP_HEADERS);
    await this.computeEngineOperationRegionWait(projectId, regionId, operation.name);
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
      const parameters = new Map<string, string>([['queryPath', namespace]]);
      // We must await the call to getGuestAttributes to properly catch any exceptions.
      return await this.fetchAuthenticated(
          'GET',
          new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
              zoneId}/instances/${instanceId}/getGuestAttributes`),
          this.GCP_HEADERS, parameters);
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
   * @param data - Request body data. See documentation.
   */
  async createFirewall(projectId: string, data: {}): Promise<ComputeEngineOperation> {
    const operation = await this.fetchAuthenticated<ComputeEngineOperation>(
        'POST',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/global/firewalls`),
        this.GCP_HEADERS, null, data);
    return await this.computeEngineOperationGlobalWait(projectId, operation.name);
  }

  /**
   * @param projectId - The GCP project ID.
   * @param name - The firewall name.
   */
  // TODO: Replace with getFirewall (and handle 404 NotFound)
  listFirewalls(projectId: string, name: string): Promise<ListFirewallsResponse> {
    const filter = `name=${name}`;
    const parameters = new Map<string, string>([['filter', filter]]);
    return this.fetchAuthenticated(
        'GET',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/global/firewalls`),
        this.GCP_HEADERS, parameters);
  }

  /**
   * Lists the zones available to a given GCP project.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/zones/list
   *
   * @param projectId - The GCP project ID.
   */
  // TODO: Pagination
  listZones(projectId: string): Promise<ListZonesResponse> {
    return this.fetchAuthenticated(
        'GET', new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones`),
        this.GCP_HEADERS);
  }

  /**
   * Lists all services that have been enabled on the project.
   *
   * @param projectId - The GCP project ID.
   */
  listEnabledServices(projectId: string): Promise<ListEnabledServicesResponse> {
    const parameters = new Map<string, string>([['filter', 'state:ENABLED']]);
    return this.fetchAuthenticated(
        'GET', new URL(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services`),
        this.GCP_HEADERS, parameters);
  }

  /**
   * @param projectId - The GCP project ID.
   * @param data - Request body data. See documentation.
   */
  enableServices(projectId: string, data: {}): Promise<ServiceUsageOperation> {
    return this.fetchAuthenticated(
        'POST',
        new URL(
            `https://serviceusage.googleapis.com/v1/projects/${projectId}/services:batchEnable`),
        this.GCP_HEADERS, null, data);
  }

  /**
   * Creates a new GCP project
   *
   * The project ID must conform to the following:
   * - must be 6 to 30 lowercase letters, digits, or hyphens
   * - must start with a letter
   * - no trailing hyphens
   *
   * @see https://cloud.google.com/resource-manager/reference/rest/v1/projects/create
   *
   * @param projectId - The unique user-assigned project ID.
   * @param data - Request body data. See documentation.
   */
  createProject(projectId: string, data: {}): Promise<ResourceManagerOperation> {
    return this.fetchAuthenticated(
        'POST', new URL('https://cloudresourcemanager.googleapis.com/v1/projects'),
        this.GCP_HEADERS, null, data);
  }

  /**
   * Lists the GCP projects that the user has access to.
   *
   * @see https://cloud.google.com/resource-manager/reference/rest/v1/projects/list
   *
   * @param filter - See documentation.
   */
  listProjects(filter?: string): Promise<ListProjectsResponse> {
    let parameters = null;
    if (filter) {
      parameters = new Map<string, string>([
        ['filter', filter],
      ]);
    }
    return this.fetchAuthenticated(
        'GET', new URL('https://cloudresourcemanager.googleapis.com/v1/projects'), this.GCP_HEADERS,
        parameters);
  }

  /**
   * Gets the billing information for a specified GCP project.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/projects/getBillingInfo
   *
   * @param projectId - The GCP project ID.
   */
  getProjectBillingInfo(projectId: string): Promise<ProjectBillingInfo> {
    return this.fetchAuthenticated(
        'GET', new URL(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`),
        this.GCP_HEADERS);
  }

  /**
   * Associates a GCP project with a billing account.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/projects/updateBillingInfo
   *
   * @param projectId - The GCP project ID.
   * @param data - Request body data. See documentation.
   */
  updateProjectBillingInfo(projectId: string, data: {}): Promise<ProjectBillingInfo> {
    return this.fetchAuthenticated(
        'PUT', new URL(`https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`),
        this.GCP_HEADERS, null, data);
  }

  /**
   * Lists the billing accounts that the user has access to.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/billingAccounts/list
   */
  listBillingAccounts(): Promise<ListBillingAccountsResponse> {
    return this.fetchAuthenticated(
        'GET', new URL(`https://cloudbilling.googleapis.com/v1/billingAccounts`), this.GCP_HEADERS);
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
  async computeEngineOperationZoneWait(projectId: string, zoneId: string, operationId: string):
      Promise<ComputeEngineOperation> {
    const operation = await this.fetchAuthenticated<ComputeEngineOperation>(
        'POST',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/operations/${operationId}/wait`),
        this.GCP_HEADERS);
    if (operation.error?.errors) {
      throw new GcpError(operation?.error.errors[0]?.code, operation?.error.errors[0]?.message);
    }
    return operation;
  }

  /**
   * Waits for a specified Google Compute Engine region operation to complete.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/regionOperations/wait
   *
   * @param projectId - The GCP project ID.
   * @param regionId - The region ID.
   * @param operationId - The operation ID.
   */
  computeEngineOperationRegionWait(projectId: string, regionId: string, operationId: string):
      Promise<ComputeEngineOperation> {
    return this.fetchAuthenticated(
        'POST',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${
            regionId}/operations/${operationId}/wait`),
        this.GCP_HEADERS);
  }

  /**
   * Waits for a specified Google Compute Engine global operation to complete.
   *
   * @see https://cloud.google.com/compute/docs/reference/rest/v1/globalOperations/wait
   *
   * @param projectId - The GCP project ID.
   * @param operationId - The operation ID.
   */
  computeEngineOperationGlobalWait(projectId: string, operationId: string):
      Promise<ComputeEngineOperation> {
    return this.fetchAuthenticated(
        'POST',
        new URL(`https://compute.googleapis.com/compute/v1/projects/${
            projectId}/global/operations/${operationId}/wait`),
        this.GCP_HEADERS);
  }

  resourceManagerOperationGet(operationId: string): Promise<ResourceManagerOperation> {
    return this.fetchAuthenticated(
        'GET', new URL(`https://cloudresourcemanager.googleapis.com/v1/${operationId}`),
        this.GCP_HEADERS);
  }

  serviceUsageOperationGet(operationId: string): Promise<ServiceUsageOperation> {
    return this.fetchAuthenticated(
        'GET', new URL(`https://serviceusage.googleapis.com/v1/${operationId}`), this.GCP_HEADERS);
  }

  /**
   * Gets the OpenID Connect profile information.
   *
   * For a list of the supported Google OpenID claims
   * @see https://accounts.google.com/.well-known/openid-configuration.
   *
   * The OpenID standard, including the "userinfo" response and core claims, is
   * defined in the links below:
   * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
   * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
   */
  getUserInfo(): Promise<UserInfo> {
    const parameters = new Map<string, string>([['access_token', this.accessToken]]);
    return this.fetchAuthenticated(
        'POST', new URL('https://openidconnect.googleapis.com/v1/userinfo'), this.GCP_HEADERS);
  }

  private async refreshGcpAccessToken(refreshToken: string): Promise<string> {
    const headers = new Map<string, string>(
        [['Host', 'oauth2.googleapis.com'], ['Content-Type', 'application/x-www-form-urlencoded']]);
    const data = {
      // TODO: Consider moving client ID to the caller.
      client_id: GCP_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };
    const encodedData = this.encodeFormData(data);
    const response: RefreshAccessTokenResponse = await this.fetchUnauthenticated(
        'POST', new URL('https://oauth2.googleapis.com/token'), headers, null, encodedData);
    return response.access_token;
  }

  /**
   * Revokes a token.
   *
   * @see https://developers.google.com/identity/protocols/oauth2/native-app
   *
   * @param token - A refresh token or access token
   */
  private async revokeGcpToken(token: string): Promise<void> {
    const headers = new Map<string, string>(
        [['Host', 'oauth2.googleapis.com'], ['Content-Type', 'application/x-www-form-urlencoded']]);
    const parameters = new Map<string, string>([['token', token]]);
    return this.fetchUnauthenticated(
        'GET', new URL('https://oauth2.googleapis.com/revoke'), headers, parameters);
  }

  // tslint:disable-next-line:no-any
  private async fetchAuthenticated<T>(method: string, url: URL, headers: Map<string, string>, parameters?: Map<string, string>, data?: any): Promise<T> {
    const httpHeaders = new Map(headers);

    // TODO: Handle token expiration/revokation.
    if (!this.accessToken) {
      this.accessToken = await this.refreshGcpAccessToken(this.refreshToken);
    }
    httpHeaders.set('Authorization', `Bearer ${this.accessToken}`);
    return this.fetchUnauthenticated(method, url, httpHeaders, parameters, data);
  }

  // tslint:disable-next-line:no-any
  private async fetchUnauthenticated<T>(method: string, url: URL, headers: Map<string, string>, parameters?: Map<string, string>, data?: any): Promise<T> {
    const customHeaders = new Headers();
    headers.forEach((value, key) => {
      customHeaders.append(key, value);
    });
    if (parameters) {
      parameters.forEach((value: string, key: string) => url.searchParams.append(key, value));
    }

    // TODO: More robust handling of data types
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    const response = await fetch(url.toString(), {
      method: method.toUpperCase(),
      headers: customHeaders,
      ...(data && {body: data}),
    });

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText);
    }

    try {
      let result = undefined;
      if (response.status !== 204) {
        result = await response.json();
      }
      return result;
    } catch (e) {
      throw new Error('Error parsing response body: ' + JSON.stringify(e));
    }
  }

  private encodeFormData(data: object): string {
    return Object.entries(data)
        .map(entry => {
          return encodeURIComponent(entry[0]) + '=' + encodeURIComponent(entry[1]);
        })
        .join('&');
  }
}
