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

import {Account, DigitalOceanApi, DigitalOceanDropletSpecification, DigitalOceanError, DropletInfo, RegionInfo} from '../../infrastructure/digitalocean_api';

export class HttpError extends Error {
  constructor(private statusCode: number, message?: string) {
    super(message);
  }

  getStatusCode(): number {
    return this.statusCode;
  }

  getMessage(): string|undefined {
    return this.message;
  }
}

// Marker class for network and CORS errors.
export class NetworkError extends Error {}

export class DigitalOceanApiClient implements DigitalOceanApi {
  // Constructor takes a DigitalOcean access token, which should have
  // read+write permissions.
  constructor(private accessToken: string) {}

  /** @see DigitalOceanApi#getAccount */
  getAccount(): Promise<Account> {
    console.info('Requesting account');
    return this.request<{account: Account}>('GET', 'account').then((response) => {
      return response.account;
    });
  }

  /** @see DigitalOceanApi#createDroplet */
  createDroplet(
      displayName: string, region: string, publicKeyForSSH: string,
      dropletSpec: DigitalOceanDropletSpecification): Promise<{droplet: DropletInfo}> {
    const dropletName = this.makeValidDropletName(displayName);
    // Register a key with DigitalOcean, so the user will not get a potentially
    // confusing email with their droplet password, which could get mistaken for
    // an invite.
    return this.registerKey(dropletName, publicKeyForSSH).then((keyId: number) => {
      return this.makeCreateDropletRequest(dropletName, region, keyId, dropletSpec);
    });
  }

  /** @see DigitalOceanApi#deleteDroplet */
  deleteDroplet(dropletId: number): Promise<void> {
    console.info('Requesting droplet deletion');
    return this.request<void>('DELETE', 'droplets/' + dropletId);
  }

  /** @see DigitalOceanApi#getRegionInfo */
  getRegionInfo(): Promise<RegionInfo[]> {
    console.info('Requesting region info');
    return this.request<{regions: RegionInfo[]}>('GET', 'regions').then((response) => {
      return response.regions;
    });
  }

  /** @see DigitalOceanApi#getDroplet */
  getDroplet(dropletId: number): Promise<DropletInfo> {
    console.info('Requesting droplet');
    return this.request<{droplet: DropletInfo}>('GET', 'droplets/' + dropletId).then((response) => {
      return response.droplet;
    });
  }

  /** @see DigitalOceanApi#getDropletTags */
  getDropletTags(dropletId: number): Promise<string[]> {
    return this.getDroplet(dropletId).then((droplet: DropletInfo) => {
      return droplet.tags;
    });
  }

  /** @see DigitalOceanApi#getDropletByTag */
  getDropletsByTag(tag: string): Promise<DropletInfo[]> {
    console.info('Requesting droplet by tag');
    return this.request<{droplets: DropletInfo[]}>('GET', `droplets?tag_name=${encodeURI(tag)}`)
        .then((response) => {
          return response.droplets;
        });
  }

  /** @see DigitalOceanApi#getDroplets */
  getDroplets(): Promise<DropletInfo[]> {
    console.info('Requesting droplets');
    return this.request<{droplets: DropletInfo[]}>('GET', 'droplets').then((response) => {
      return response.droplets;
    });
  }

  private makeCreateDropletRequest(
      dropletName: string, region: string, keyId: number,
      dropletSpec: DigitalOceanDropletSpecification): Promise<{droplet: DropletInfo}> {
    let requestCount = 0;
    const MAX_REQUESTS = 10;
    const RETRY_TIMEOUT_MS = 5000;
    return new Promise((fulfill, reject) => {
      const makeRequestRecursive = () => {
        ++requestCount;
        console.info(`Requesting droplet creation ${requestCount}/${MAX_REQUESTS}`);
        this.request<{droplet: DropletInfo}>('POST', 'droplets', {
          name: dropletName,
          region,
          size: dropletSpec.size,
          image: dropletSpec.image,
          ssh_keys: [keyId],
          user_data: dropletSpec.installCommand,
          tags: dropletSpec.tags,
          ipv6: true,
        })
            .then(fulfill)
            .catch((e) => {
              if (e.message.toLowerCase().indexOf('finalizing') >= 0 &&
                  requestCount < MAX_REQUESTS) {
                // DigitalOcean is still validating this account and may take
                // up to 30 seconds.  We can retry more frequently to see when
                // this error goes away.
                setTimeout(makeRequestRecursive, RETRY_TIMEOUT_MS);
              } else {
                reject(e);
              }
            });
      };
      makeRequestRecursive();
    });
  }

  // Registers a SSH key with DigitalOcean.
  private registerKey(keyName: string, publicKeyForSSH: string): Promise<number> {
    console.info('Requesting key registration');
    return this
        .request<{ssh_key: {id: number}}>(
            'POST', 'account/keys', {name: keyName, public_key: publicKeyForSSH})
        .then((response) => {
          return response.ssh_key.id;
        });
  }

  // Makes an XHR request to DigitalOcean's API, returns a promise which fulfills
  // with the parsed object if successful.
  private request<T>(method: string, actionPath: string, data?: {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `https://api.digitalocean.com/v2/${actionPath}`);
      xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = () => {
        // DigitalOcean may return any 2xx status code for success.
        if (xhr.status >= 200 && xhr.status <= 299) {
          // Parse JSON response if available. For requests like DELETE
          // this.response may be empty.
          const responseObj = (xhr.response ? JSON.parse(xhr.response) : {});
          resolve(responseObj);
        } else if (xhr.status >= 400 && xhr.status <= 599) {
          // Client and server errors (400 and 500 range)
          try {
            const error: DigitalOceanError = JSON.parse(xhr.response);
            reject(new HttpError(xhr.status, error.message));
          } catch (error) {
            reject(new Error(`Failed to parse DigitalOcean error response: ${xhr.response}`));
          }
        }
      };
      xhr.onerror = () => {
        // This is raised for both network-level and CORS (authentication)
        // problems. Since there is, by design for security reasons, no way
        // to programmatically distinguish the two (the error instance
        // passed to this handler has *no* useful information), we should
        // prompt the user for whether to retry or re-authenticate against
        // DigitalOcean (this isn't so bad because application-level
        // errors, e.g. bad request parameters and even 404s, do *not* raise
        // an onerror event).
        console.error('Failed to perform DigitalOcean request');
        reject(new NetworkError());
      };
      xhr.send(data ? JSON.stringify(data) : undefined);
    });
  }

  // Removes invalid characters from input name so it can be used with
  // DigitalOcean APIs.
  private makeValidDropletName(name: string): string {
    // Remove all characters outside of A-Z, a-z, 0-9 and '-'.
    return name.replace(/[^A-Za-z0-9\-]/g, '');
  }
}
