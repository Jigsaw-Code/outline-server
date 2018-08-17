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

export interface TokenManager {
  // Returns the Oauth token, or null if unavailable.
  getStoredToken(): string;
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
  getStoredToken(): string {
    const tokenFromStorage = this.getTokenFromStorage();
    if (tokenFromStorage) {
      console.info('found access token in local storage');
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

  private getTokenFromStorage(): string {
    return localStorage.getItem(this.DIGITALOCEAN_TOKEN_STORAGE_KEY);
  }
}
