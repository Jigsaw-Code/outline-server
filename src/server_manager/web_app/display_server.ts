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

import * as server from '../model/server';

export interface DisplayServer {
  id: string;
  name: string;
  isManaged: boolean;
}

// Persistence layer for `DisplayServer`. Caches the list of servers shown in the UI in case they
// cannot be accessed due to connectivity issues.
export class DisplayServerRepository {
  static readonly SERVERS_STORAGE_KEY = 'displayServers';
  static readonly LAST_DISPLAYED_SERVER_STORAGE_KEY = 'lastDisplayedServer';

  private servers: DisplayServer[] = [];

  constructor(private storage: Storage = localStorage) {
    this.loadServers();
  }

  listServers(): Promise<DisplayServer[]> {
    // Copy the server array; resolving with the instance variable may lead to races in `findServer`
    return Promise.resolve(JSON.parse(JSON.stringify(this.servers)));
  }

  addServer(server: DisplayServer) {
    if (!server || !server.id || !server.name) {
      throw new Error('Failed to add display server, one or more properties missing');
    }
    if (this.findServer(server.id)) {
      throw new Error(`Display server already stored`);
    }
    this.servers.push(server);
    this.storeServers();
  }

  removeServer(serverToRemove: DisplayServer) {
    this.servers = this.servers.filter((server: DisplayServer) => {
      return server.id !== serverToRemove.id;
    });
    this.storeServers();
  }

  findServer(serverId: string): DisplayServer {
    return this.servers.find(server => server.id === serverId);
  }

  storeLastDisplayedServerId(serverId: string) {
    this.storage.setItem(DisplayServerRepository.LAST_DISPLAYED_SERVER_STORAGE_KEY, serverId);
  }

  getLastDisplayedServerId(): string {
    return this.storage.getItem(DisplayServerRepository.LAST_DISPLAYED_SERVER_STORAGE_KEY);
  }

  removeLastDisplayedServerId() {
    this.storage.removeItem(DisplayServerRepository.LAST_DISPLAYED_SERVER_STORAGE_KEY);
  }

  // Loads the servers from storage. Does *not* throw because it is only called on the constructor,
  // and the repository is created before the app starts.
  private loadServers() {
    const serversJson = this.storage.getItem(DisplayServerRepository.SERVERS_STORAGE_KEY);
    if (!serversJson) {
      return;
    }
    try {
      this.servers = JSON.parse(serversJson);
    } catch (e) {
      console.error('Error loading local servers from storage');
    }
  }

  private storeServers() {
    this.storage.setItem(DisplayServerRepository.SERVERS_STORAGE_KEY, JSON.stringify(this.servers));
  }
}
