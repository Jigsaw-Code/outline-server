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

import {PortProvider} from '../infrastructure/get_port';
import {InMemoryConfig} from '../infrastructure/json_config';
import {AccessKeyRepository} from '../model/access_key';
import {AccessKey, ShadowsocksServer} from '../model/shadowsocks_server';

import {AccessKeyConfigJson, ServerAccessKeyRepository} from './server_access_key';
import {ServerConfigJson} from './server_config';

describe('ServerAccessKeyRepository', () => {
  it('Repos with non-existent files are created with no access keys', (done) => {
    const repo = createRepo();
    expect(countAccessKeys(repo)).toEqual(0);
    done();
  });

  it('Can create new access keys', (done) => {
    const repo = createRepo();
    repo.createNewAccessKey().then((accessKey) => {
      expect(accessKey).toBeDefined();
      done();
    });
  });

  it('Can remove access keys', (done) => {
    const repo = createRepo();
    repo.createNewAccessKey().then((accessKey) => {
      expect(countAccessKeys(repo)).toEqual(1);
      const removeResult = repo.removeAccessKey(accessKey.id);
      expect(removeResult).toEqual(true);
      expect(countAccessKeys(repo)).toEqual(0);
      done();
    });
  });

  it('removeAccessKey returns false for missing keys', (done) => {
    const repo = createRepo();
    repo.createNewAccessKey().then((accessKey) => {
      expect(countAccessKeys(repo)).toEqual(1);
      const removeResult = repo.removeAccessKey('badId');
      expect(removeResult).toEqual(false);
      expect(countAccessKeys(repo)).toEqual(1);
      done();
    });
  });

  it('Can rename access keys', (done) => {
    const repo = createRepo();
    repo.createNewAccessKey().then((accessKey) => {
      const NEW_NAME = 'newName';
      const renameResult = repo.renameAccessKey(accessKey.id, NEW_NAME);
      expect(renameResult).toEqual(true);
      // List keys again and expect to see the NEW_NAME;
      const accessKeys = iterToArray(repo.listAccessKeys());
      expect(accessKeys[0].name).toEqual(NEW_NAME);
      done();
    });
  });

  it('renameAccessKey returns false for missing keys', (done) => {
    const repo = createRepo();
    repo.createNewAccessKey().then((accessKey) => {
      const NEW_NAME = 'newName';
      const renameResult = repo.renameAccessKey('badId', NEW_NAME);
      expect(renameResult).toEqual(false);
      // List keys again and expect to NOT see the NEW_NAME;
      const accessKeys = iterToArray(repo.listAccessKeys());
      expect(accessKeys[0].name).not.toEqual(NEW_NAME);
      done();
    });
  });

  it('Repos created with an existing file restore access keys', (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const serverConfig = new InMemoryConfig<ServerConfigJson>({});
    const repo1 = new ServerAccessKeyRepository(
        new PortProvider(), 'hostname', config, serverConfig, createMockShadowsocksServer());
    // Create 2 new access keys
    Promise.all([repo1.createNewAccessKey(), repo1.createNewAccessKey()]).then(() => {
      // Create a 2nd repo from the same config file.  This simulates what
      // might happen after the shadowbox server is restarted.
      const repo2 = new ServerAccessKeyRepository(
          new PortProvider(), 'hostname', config, serverConfig, createMockShadowsocksServer());
      // Check that repo1 and repo2 have the same access keys
      const repo1Keys = iterToArray(repo1.listAccessKeys());
      const repo2Keys = iterToArray(repo2.listAccessKeys());
      expect(repo1Keys.length).toEqual(2);
      expect(repo2Keys.length).toEqual(2);
      expect(repo1Keys[0]).toEqual(repo2Keys[0]);
      expect(repo1Keys[1]).toEqual(repo2Keys[1]);
      done();
    });
  });

  it('Does not re-use ids when using the same config file', (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const serverConfig = new InMemoryConfig<ServerConfigJson>({});
    // Create a repo with 1 access key, then delete that access key.
    const repo1 = new ServerAccessKeyRepository(
        new PortProvider(), 'hostname', config, serverConfig, createMockShadowsocksServer());
    repo1.createNewAccessKey().then((accessKey1) => {
      repo1.removeAccessKey(accessKey1.id);

      // Create a 2nd repo with one access key, and verify that
      // it hasn't reused the first access key's ID.
      const repo2 = new ServerAccessKeyRepository(
          new PortProvider(), 'hostname', config, serverConfig, createMockShadowsocksServer());
      repo2.createNewAccessKey().then((accessKey2) => {
        expect(accessKey1.id).not.toEqual(accessKey2.id);
        done();
      });
    });
  });
});

// Convert from an IterableIterator to an Array
function iterToArray<T>(iter: IterableIterator<T>): T[] {
  const returnArray = [];
  for (const el of iter) {
    returnArray.push(el);
  }
  return returnArray;
}

function countAccessKeys(repo: AccessKeyRepository) {
  return iterToArray(repo.listAccessKeys()).length;
}

function createMockShadowsocksServer(): ShadowsocksServer {
  return {
    update(keys: AccessKey[]) {
      return Promise.resolve();
    }
  };
}

function createRepo(): ServerAccessKeyRepository {
  const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
  const serverConfig = new InMemoryConfig<ServerConfigJson>({});
  const server = createMockShadowsocksServer();
  return new ServerAccessKeyRepository(
      new PortProvider(), 'hostname', config, serverConfig, server);
}
