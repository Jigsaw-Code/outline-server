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

import * as digitalocean_api from '../cloud/digitalocean_api';
import {SentryErrorReporter} from './error_reporter';

export interface TokenManager {
  // Returns the Oauth token, or null if unavailable, and clears the URL.
  extractTokenFromUrl(): string;
  // Writes the token to storage.
  writeTokenToStorage(token: string): void;
  // Removes the token from storage.
  removeTokenFromStorage(): void;
}


// TODO: this class combines URL manipulation with persistence logic.
// Consider moving the URL manipulation logic to a separate class, so we
// can pass in other implementations when the global "window" is not present.
export class DigitalOceanTokenManager implements TokenManager {
  private readonly DIGITALOCEAN_TOKEN_STORAGE_KEY = 'LastDOToken';

  // Searches the current URL (post-OAuth) and local storage for a DigitalOcean
  // access token. The token is not checked for validity as this would require
  // an extra roundtrip to DigitalOcean.
  extractTokenFromUrl(): string {
    const tokenFromUrl = this.getTokenFromUrl();
    if (tokenFromUrl) {
      const msg = 'found access token in URL';
      console.log(msg);
      SentryErrorReporter.logInfo(msg);
      // Clear the access_token param it doesn't get sent along with error reports.
      this.clearUrl();
      return tokenFromUrl;
    }

    const tokenFromStorage = this.getTokenFromStorage();
    if (tokenFromStorage) {
      const msg = 'found access token in local storage';
      console.log(msg);
      SentryErrorReporter.logInfo(msg);
      return tokenFromStorage;
    }

    // Not an error as user may not yet have authenticated.
    return null;
  }

  writeTokenToStorage(token: string): void {
    localStorage.setItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY, token);
  }

  removeTokenFromStorage(): void {
    localStorage.removeItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }

  private getTokenFromUrl(): string {
    const urlMatches = window.location.hash.match(/access_token=([^&]*)/);
    if (urlMatches && urlMatches[1]) {
      return urlMatches[1];
    }
    return null;
  }

  private clearUrl(): void {
    window.location.hash = '';
  }

  private getTokenFromStorage(): string {
    return localStorage.getItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }
}

export function getOauthUrl(currentUrl: string) {
  let redirectUrl = currentUrl;
  // Running on Electron
  if (currentUrl.substr(0, 'outline:'.length) === 'outline:') {
    redirectUrl = 'https://www.getoutline.org/digitalocean_oauth';
  }
  // Remove trailing '#'
  const hashIndex = redirectUrl.indexOf('#');
  if (hashIndex !== -1) {
    redirectUrl = redirectUrl.substr(0, hashIndex);
  }
  const clientId = CLIENT_ID_BY_URL[redirectUrl];
  if (!clientId) {
    const msg = 'could not find client ID for redirect url';
    SentryErrorReporter.logError(msg);
    throw new Error(`${msg}: ${redirectUrl}`);
  }
  // Redirects back to the current URL.
  return digitalocean_api.getOauthUrl(clientId, redirectUrl);
}

// DigitalOcean client IDs can be found at
// https://cloud.digitalocean.com/settings/api/applications
// using the App creator's DigitalOcean account.  Note each client ID
// only allows for 1 redirect URI.
const CLIENT_ID_BY_URL: {[key: string]: string} = {
  // https://cloud.digitalocean.com/settings/api/applications/details/28204
  'https://www.getoutline.org/digitalocean_oauth':
      'd1879633d5f426356345ae7d46be9b900b1bd58208a72edc8df9e9162be69d9a'
};
