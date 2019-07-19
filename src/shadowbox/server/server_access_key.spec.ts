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
import {AccessKeyQuota, AccessKeyRepository} from '../model/access_key';

import {FakePrometheusClient, FakeShadowsocksServer} from './mocks/mocks';
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

  it('Creates access keys without quota and under quota', async (done) => {
    const repo = createRepo();
    const accessKey = await repo.createNewAccessKey();
    expect(accessKey.quotaUsage).toBeUndefined();
    expect(accessKey.isOverQuota()).toBeFalsy();
    done();
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
      // List keys again and expect to see the NEW_NAME.
      const accessKeys = repo.listAccessKeys();
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
      // List keys again and expect to NOT see the NEW_NAME.
      const accessKeys = repo.listAccessKeys();
      expect(accessKeys[0].name).not.toEqual(NEW_NAME);
      done();
    });
  });

  it('Can set access key quota', async (done) => {
    const repo = createRepo();
    const accessKey = await repo.createNewAccessKey();
    const quota = {data: {bytes: 5000}, window: {hours: 24}};
    expect(await repo.setAccessKeyQuota(accessKey.id, quota)).toBeTruthy();
    const accessKeys = repo.listAccessKeys();
    expect(accessKeys[0].quotaUsage.quota).toEqual(quota);
    expect(accessKeys[0].quotaUsage.usage.bytes).toEqual(0);
    done();
  });

  it('setAccessKeyQuota returns false for missing keys', async (done) => {
    const repo = createRepo();
    await repo.createNewAccessKey();
    const quota = {data: {bytes: 1000}, window: {hours: 24}};
    expect(await repo.setAccessKeyQuota('doesnotexist', quota)).toBeFalsy();
    done();
  });

  it('setAccessKeyQuota fails with disallowed quota values', async (done) => {
    const repo = createRepo();
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
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server,
        prometheusClient);
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
    const repo = createRepo();
    const accessKey = await repo.createNewAccessKey();
    await expect(repo.setAccessKeyQuota(accessKey.id, {data: {bytes: 100}, window: {hours: 24}}))
        .toBeTruthy();
    expect(repo.listAccessKeys()[0].quotaUsage).toBeDefined();
    expect(repo.removeAccessKeyQuota(accessKey.id)).toBeTruthy();
    expect(repo.listAccessKeys()[0].quotaUsage).toBeUndefined();
    done();
  });

  it('removeAccessKeyQuota returns false for missing keys', async (done) => {
    const repo = createRepo();
    await repo.createNewAccessKey();
    expect(await repo.removeAccessKeyQuota('doesnotexist')).toBeFalsy();
    done();
  });

  it('removeAccessKeyQuota restores over-quota access keys when removing quota ', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 100});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server,
        prometheusClient);
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
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}),
        new FakeShadowsocksServer(), prometheusClient);
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
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server,
        prometheusClient);
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
    const repo1 = new ServerAccessKeyRepository(
        new PortProvider(), 'hostname', config, new FakeShadowsocksServer(),
        new FakePrometheusClient({}));
    // Create 2 new access keys
    await Promise.all([repo1.createNewAccessKey(), repo1.createNewAccessKey()]);
    // Modify properties
    await repo1.setAccessKeyQuota('0', {data: {bytes: 100}, window: {hours: 12}});
    repo1.renameAccessKey('1', 'name');

    // Create a 2nd repo from the same config file. This simulates what
    // might happen after the shadowbox server is restarted.
    const repo2 = new ServerAccessKeyRepository(
        new PortProvider(), 'hostname', config, new FakeShadowsocksServer(),
        new FakePrometheusClient({}));
    // Check that repo1 and repo2 have the same access keys
    expect(repo1.listAccessKeys()).toEqual(repo2.listAccessKeys());
    done();
  });

  it('Does not re-use ids when using the same config file', (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    // Create a repo with 1 access key, then delete that access key.
    const repo1 = new ServerAccessKeyRepository(
        new PortProvider(), '', config, new FakeShadowsocksServer(), new FakePrometheusClient({}));
    repo1.createNewAccessKey().then((accessKey1) => {
      repo1.removeAccessKey(accessKey1.id);

      // Create a 2nd repo with one access key, and verify that
      // it hasn't reused the first access key's ID.
      const repo2 = new ServerAccessKeyRepository(
          new PortProvider(), '', config, new FakeShadowsocksServer(),
          new FakePrometheusClient({}));
      repo2.createNewAccessKey().then((accessKey2) => {
        expect(accessKey1.id).not.toEqual(accessKey2.id);
        done();
      });
    });
  });

  it('start exposes the access keys to the server', async (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '', config, new FakeShadowsocksServer(), new FakePrometheusClient({}));
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    // Create a new repository with the same configuration. The keys should not be exposed to the
    // server until `start` is called.
    const server = new FakeShadowsocksServer();
    const repo2 = new ServerAccessKeyRepository(
        new PortProvider(), '', config, server, new FakePrometheusClient({}));
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
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server,
        prometheusClient);
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
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}),
        new FakeShadowsocksServer(), prometheusClient);
    const bytesTransferred = await repo.getOutboundByteTransfer('0', 10);
    expect(bytesTransferred).toEqual(1024);
    done();
  });

  it('getOutboundByteTransfer returns zero when ID is missing', async (done) => {
    const prometheusClient = new FakePrometheusClient({'0': 1024});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}),
        new FakeShadowsocksServer(), prometheusClient);
    const bytesTransferred = await repo.getOutboundByteTransfer('doesnotexist', 10);
    expect(bytesTransferred).toEqual(0);
    done();
  });
});

function countAccessKeys(repo: AccessKeyRepository) {
  return repo.listAccessKeys().length;
}

function createRepo(): ServerAccessKeyRepository {
  const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
  return new ServerAccessKeyRepository(
      new PortProvider(), 'hostname', config, new FakeShadowsocksServer(),
      new FakePrometheusClient({}));
}
