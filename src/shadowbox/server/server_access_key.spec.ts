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

import {ManualClock} from '../infrastructure/clock';
import {PortProvider} from '../infrastructure/get_port';
import {InMemoryConfig} from '../infrastructure/json_config';
import {AccessKeyQuota, AccessKeyRepository} from '../model/access_key';
import * as errors from '../model/errors';

import {FakePrometheusClient, FakeShadowsocksServer} from './mocks/mocks';
import {AccessKeyConfigJson, ServerAccessKeyRepository} from './server_access_key';

describe('ServerAccessKeyRepository', () => {
  it('Repos with non-existent files are created with no access keys', (done) => {
    const repo = new RepoBuilder().build();
    expect(countAccessKeys(repo)).toEqual(0);
    done();
  });

  it('Can create new access keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      expect(accessKey).toBeDefined();
      done();
    });
  });

  it('Creates access keys without quota and under quota', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    expect(accessKey.quotaUsage).toBeUndefined();
    expect(accessKey.isOverQuota()).toBeFalsy();
    done();
  });

  it('Can remove access keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      expect(countAccessKeys(repo)).toEqual(1);
      const removeResult = repo.removeAccessKey(accessKey.id);
      expect(removeResult).toEqual(true);
      expect(countAccessKeys(repo)).toEqual(0);
      done();
    });
  });

  it('removeAccessKey returns false for missing keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      expect(countAccessKeys(repo)).toEqual(1);
      const removeResult = repo.removeAccessKey('badId');
      expect(removeResult).toEqual(false);
      expect(countAccessKeys(repo)).toEqual(1);
      done();
    });
  });

  it('Can rename access keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      const NEW_NAME = 'newName';
      const renameResult = repo.renameAccessKey(accessKey.id, NEW_NAME);
      expect(renameResult).toEqual(true);
      // List keys again and expect to see the NEW_NAME.
      const accessKeys = repo.listAccessKeys();
      expect(accessKeys[0].name).toEqual(NEW_NAME);
      done();
    });
  });

  it('renameAccessKey returns false for missing keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      const NEW_NAME = 'newName';
      const renameResult = repo.renameAccessKey('badId', NEW_NAME);
      expect(renameResult).toEqual(false);
      // List keys again and expect to NOT see the NEW_NAME.
      const accessKeys = repo.listAccessKeys();
      expect(accessKeys[0].name).not.toEqual(NEW_NAME);
      done();
    });
  });

  it('Creates keys at the right port by construction', async (done) => {
    const portProvider = new PortProvider();
    const port = await portProvider.reserveNewPort();
    const repo = new RepoBuilder().port(port).build();
    const key = await repo.createNewAccessKey();
    expect(key.proxyParams.portNumber).toEqual(port);
    done();
  });

  it('setPortForNewAccessKeys changes default port for new keys', async (done) => {
    const portProvider = new PortProvider();
    const port = await portProvider.reserveNewPort();
    const repo = new RepoBuilder().build();
    await repo.setPortForNewAccessKeys(port);
    const key = await repo.createNewAccessKey();
    expect(key.proxyParams.portNumber).toEqual(port);
    done();
  });

  it('setPortForNewAccessKeys maintains ports on existing keys', async (done) => {
    const portProvider = new PortProvider();
    const oldPort = await portProvider.reserveNewPort();
    const repo = new RepoBuilder().port(oldPort).build();
    const oldKey = await repo.createNewAccessKey();

    const newPort = await portProvider.reserveNewPort();
    await repo.setPortForNewAccessKeys(newPort);
    expect(oldKey.proxyParams.portNumber).toEqual(oldPort);
    done();
  });

  it('setPortForNewAccessKeys rejects invalid port numbers', async (done) => {
    const repo = new RepoBuilder().build();
    // jasmine.toThrowError expects a function and makes the code
    // hard to read.
    const expectThrow = async (port: number) => {
      try {
        await repo.setPortForNewAccessKeys(port);
        fail(`setPortForNewAccessKeys should reject invalid port number ${port}.`);
      } catch (error) {
        expect(error instanceof errors.InvalidPortNumber).toBeTruthy();
      }
    };
    await expectThrow(0);
    await expectThrow(-1);
    await expectThrow(100.1);
    await expectThrow(65536);
    done();
  });

  it('setPortForNewAccessKeys rejects ports in use', async (done) => {
    const portProvider = new PortProvider();
    const port = await portProvider.reserveNewPort();
    const repo = new RepoBuilder().build();
    const server = new net.Server();
    server.listen(port, async () => {
      try {
        await repo.setPortForNewAccessKeys(port);
        fail(`setPortForNewAccessKeys should reject already used port ${port}.`);
      } catch (error) {
        expect(error instanceof errors.PortUnavailable);
      }
      server.close();
      done();
    });
  });

  it('setPortForNewAccessKeys accepts ports already used by access keys', async (done) => {
    const portProvider = new PortProvider();
    const oldPort = await portProvider.reserveNewPort();
    const repo = new RepoBuilder().port(oldPort).build();
    await repo.createNewAccessKey();

    // jasmine.toThrowError expects a function and makes the code
    // hard to read.  We also can't do anything like
    // `expect(repo.setPortForNewAccessKeys.bind(repo, port)).not.toThrow()`
    // since setPortForNewAccessKeys is async and this would lead to false positives
    // when expect() returns before setPortForNewAccessKeys throws.
    const expectNoThrow = async (port: number) => {
      try {
        await repo.setPortForNewAccessKeys(port);
      } catch (error) {
        fail(`setPortForNewAccessKeys should accept port ${port}.`);
      }
    };

    await expectNoThrow(await portProvider.reserveNewPort());

    // simulate the first key's connection on its port
    const server = new net.Server();
    server.listen(oldPort, async () => {
      await expectNoThrow(oldPort);
      server.close();
      done();
    });
  });

  it('Can set access key quota', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    const quota = {data: {bytes: 5000}, window: {hours: 24}};
    expect(await repo.setAccessKeyQuota(accessKey.id, quota)).toBeTruthy();
    const accessKeys = repo.listAccessKeys();
    expect(accessKeys[0].quotaUsage.quota).toEqual(quota);
    expect(accessKeys[0].quotaUsage.usage.bytes).toEqual(0);
    done();
  });

  it('setAccessKeyQuota returns false for missing keys', async (done) => {
    const repo = new RepoBuilder().build();
    await repo.createNewAccessKey();
    const quota = {data: {bytes: 1000}, window: {hours: 24}};
    expect(await repo.setAccessKeyQuota('doesnotexist', quota)).toBeFalsy();
    done();
  });

  it('setAccessKeyQuota fails with disallowed quota values', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    // Negative values
    const negativeBytesQuota = {data: {bytes: -1000}, window: {hours: 24}};
    expect(await repo.setAccessKeyQuota(accessKey.id, negativeBytesQuota)).toBeFalsy();
    const negativeWindowQuota = {data: {bytes: 1000}, window: {hours: -24}};
    expect(await repo.setAccessKeyQuota(accessKey.id, negativeWindowQuota)).toBeFalsy();
    // Missing properties
    const missingDataQuota = {window: {hours: 24}} as AccessKeyQuota;
    expect(await repo.setAccessKeyQuota(accessKey.id, missingDataQuota)).toBeFalsy();
    const missingWindowQuota = {data: {bytes: 1000}} as AccessKeyQuota;
    expect(await repo.setAccessKeyQuota(accessKey.id, missingWindowQuota)).toBeFalsy();
    // Undefined quota
    expect(await repo.setAccessKeyQuota(accessKey.id, undefined)).toBeFalsy();
    done();
  });

  it('setAccessKeyQuota updates keys quota status', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 200});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();

    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();

    await repo.setAccessKeyQuota(accessKey1.id, {data: {bytes: 200}, window: {hours: 1}});
    let accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeTruthy();
    expect(accessKeys[1].isOverQuota()).toBeFalsy();
    // We determine which access keys have been enabled/disabled by accessing them from
    // the server's perspective, ensuring `server.update` has been called.
    let serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey2.id);
    // The over-quota access key should be re-enabled after increasing its quota, while the
    // under-quota key should be disabled after setting its quota.
    prometheusClient.bytesTransferredById = {'0': 800, '1': 199};
    await repo.setAccessKeyQuota(accessKey1.id, {data: {bytes: 1000}, window: {hours: 1}});
    await repo.setAccessKeyQuota(accessKey2.id, {data: {bytes: 100}, window: {hours: 1}});
    accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeFalsy();
    expect(accessKeys[1].isOverQuota()).toBeTruthy();
    serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    done();
  });

  it('can remove access key quotas', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    await expect(repo.setAccessKeyQuota(accessKey.id, {data: {bytes: 100}, window: {hours: 24}}))
        .toBeTruthy();
    expect(repo.listAccessKeys()[0].quotaUsage).toBeDefined();
    expect(repo.removeAccessKeyQuota(accessKey.id)).toBeTruthy();
    expect(repo.listAccessKeys()[0].quotaUsage).toBeUndefined();
    done();
  });

  it('removeAccessKeyQuota returns false for missing keys', async (done) => {
    const repo = new RepoBuilder().build();
    await repo.createNewAccessKey();
    expect(await repo.removeAccessKeyQuota('doesnotexist')).toBeFalsy();
    done();
  });

  it('removeAccessKeyQuota restores over-quota access keys when removing quota ', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 100});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();

    const accessKey = await repo.createNewAccessKey();
    await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey.id, {data: {bytes: 100}, window: {hours: 1}});
    expect(server.getAccessKeys().length).toEqual(1);

    // Remove the quota; expect the key to be under quota and enabled.
    expect(repo.removeAccessKeyQuota(accessKey.id)).toBeTruthy();
    expect(server.getAccessKeys().length).toEqual(2);
    const accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeFalsy();
    expect(accessKeys[1].isOverQuota()).toBeFalsy();
    expect(accessKeys[0].quotaUsage).toBeUndefined();
    expect(accessKeys[1].quotaUsage).toBeUndefined();
    done();
  });

  it('enforceAccessKeyQuotas updates keys quota status ', async (done) => {
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 100});
    const repo = new RepoBuilder().prometheusClient(prometheusClient).build();

    const accessKey1 = await repo.createNewAccessKey();
    await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey1.id, {data: {bytes: 200}, window: {hours: 1}});

    await repo.enforceAccessKeyQuotas();
    let accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeTruthy();
    expect(accessKeys[1].isOverQuota()).toBeFalsy();
    expect(accessKeys[0].quotaUsage.usage.bytes).toEqual(500);
    expect(accessKeys[1].quotaUsage).toBeUndefined();

    prometheusClient.bytesTransferredById = {'0': 100, '1': 100};
    await repo.enforceAccessKeyQuotas();
    accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeFalsy();
    expect(accessKeys[1].isOverQuota()).toBeFalsy();
    expect(accessKeys[0].quotaUsage.usage.bytes).toEqual(100);
    expect(accessKeys[1].quotaUsage).toBeUndefined();
    done();
  });

  it('enforceAccessKeyQuotas enables and disables keys', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 100});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();

    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey1.id, {data: {bytes: 200}, window: {hours: 1}});

    await repo.enforceAccessKeyQuotas();
    const accessKeys = await repo.listAccessKeys();
    let serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey2.id);

    prometheusClient.bytesTransferredById = {'0': 100, '1': 100};
    await repo.enforceAccessKeyQuotas();
    serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(2);
    done();
  });

  it('Repos created with an existing file restore access keys', async (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const repo1 = new RepoBuilder().keyConfig(config).build();
    // Create 2 new access keys
    await Promise.all([repo1.createNewAccessKey(), repo1.createNewAccessKey()]);
    // Modify properties
    await repo1.setAccessKeyQuota('0', {data: {bytes: 100}, window: {hours: 12}});
    repo1.renameAccessKey('1', 'name');

    // Create a 2nd repo from the same config file. This simulates what
    // might happen after the shadowbox server is restarted.
    const repo2 = new RepoBuilder().keyConfig(config).build();
    // Check that repo1 and repo2 have the same access keys
    expect(repo1.listAccessKeys()).toEqual(repo2.listAccessKeys());
    done();
  });

  it('Does not re-use ids when using the same config file', (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    // Create a repo with 1 access key, then delete that access key.
    const repo1 = new RepoBuilder().keyConfig(config).build();
    repo1.createNewAccessKey().then((accessKey1) => {
      repo1.removeAccessKey(accessKey1.id);

      // Create a 2nd repo with one access key, and verify that
      // it hasn't reused the first access key's ID.
      const repo2 = new RepoBuilder().keyConfig(config).build();
      repo2.createNewAccessKey().then((accessKey2) => {
        expect(accessKey1.id).not.toEqual(accessKey2.id);
        done();
      });
    });
  });

  it('start exposes the access keys to the server', async (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const repo = new RepoBuilder().keyConfig(config).build();

    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    // Create a new repository with the same configuration. The keys should not be exposed to the
    // server until `start` is called.
    const server = new FakeShadowsocksServer();
    const repo2 = new RepoBuilder().keyConfig(config).shadowsocksServer(server).build();
    expect(server.getAccessKeys().length).toEqual(0);
    await repo2.start(new ManualClock());
    const serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(2);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    expect(serverAccessKeys[1].id).toEqual(accessKey2.id);
    done();
  });

  it('start periodically enforces access key quotas', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 300, '2': 1000});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();

    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    const accessKey3 = await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey1.id, {data: {bytes: 300}, window: {hours: 1}});
    await repo.setAccessKeyQuota(accessKey2.id, {data: {bytes: 100}, window: {hours: 1}});
    const clock = new ManualClock();

    await repo.start(clock);
    await clock.runCallbacks();
    let accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeTruthy();
    expect(accessKeys[1].isOverQuota()).toBeTruthy();
    expect(accessKeys[2].isOverQuota()).toBeFalsy();
    expect(accessKeys[0].quotaUsage.usage.bytes).toEqual(500);
    expect(accessKeys[1].quotaUsage.usage.bytes).toEqual(300);
    expect(accessKeys[2].quotaUsage).toBeUndefined();
    let serverAccessKeys = await server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey3.id);

    // Simulate a change in usage.
    prometheusClient.bytesTransferredById = {'0': 100, '1': 300, '2': 1000};
    await clock.runCallbacks();
    accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota()).toBeFalsy();
    expect(accessKeys[1].isOverQuota()).toBeTruthy();
    expect(accessKeys[2].isOverQuota()).toBeFalsy();
    expect(accessKeys[0].quotaUsage.usage.bytes).toEqual(100);
    expect(accessKeys[1].quotaUsage.usage.bytes).toEqual(300);
    expect(accessKeys[2].quotaUsage).toBeUndefined();
    serverAccessKeys = await server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(2);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    expect(serverAccessKeys[1].id).toEqual(accessKey3.id);
    done();
  });

  it('getOutboundByteTransfer', async (done) => {
    const prometheusClient = new FakePrometheusClient({'0': 1024});
    const repo = new RepoBuilder().prometheusClient(prometheusClient).build();
    const bytesTransferred = await repo.getOutboundByteTransfer('0', 10);
    expect(bytesTransferred).toEqual(1024);
    done();
  });

  it('getOutboundByteTransfer returns zero when ID is missing', async (done) => {
    const prometheusClient = new FakePrometheusClient({'0': 1024});
    const repo = new RepoBuilder().prometheusClient(prometheusClient).build();
    const bytesTransferred = await repo.getOutboundByteTransfer('doesnotexist', 10);
    expect(bytesTransferred).toEqual(0);
    done();
  });
});

function countAccessKeys(repo: AccessKeyRepository) {
  return repo.listAccessKeys().length;
}

class RepoBuilder {
  private port_ = 12345;
  private keyConfig_ = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
  private shadowsocksServer_ = new FakeShadowsocksServer();
  private prometheusClient_ = new FakePrometheusClient({});

  public port(port: number): RepoBuilder {
    this.port_ = port;
    return this;
  }
  public keyConfig(keyConfig: InMemoryConfig<AccessKeyConfigJson>): RepoBuilder {
    this.keyConfig_ = keyConfig;
    return this;
  }
  public shadowsocksServer(shadowsocksServer: FakeShadowsocksServer): RepoBuilder {
    this.shadowsocksServer_ = shadowsocksServer;
    return this;
  }
  public prometheusClient(prometheusClient: FakePrometheusClient): RepoBuilder {
    this.prometheusClient_ = prometheusClient;
    return this;
  }

  public build(): ServerAccessKeyRepository {
    return new ServerAccessKeyRepository(
        this.port_, 'hostname', this.keyConfig_, this.shadowsocksServer_, this.prometheusClient_);
  }
}
