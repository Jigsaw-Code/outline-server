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

import {hexToString} from '../infrastructure/hex_encoding';
import * as server from '../model/server';

import {ShadowboxServer} from './shadowbox_server';

class ManualServer extends ShadowboxServer implements server.ManualServer {
  constructor(config: server.ManualServerConfig, private forgetCallback: Function) {
    super();
    this.setManagementApiUrl(config.apiUrl);
    // config.certSha256 is expected to be in hex format (install script).
    // Electron requires that this be decoded from hex (to unprintable binary),
    // then encoded as base64.
    try {
      whitelistCertificate(btoa(hexToString(config.certSha256)));
    } catch (e) {
      // Error whitelisting certificate, may be due to bad user input.
      console.error('Error whitelisting certificate');
    }
  }

  forget(): void {
    this.forgetCallback();
  }
}

export class ManualServerRepository implements server.ManualServerRepository {
  constructor(private storageKey: string) {}

  addServer(config: server.ManualServerConfig): Promise<server.ManualServer> {
    const server = new ManualServer(config, this.forgetServer.bind(this));
    // Write to storage as an array, so we can easily extend this once we support
    // multiple servers.
    localStorage.setItem(this.storageKey, JSON.stringify([config]));
    return Promise.resolve(server);
  }

  listServers(): Promise<server.ManualServer[]> {
    const serversJson = localStorage.getItem(this.storageKey);
    if (serversJson) {
      try {
        const serversData = JSON.parse(serversJson);
        const manualServers = serversData.map((config: server.ManualServerConfig) => {
          return new ManualServer(config, this.forgetServer.bind(this));
        });
        return Promise.resolve(manualServers);
      } catch (e) {
        console.error('Error creating manual servers from localStorage');
      }
    }
    return Promise.resolve([]);
  }

  private forgetServer(): void {
    // TODO(dborkan): extend this code to find a specific server for deleting,
    // once we support multiple servers.
    localStorage.removeItem(this.storageKey);
  }
}
