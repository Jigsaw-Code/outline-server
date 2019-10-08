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

import * as net from 'net';

import {InMemoryConfig} from '../infrastructure/json_config';
import {AccessKey, AccessKeyRepository, DataUsage} from '../model/access_key';
import {DataUsageTimeframe} from '../model/metrics';

import {ShadowsocksManagerService} from './manager_service';
import {FakePrometheusClient, FakeShadowsocksServer} from './mocks/mocks';
import {AccessKeyConfigJson, ServerAccessKeyRepository} from './server_access_key';
import {ServerConfigJson} from './server_config';
import {SharedMetricsPublisher} from './shared_metrics';

interface ServerInfo {
  name: string;
  dataUsageTimeframe: DataUsageTimeframe;
}

const NEW_PORT = 12345;
const OLD_PORT = 54321;
const EXPECTED_ACCESS_KEY_PROPERTIES =
    ['id', 'name', 'password', 'port', 'method', 'accessUrl', 'dataLimit'].sort();

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
    it('Returns data usage timeframe in server config', (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const timeframe = {hours: 24 * 30};
      serverConfig.data().dataUsageTimeframe = timeframe;
      const service = new ShadowsocksManagerService('default name', serverConfig, repo, null, null);
      service.getServer(
          {params: {}}, {
            send: (httpCode, data: ServerInfo) => {
              expect(httpCode).toEqual(200);
              expect(data.dataUsageTimeframe).toEqual(timeframe);
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
    it('lists access keys in order', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      // Create 2 access keys with names.
      const key1 = await createNewAccessKeyWithName(repo, 'keyName1');
      const key2 = await createNewAccessKeyWithName(repo, 'keyName2');
      // Verify that response returns keys in correct order with correct names.
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(200);
          expect(data.accessKeys.length).toEqual(2);
          expect(data.accessKeys[0].name).toEqual(key1.name);
          expect(data.accessKeys[0].id).toEqual(key1.id);
          expect(data.accessKeys[1].name).toEqual(key2.name);
          expect(data.accessKeys[1].id).toEqual(key2.id);
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.listAccessKeys({params: {}}, res, done);
    });
    it('lists access keys with expected properties', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      await repo.createNewAccessKey();
      const limit = {bytes: 10000};
      await repo.setAccessKeyDataLimit(accessKey.id, limit);
      const accessKeyName = 'new name';
      await repo.renameAccessKey(accessKey.id, accessKeyName);
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(200);
          expect(data.accessKeys.length).toEqual(2);
          const serviceAccessKey1 = data.accessKeys[0];
          const serviceAccessKey2 = data.accessKeys[1];
          expect(Object.keys(serviceAccessKey1).sort()).toEqual(EXPECTED_ACCESS_KEY_PROPERTIES);
          expect(Object.keys(serviceAccessKey2).sort()).toEqual(EXPECTED_ACCESS_KEY_PROPERTIES);
          expect(serviceAccessKey1.name).toEqual(accessKeyName);
          expect(serviceAccessKey1.dataLimit).toEqual(limit);
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.listAccessKeys({params: {}}, res, done);
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
          expect(Object.keys(data).sort()).toEqual(EXPECTED_ACCESS_KEY_PROPERTIES);
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
  describe('setPortForNewAccessKeys', () => {
    it('changes ports for new access keys', async (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('name', serverConfig, repo, null, null);

      const oldKey = await repo.createNewAccessKey();
      const res = {
        send: (httpCode) => {
          expect(httpCode).toEqual(204);
        }
      };
      await service.setPortForNewAccessKeys({params: {port: NEW_PORT}}, res, () => {});
      const newKey = await repo.createNewAccessKey();
      expect(newKey.proxyParams.portNumber).toEqual(NEW_PORT);
      expect(oldKey.proxyParams.portNumber).not.toEqual(NEW_PORT);
      responseProcessed = true;
      done();
    });

    it('changes the server config', async (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('name', serverConfig, repo, null, null);

      const res = {
        send: (httpCode) => {
          expect(httpCode).toEqual(204);
          expect(serverConfig.data().portForNewAccessKeys).toEqual(NEW_PORT);
          responseProcessed = true;
        }
      };
      await service.setPortForNewAccessKeys({params: {port: NEW_PORT}}, res, done);
    });

    it('rejects invalid port numbers', async (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('name', serverConfig, repo, null, null);

      const res = {
        send: (httpCode) => {
          fail(
              `setPortForNewAccessKeys should have failed with 400 Bad Request, instead succeeded with code ${
                  httpCode}`);
        }
      };
      const next = (error) => {
        // Bad Request
        expect(error.statusCode).toEqual(400);
      };

      await service.setPortForNewAccessKeys({params: {port: -1}}, res, next);
      await service.setPortForNewAccessKeys({params: {port: 0}}, res, next);
      await service.setPortForNewAccessKeys({params: {port: 100.1}}, res, next);
      await service.setPortForNewAccessKeys({params: {port: 65536}}, res, next);

      responseProcessed = true;
      done();
    });

    it('rejects port numbers already in use', async (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('name', serverConfig, repo, null, null);

      const res = {
        send: (httpCode) => {
          fail(
              `setPortForNewAccessKeys should have failed with 409 Conflict, instead succeeded with code ${
                  httpCode}`);
        }
      };
      const next = (error) => {
        // Conflict
        expect(error.statusCode).toEqual(409);
        responseProcessed = true;
        done();
      };

      const server = new net.Server();
      server.listen(NEW_PORT, async () => {
        await service.setPortForNewAccessKeys({params: {port: NEW_PORT}}, res, next);
      });
    });

    it('accepts port numbers already in use by access keys', async (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('name', serverConfig, repo, null, null);

      await service.createNewAccessKey({params: {}}, {send: () => {}}, () => {});
      await service.setPortForNewAccessKeys({params: {port: NEW_PORT}}, {send: () => {}}, () => {});
      const res = {
        send: (httpCode) => {
          expect(httpCode).toEqual(204);
          responseProcessed = true;
        }
      };

      const firstKeyConnection = new net.Server();
      firstKeyConnection.listen(OLD_PORT, async () => {
        await service.setPortForNewAccessKeys({params: {port: OLD_PORT}}, res, () => {});
        firstKeyConnection.close();
        done();
      });
    });

    it('rejects malformed requests', async (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('name', serverConfig, repo, null, null);

      const noPort = {params: {}};
      const res = {
        send: (httpCode) => {
          fail(
              `setPortForNewAccessKeys should have failed with 400 BadRequest, instead succeeded with code ${
                  httpCode}`);
        }
      };
      const next = (error) => {
        expect(error.statusCode).toEqual(400);
      };

      await service.setPortForNewAccessKeys(noPort, res, next);

      const nonNumericPort = {params: {port: 'abc'}};
      await service.setPortForNewAccessKeys(
        // tslint:disable-next-line: no-any
          (nonNumericPort as any) as {params: {port: number}}, res, next);

      responseProcessed = true;
      done();
    });
  });

  describe('removeAccessKey', () => {
    it('removes keys', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const key1 = await repo.createNewAccessKey();
      const key2 = await repo.createNewAccessKey();
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          // expect that the only remaining key is the 2nd key we created.
          const keys = repo.listAccessKeys();
          expect(keys.length).toEqual(1);
          expect(keys[0].id === key2.id);
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      // remove the 1st key.
      service.removeAccessKey({params: {id: key1.id}}, res, done);
    });
    it('Remove returns a 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'removeAccessKey').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const key = await createNewAccessKeyWithName(repo, 'keyName1');
      const res = {send: (httpCode, data) => {}};
      service.removeAccessKey({params: {id: key.id}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('renameAccessKey', () => {
    it('renames keys', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const OLD_NAME = 'oldName';
      const NEW_NAME = 'newName';

      const key = await createNewAccessKeyWithName(repo, OLD_NAME);
      expect(key.name === OLD_NAME);
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          expect(key.name === NEW_NAME);
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.renameAccessKey({params: {id: key.id, name: NEW_NAME}}, res, done);
    });
    it('Rename returns a 400 when the access key id is not a string', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      const key = await repo.createNewAccessKey();
      const res = {send: (httpCode, data) => {}};
      service.renameAccessKey({params: {id: 123}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('Rename returns a 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'renameAccessKey').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);

      const key = await createNewAccessKeyWithName(repo, 'oldName');
      const res = {send: (httpCode, data) => {}};
      service.renameAccessKey({params: {id: key.id, name: 'newName'}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('setAccessKeyDataLimit', () => {
    it('sets access key limit', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      expect(accessKey.dataLimit).toBeUndefined();
      expect(accessKey.isOverDataLimit()).toBeFalsy();
      const limit = {bytes: 10000};
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          expect(accessKey.dataLimit).toEqual(limit);
          expect(accessKey.isOverDataLimit()).toBeFalsy();
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.setAccessKeyDataLimit({params: {id: accessKey.id, limit}}, res, done);
    });
    it('returns 400 when limit is missing values', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const limit = {} as DataUsage;
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyDataLimit({params: {id: accessKey.id, limit}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 400 when limit has negative values', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const limit = {bytes: -1};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyDataLimit({params: {id: accessKey.id, limit}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 404 when the access key is not found', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const limit = {bytes: 1000};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyDataLimit({params: {id: 'doesnotexist', limit}}, res, (error) => {
        expect(error.statusCode).toEqual(404);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'setAccessKeyDataLimit').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const limit = {bytes: 10000};
      const res = {send: (httpCode, data) => {}};
      service.setAccessKeyDataLimit({params: {id: accessKey.id, limit}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('removeAccessKeyDataLimit', () => {
    it('clears access key limit', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const limit = {bytes: 10000};
      const accessKey = await repo.createNewAccessKey();
      await repo.setAccessKeyDataLimit(accessKey.id, limit);
      expect(accessKey.dataLimit).toEqual(limit);
      expect(accessKey.dataUsage.bytes).toEqual(0);
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          expect(accessKey.dataLimit).toBeUndefined();
          expect(accessKey.isOverDataLimit()).toBeFalsy();
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.removeAccessKeyDataLimit({params: {id: accessKey.id}}, res, done);
    });
    it('returns 404 when the access key is not found', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const res = {send: (httpCode, data) => {}};
      service.removeAccessKeyDataLimit({params: {id: 'doesnotexist'}}, res, (error) => {
        expect(error.statusCode).toEqual(404);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'removeAccessKeyDataLimit').and.throwError('cannot write to disk');
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const accessKey = await repo.createNewAccessKey();
      const res = {send: (httpCode, data) => {}};
      service.removeAccessKeyDataLimit({params: {id: accessKey.id}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  describe('setDataUsageTimeframe', () => {
    it('sets data usage timeframe', (done) => {
      const repo = getAccessKeyRepository();
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      serverConfig.data().dataUsageTimeframe = {hours: 123};
      const service = new ShadowsocksManagerService('default name', serverConfig, repo, null, null);
      const hours = 456;
      const res = {
        send: (httpCode, data) => {
          expect(httpCode).toEqual(204);
          expect(serverConfig.data().dataUsageTimeframe.hours).toEqual(hours);
          responseProcessed = true;  // required for afterEach to pass.
        }
      };
      service.setDataUsageTimeframe({params: {hours}}, res, done);
    });
    it('returns 400 when the hours value is missing or invalid', async (done) => {
      const repo = getAccessKeyRepository();
      const service = new ShadowsocksManagerService('default name', null, repo, null, null);
      const res = {send: (httpCode, data) => {}};
      service.setDataUsageTimeframe({params: {}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
      });
      service.setDataUsageTimeframe({params: {hours: -1}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
      });
      service.setDataUsageTimeframe({params: {hours: 0}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
      });
      service.setDataUsageTimeframe({params: {hours: 0.1}}, res, (error) => {
        expect(error.statusCode).toEqual(400);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
    it('returns 500 when the repository throws an exception', async (done) => {
      const repo = getAccessKeyRepository();
      spyOn(repo, 'setDataUsageTimeframe').and.throwError('cannot write to disk');
      const serverConfig = new InMemoryConfig({} as ServerConfigJson);
      const service = new ShadowsocksManagerService('default name', serverConfig, repo, null, null);
      serverConfig.data().dataUsageTimeframe = {hours: 123};
      const res = {send: (httpCode, data) => {}};
      service.setDataUsageTimeframe({params: {hours: 456}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        // The change should not have been persisted.
        expect(serverConfig.data().dataUsageTimeframe.hours).toEqual(123);
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

async function createNewAccessKeyWithName(
    repo: AccessKeyRepository, name: string): Promise<AccessKey> {
  const accessKey = await repo.createNewAccessKey();
  try {
    repo.renameAccessKey(accessKey.id, name);
  } catch (e) {
    // Ignore; writing to disk is expected to fail in some of the tests.
  }
  return accessKey;
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
      OLD_PORT, 'hostname', new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}),
      new FakeShadowsocksServer(), new FakePrometheusClient({}), {hours: 24 * 30});
}
