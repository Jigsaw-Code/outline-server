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
type RefreshAccessTokenResponse = Readonly<{
  access_token: string; expires_in: number,
}>;

export class HttpError extends Error {
  constructor(private statusCode: number, message?: string) {
    super(message);
  }

  getStatusCode(): number {
    return this.statusCode;
  }
}

// TODO: URLEncode the path
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
   * @param name - The name to be given to the created instance. See online
   *   documentation for naming requirements.
   * @param zoneId - The zone in which to create the instance.
   * @param size - @see https://cloud.google.com/compute/docs/machine-types.
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
    return this.fetchAuthenticated(
        'POST',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zoneId}/instances`,
        null, JSON.stringify(data));
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
    return this.fetchAuthenticated(
        'DELETE',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/instances/${instanceId}`);
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
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/instances/${instanceId}`);
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
    const parameters = new Map<string, string>([['filter', 'labels.outline=true']]);
    return this.fetchAuthenticated(
        'GET',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zoneId}/instances`,
        parameters);
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
    return this.fetchAuthenticated(
        'POST',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${
            regionId}/addresses`,
        null, JSON.stringify(data));
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
    return this.fetchAuthenticated(
        'DELETE',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/regions/${
            regionId}/addresses/${addressId}`);
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
      return this.fetchAuthenticated(
          'GET',
          `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
              zoneId}/instances/${instanceId}/getGuestAttributes`,
          parameters);
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
    return this.fetchAuthenticated(
        'POST', `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/firewalls`,
        null, JSON.stringify(data));
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
    const region =
        `"https://www.googleapis.com/compute/v1/projects/${projectId}/regions/${regionId}"`;
    const parameters = new Map<string, string>([['region', region]]);
    return this.fetchAuthenticated(
        'GET', `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones`, parameters);
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
    return this.fetchAuthenticated(
        'POST', 'https://cloudresourcemanager.googleapis.com/v1/projects', null,
        JSON.stringify(data));
  }

  /**
   * Lists the "Outline" GCP projects that the user has access to.
   *
   * @see https://cloud.google.com/resource-manager/reference/rest/v1/projects/list
   */
  listProjects(): Promise<ListProjectsResponse> {
    const parameters = new Map<string, string>([['filter', 'labels.outline=true']]);
    return this.fetchAuthenticated(
        'GET', 'https://cloudresourcemanager.googleapis.com/v1/projects', parameters);
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
        'GET', `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`);
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
    return this.fetchAuthenticated(
        'PUT', `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`, null,
        JSON.stringify(projectBillingInfo));
  }

  /**
   * Lists the billing accounts that the user has access to.
   *
   * @see https://cloud.google.com/billing/docs/reference/rest/v1/billingAccounts/list
   */
  listBillingAccounts(): Promise<ListBillingAccountsResponse> {
    return this.fetchAuthenticated('GET', `https://cloudbilling.googleapis.com/v1/billingAccounts`);
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
    return this.fetchAuthenticated(
        'POST',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${
            zoneId}/operations/${operationId}/wait`);
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
    return this.fetchAuthenticated(
        'POST',
        `https://compute.googleapis.com/compute/v1/projects/${projectId}/global/operations/${
            operationId}/wait`);
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
    return this.fetchAuthenticated('POST', 'https://openidconnect.googleapis.com/v1/userinfo');
  }

  private async refreshGcpAccessToken(refreshToken: string): Promise<string> {
    const headers = new Map<string, string>(
        [['Host', 'oauth2.googleapis.com'], ['Content-Type', 'application/x-www-form-urlencoded']]);
    const data = {
      client_id: GCP_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    };
    const encodedData = this.encodeFormData(data);
    const response: RefreshAccessTokenResponse = await this.fetchUnauthenticated(
        'POST', 'https://oauth2.googleapis.com/token', headers, null, encodedData);
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
        'GET', 'https://oauth2.googleapis.com/revoke', headers, parameters);
  }

  // tslint:disable-next-line:no-any
  private async fetchAuthenticated<T>(method: string, url: string, queryParameters?: Map<string, string>, encodedData?: any): Promise<T> {
    const httpHeaders = new Map(this.GCP_HEADERS);

    // TODO: Handle token expiration/revokation.
    if (!this.accessToken) {
      this.accessToken = await this.refreshGcpAccessToken(this.refreshToken);
      httpHeaders.set('Authorization', `Bearer ${this.accessToken}`);
    }

    return this.fetchUnauthenticated(method, url, httpHeaders, queryParameters, encodedData);
  }

  // tslint:disable-next-line:no-any
  private async fetchUnauthenticated<T>(method: string, url: string, headers: Map<string, string>, queryParameters?: Map<string, string>, encodedData?: any): Promise<T> {
    const encodedUrl = encodeURI(url);
    const encodedQueryString = this.encodeQueryString(queryParameters);
    const fullUrl = `${encodedUrl}${encodedQueryString}`;
    const customHeaders = new Headers();
    headers.forEach((value, key) => {
      customHeaders.append(key, value);
    });

    console.debug(`Request: ${fullUrl}`);
    console.debug(`Headers: ${JSON.stringify(customHeaders)}`);
    console.debug(`Body: ${encodedData}`);

    const response = await fetch(fullUrl, {
      method: method.toUpperCase(),
      headers: customHeaders,
      ...(encodedData && {body: encodedData}),
    });

    console.debug(`Status: ${response.statusText} (${response.status})`);
    if (!response.ok) {
      console.debug(`Text: ${await response.text()}`);
      throw new HttpError(response.status, response.statusText);
    }

    try {
      let result = undefined;
      if (response.status !== 204) {
        result = await response.json();
        console.debug(`Response: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (e) {
      throw new Error('Error parsing response body: ' + JSON.stringify(e));
    }
  }

  private encodeQueryString(map: Map<string, string>): string {
    if (map && map.size > 0) {
      const entries = [...map.entries()].map(
          ([key, value]: [string, string]) =>
              encodeURIComponent(key) + '=' + encodeURIComponent(value));
      return `?${entries}`;
    } else {
      return '';
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
