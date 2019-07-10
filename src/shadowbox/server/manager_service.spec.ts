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

import {ManualClock} from '../infrastructure/clock';
import {PortProvider} from '../infrastructure/get_port';
import {InMemoryConfig} from '../infrastructure/json_config';
import {AccessKey, AccessKeyQuota, AccessKeyRepository} from '../model/access_key';

import {ManagerMetrics} from './manager_metrics';
import {ShadowsocksManagerService} from './manager_service';
import {ManagerMetricsStub, MockShadowsocksServer} from './mocks/mocks';
import {AccessKeyConfigJson, ServerAccessKeyRepository} from './server_access_key';
import {ServerConfigJson} from './server_config';
import {SharedMetricsPublisher} from './shared_metrics';

interface ServerInfo {
  name: string;
}

describe('ShadowsocksManagerService', () => {
  // After processing the response callback, we should set
  // responseProcessed=true.  This is so we can detect that first the response
  // callback is invoked, followed by the next (done) callback.
  let responseProcessed = false;
  beforeEach(() => {
    responseProcessed = false;
  });
  afterEach(() => {
    expect(responseProcessed).toEqual(true);
  });

  describe('getServer', () => {
    it('Return default name if name is absent', (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('default name', serverConfig, repo, null, null);
      service.getServer(
          {params: {}}, {
            send: (httpCode, data: ServerInfo) => {
              expect(httpCode).toEqual(200);
              expect(data.name).toEqual('default name');
              responseProcessed = true;
            }
          },
          done);
    });
    it('Return saved name', (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({name: 'Server'} as ServerConfigJson);
      const service = new ShadowsocksManagerService('default name', serverConfig, repo, null, null);
      service.getServer(
          {params: {}}, {
            send: (httpCode, data: ServerInfo) => {
              expect(httpCode).toEqual(200);
              expect(data.name).toEqual('Server');
              responseProcessed = true;
            }
          },
          done);
    });
  });

  describe('renameServer', () => {
    it('Rename changes the server name', (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('default name', serverConfig, repo, null, null);
      service.renameServer(
          {params: {name: 'new name'}}, {
            send: (httpCode, _) => {
              expect(httpCode).toEqual(204);
              expect(serverConfig.mostRecentWrite.name).toEqual('new name');
              responseProcessed = true;
            }
          },
          done);
    });
  });

  describe('listAccessKeys', () => {
    it('lists access keys in order', (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      // Create 2 access keys with names.
      Promise
          .all([
            createNewAccessKeyWithName(repo, 'keyName1'),
            createNewAccessKeyWithName(repo, 'keyName2')
          ])
          .then((keys) => {
            // Verify that response returns keys in correct order with correct names.
            const res = {
              send: (httpCode, data) => {
                expect(httpCode).toEqual(200);
                expect(data.accessKeys.length).toEqual(2);
                expect(data.accessKeys[0].name).toEqual(keys[0].name);
                expect(data.accessKeys[0].id).toEqual(keys[0].id);
                expect(data.accessKeys[1].name).toEqual(keys[1].name);
                expect(data.accessKeys[1].id).toEqual(keys[1].id);
                responseProcessed = true;  // required for afterEach to pass.
              }
            };
            service.listAccessKeys({params: {}}, res, done);
          });
    });
  });

  describe('createNewAccessKey', () => {
    it('creates keys', (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      // Verify that response returns a key with the expected properties.
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(201);
          const expectedProperties =
              ['id', 'name', 'password', 'port', 'method', 'accessUrl', 'quota', 'isOverQuota'];
          expect(Object.keys(data).sort()).toEqual(expectedProperties.sort());
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.createNewAccessKey({params: {}}, res, done);
    });
    it('Create returns a 500 when the repository throws an exception', (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'createNewAccessKey').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      const res = {send: (httpCode, data) => {}};
      service.createNewAccessKey({params: {}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('removeAccessKey', () => {
    it('removes keys', (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      // Create 2 access keys with names.
      Promise
          .all([
            createNewAccessKeyWithName(repo, 'keyName1'),
            createNewAccessKeyWithName(repo, 'keyName2')
          ])
          .then((keys) => {
            const res = {
              send: (httpCode, data) => {
                expect(httpCode).toEqual(204);
                // expect that the only remaining key is the 2nd key we created.
                expect(getFirstAccessKey(repo).id === keys[1].id);
                responseProcessed = true;  // required for afterEach to pass.
              }
            };
            // remove the 1st key.
            service.removeAccessKey({params: {id: keys[0].id}}, res, done);
          });
    });
    it('Remove returns a 500 when the repository throws an exception', (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'removeAccessKey').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      // Create 2 access keys with names.
      createNewAccessKeyWithName(repo, 'keyName1').then((key) => {
        const res = {send: (httpCode, data) => {}};
        service.removeAccessKey({params: {id: key.id}}, res, (error) => {
          expect(error.statusCode).toEqual(500);
          responseProcessed = true;  // required for afterEach to pass.
          done();
        });
      });
    });
  });

  describe('renameAccessKey', () => {
    it('renames keys', (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const OLD_NAME = 'oldName';
      const NEW_NAME = 'newName';

      createNewAccessKeyWithName(repo, OLD_NAME).then((key) => {
        expect(getFirstAccessKey(repo).name === OLD_NAME);
        const res = {
          send: (httpCode, data) => {
            expect(httpCode).toEqual(204);
            expect(getFirstAccessKey(repo).name === NEW_NAME);
            responseProcessed = true;  // required for afterEach to pass.
          }
        };
        service.renameAccessKey({params: {id: key.id, name: NEW_NAME}}, res, done);
      });
    });
    it('Rename returns a 500 when the repository throws an exception', (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'renameAccessKey').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      createNewAccessKeyWithName(repo, 'oldName').then((key) => {
        const res = {send: (httpCode, data) => {}};
        service.renameAccessKey({params: {id: key.id, name: 'newName'}}, res, (error) => {
          expect(error.statusCode).toEqual(500);
          responseProcessed = true;  // required for afterEach to pass.
          done();
        });
      });
    });
  });

  describe('setAccessKeyQuota', () => {
    it('sets access key quota', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      expect(accessKey.quota).toBeUndefined();
      expect(accessKey.isOverQuota).toBeFalsy();
      const quota: AccessKeyQuota = {quotaBytes: 10000, windowHours: 48};
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          const accessKey = getFirstAccessKey(repo);
          expect(accessKey.quota).toEqual(quota);
          expect(accessKey.isOverQuota).toBeFalsy();
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.setAccessKeyQuota({params: {id: accessKey.id, quota}}, res, done);
    });
    it('returns 409 when quota is missing values', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      let quota: AccessKeyQuota = {quotaBytes: 1, windowHours: 24};
      delete quota.windowHours;  // Trick the compiler to pass a malformed quota.
      const res = {send: (httpCode, data) => {}};
      await service.setAccessKeyQuota({params: {id: accessKey.id, quota}}, res, (error) => {
        expect(error.statusCode).toEqual(409);
      });
      quota = {quotaBytes: 1, windowHours: 24};
      delete quota.quotaBytes;
      service.setAccessKeyQuota({params: {id: accessKey.id, quota}}, res, (error) => {
        expect(error.statusCode).toEqual(409);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 409 when quota bytes is negative', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const quota: AccessKeyQuota = {quotaBytes: -1, windowHours: 24};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyQuota({params: {id: accessKey.id, quota}}, res, (error) => {
        expect(error.statusCode).toEqual(409);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 409 when quota window is negative', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const quota: AccessKeyQuota = {quotaBytes: 1000, windowHours: -24};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyQuota({params: {id: accessKey.id, quota}}, res, (error) => {
        expect(error.statusCode).toEqual(409);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 404 when the access key is not found', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const quota: AccessKeyQuota = {quotaBytes: 1000, windowHours: 24};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyQuota({params: {id: 'doesnotexist', quota}}, res, (error) => {
        expect(error.statusCode).toEqual(404);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'setAccessKeyQuota').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const quota: AccessKeyQuota = {quotaBytes: 10000, windowHours: 48};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyQuota({params: {id: accessKey.id, quota}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('removeAccessKeyQuota', () => {
    it('clears access key quota', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const quota: AccessKeyQuota = {quotaBytes: 10000, windowHours: 48};
      const accessKey = await repo.createNewAccessKey();
      accessKey.quota = quota;
      expect(accessKey.quota).toEqual(quota);
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          const accessKey = getFirstAccessKey(repo);
          expect(accessKey.quota).toBeUndefined();
          expect(accessKey.isOverQuota).toBeFalsy();
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.removeAccessKeyQuota({params: {id: accessKey.id}}, res, done);
    });
    it('returns 404 when the access key is not found', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const quota: AccessKeyQuota = {quotaBytes: 1000, windowHours: 24};
      const res = {send: (httpCode, data) => {}};
      service.removeAccessKeyQuota({params: {id: 'doesnotexist', quota}}, res, (error) => {
        expect(error.statusCode).toEqual(404);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'removeAccessKeyQuota').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const quota: AccessKeyQuota = {quotaBytes: 10000, windowHours: 48};
      const res = {send: (httpCode, data) => {}};
      service.removeAccessKeyQuota({params: {id: accessKey.id, quota}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('getShareMetrics', () => {
    it('Returns value from sharedMetrics', (done) => {
      const sharedMetrics = fakeSharedMetricsReporter();
      sharedMetrics.startSharing();
      const service =
          new ShadowsocksManagerService('default name', null, null, null, sharedMetrics);
      service.getShareMetrics(
          {params: {}}, {
            send: (httpCode, data: {metricsEnabled: boolean}) => {
              expect(httpCode).toEqual(200);
              expect(data.metricsEnabled).toEqual(true);
              responseProcessed = true;
            }
          },
          done);
    });
  });
  describe('setShareMetrics', () => {
    it('Sets value in the config', (done) => {
      const sharedMetrics = fakeSharedMetricsReporter();
      sharedMetrics.stopSharing();
      const service =
          new ShadowsocksManagerService('default name', null, null, null, sharedMetrics);
      service.setShareMetrics(
          {params: {metricsEnabled: true}}, {
            send: (httpCode, _) => {
              expect(httpCode).toEqual(204);
              expect(sharedMetrics.isSharingEnabled()).toEqual(true);
              responseProcessed = true;
            }
          },
          done);
    });
  });
});

function getFirstAccessKey(repo: AccessKeyRepository) {
  return repo.listAccessKeys()[0];
}

function createNewAccessKeyWithName(repo: AccessKeyRepository, name: string): Promise<AccessKey> {
  return repo.createNewAccessKey().then((key) => {
    key.name = name;
    return key;
  });
}

function createNewAccessKeyWithQuota(
    repo: AccessKeyRepository, quota: AccessKeyQuota): Promise<AccessKey> {
  return repo.createNewAccessKey().then((key) => {
    key.quota = quota;
    return key;
  });
}

function fakeSharedMetricsReporter(): SharedMetricsPublisher {
  let sharing = false;
  return {
    startSharing() {
      sharing = true;
    },
    stopSharing() {
      sharing = false;
    },
    isSharingEnabled(): boolean {
      return sharing;
    }
  };
}

function getAccessKeyRepository(): AccessKeyRepository {
  return new ServerAccessKeyRepository(
      new PortProvider(), 'hostname',
      new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}),
      new MockShadowsocksServer(), new ManagerMetricsStub({}));
}
