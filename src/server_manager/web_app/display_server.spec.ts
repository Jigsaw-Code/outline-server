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

import {InMemoryStorage} from './app.spec';
import {DisplayServer, DisplayServerRepository} from './display_server';

describe('DisplayServerRepository', () => {
  it('adds and finds servers', () => {
    const displayServer = {id: 'id', name: 'name', isManaged: false};
    const repository = new DisplayServerRepository(new InMemoryStorage());
    repository.addServer(displayServer);

    expect(displayServer).toEqual(repository.findServer(displayServer.id));
  });

  it('lists servers', () => {
    const displayServer1 = {id: 'id1', name: 'name1', isManaged: false};
    const displayServer2 = {id: 'id2', name: 'name2', isManaged: true};
    const store = new Map([[
      DisplayServerRepository.SERVERS_STORAGE_KEY,
      JSON.stringify([displayServer1, displayServer2])
    ]]);
    const repository = new DisplayServerRepository(new InMemoryStorage(store));

    repository.listServers().then((servers) => {
      expect(servers).toContain(displayServer1);
      expect(servers).toContain(displayServer2);
    });
  });

  it('throws when adding duplicate servers', () => {
    const displayServer1 = {id: 'id', name: 'name', isManaged: true};
    const displayServer2 = {id: 'id', name: 'name', isManaged: true};
    const repository = new DisplayServerRepository(new InMemoryStorage());
    repository.addServer(displayServer1);

    const addDuplicateServer = () => {
      repository.addServer(displayServer2);
    };
    expect(addDuplicateServer).toThrow();
  });

  it('throws when adding servers missing properties', () => {
    const displayServer = {id: 'id', name: 'name', isManaged: true};
    delete displayServer['name'];  // Appease compiler.
    const repository = new DisplayServerRepository(new InMemoryStorage());

    const addMalformedServer = () => {
      repository.addServer(displayServer);
    };
    expect(addMalformedServer).toThrow();
  });

  it('loads existing servers', () => {
    const displayServer1 = {id: 'id1', name: 'name1', isManaged: false};
    const displayServer2 = {id: 'id2', name: 'name2', isManaged: true};
    const store = new Map([[
      DisplayServerRepository.SERVERS_STORAGE_KEY,
      JSON.stringify([displayServer1, displayServer2])
    ]]);
    const repository = new DisplayServerRepository(new InMemoryStorage(store));
    expect(repository.findServer(displayServer1.id)).toEqual(displayServer1);
    expect(repository.findServer(displayServer2.id)).toEqual(displayServer2);
  });

  it('removes servers', () => {
    const displayServerToKeep = {id: 'id0', name: 'name0', isManaged: false};
    const displayServerToRemove = {id: 'id', name: 'name', isManaged: false};
    const repository = new DisplayServerRepository(new InMemoryStorage());
    repository.addServer(displayServerToKeep);
    repository.addServer(displayServerToRemove);

    expect(repository.findServer(displayServerToRemove.id)).toEqual(displayServerToRemove);
    repository.removeServer(displayServerToRemove);
    expect(repository.findServer(displayServerToRemove.id)).toBeUndefined();
    expect(repository.findServer(displayServerToKeep.id)).toEqual(displayServerToKeep);
  });

  it('persists servers', () => {
    const displayServer = {id: 'id', name: 'name', isManaged: false};
    const storage = new InMemoryStorage();
    let repository = new DisplayServerRepository(storage);
    repository.addServer(displayServer);

    // Instantiate a new repository to validate that servers have been persisted to storage.
    repository = new DisplayServerRepository(storage);
    expect(displayServer).toEqual(repository.findServer(displayServer.id));
  });

  it('persists the last displayed server ID', () => {
    const serverId = 'serverId';
    const storage = new InMemoryStorage();
    let repository = new DisplayServerRepository(storage);
    repository.storeLastDisplayedServerId(serverId);

    expect(repository.getLastDisplayedServerId()).toEqual(serverId);

    repository = new DisplayServerRepository(storage);
    expect(repository.getLastDisplayedServerId()).toEqual(serverId);
  });

  it('removes the last displayed server ID', () => {
    const serverId = 'serverId';
    const storage = new InMemoryStorage();
    const repository = new DisplayServerRepository(storage);
    repository.storeLastDisplayedServerId(serverId);

    expect(repository.getLastDisplayedServerId()).toEqual(serverId);
    repository.removeLastDisplayedServerId();
    expect(repository.getLastDisplayedServerId()).toBeNull();
  });
});
