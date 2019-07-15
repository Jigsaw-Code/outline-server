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
import {AccessKeyRepository} from '../model/access_key';

import {FakePrometheusClient, FakeShadowsocksServer, FakeUsageMetrics} from './mocks/mocks';
import {AccessKeyConfigJson, AccessKeyUsageMetrics, ServerAccessKeyRepository} from './server_access_key';
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
    expect(accessKey.quota).toBeUndefined();
    expect(accessKey.isOverQuota).toBeFalsy();
    expect(accessKey.isOverQuota).toBeFalsy();
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
    const quota = {quotaBytes: 5000, windowHours: 24};
    expect(await repo.setAccessKeyQuota(accessKey.id, quota)).toBeTruthy();
    const accessKeys = repo.listAccessKeys();
    expect(accessKeys[0].quota).toEqual(quota);
    done();
  });

  it('setAccessKeyQuota returns false for missing keys', async (done) => {
    const repo = createRepo();
    await repo.createNewAccessKey();
    const quota = {quotaBytes: 1000, windowHours: 24};
    expect(await repo.setAccessKeyQuota('doesnotexist', quota)).toBeFalsy();
    done();
  });

  it('setAccessKeyQuota fails with disallowed quota values', async (done) => {
    const repo = createRepo();
    const accessKey = await repo.createNewAccessKey();
    // Negative values
    const negativeBytesQuota = {quotaBytes: -1000, windowHours: 24};
    expect(await repo.setAccessKeyQuota(accessKey.id, negativeBytesQuota)).toBeFalsy();
    const negativeWindowQuota = {quotaBytes: 1000, windowHours: -24};
    expect(await repo.setAccessKeyQuota(accessKey.id, negativeWindowQuota)).toBeFalsy();
    // Undefined quota
    expect(await repo.setAccessKeyQuota(accessKey.id, undefined)).toBeFalsy();
    done();
  });

  it('setAccessKeyQuota updates keys quota status', async (done) => {
    const server = new FakeShadowsocksServer();
    const metrics = new FakeUsageMetrics({'0': {1: 500, 2: 800}, '1': {1: 200}});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server, metrics);
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();

    await repo.setAccessKeyQuota(accessKey1.id, {quotaBytes: 200, windowHours: 1});
    let accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeTruthy();
    expect(accessKeys[1].isOverQuota).toBeFalsy();
    let serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey2.id);
    // The over-quota access key should be re-enabled after increasing its quota, while the
    // under-quota key should be disabled after setting its quota.
    await repo.setAccessKeyQuota(accessKey1.id, {quotaBytes: 1000, windowHours: 2});
    await repo.setAccessKeyQuota(accessKey2.id, {quotaBytes: 100, windowHours: 1});
    accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeFalsy();
    expect(accessKeys[1].isOverQuota).toBeTruthy();
    serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    done();
  });

  it('can remove access key quotas', async (done) => {
    const repo = createRepo();
    const accessKey = await repo.createNewAccessKey();
    await expect(repo.setAccessKeyQuota(accessKey.id, {quotaBytes: 100, windowHours: 24}))
        .toBeTruthy();
    expect(repo.listAccessKeys()[0].quota).toBeDefined();
    expect(repo.removeAccessKeyQuota(accessKey.id)).toBeTruthy();
    expect(repo.listAccessKeys()[0].quota).toBeUndefined();
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
    const metrics = new FakeUsageMetrics({'0': {1: 500}, '1': {1: 100}});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server, metrics);
    const accessKey = await repo.createNewAccessKey();
    await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey.id, {quotaBytes: 100, windowHours: 1});
    expect(server.getAccessKeys().length).toEqual(1);

    // Remove the quota; expect the key to be under quota and enabled.
    expect(repo.removeAccessKeyQuota(accessKey.id)).toBeTruthy();
    expect(server.getAccessKeys().length).toEqual(2);
    const accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeFalsy();
    expect(accessKeys[1].isOverQuota).toBeFalsy();
    done();
  });

  it('enforceAccessKeyQuotas updates keys quota status ', async (done) => {
    const metrics = new FakeUsageMetrics({'0': {1: 500}, '1': {1: 100}});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}),
        new FakeShadowsocksServer(), metrics);
    const accessKey1 = await repo.createNewAccessKey();
    await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey1.id, {quotaBytes: 200, windowHours: 1});

    await repo.enforceAccessKeyQuotas();
    let accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeTruthy();
    expect(accessKeys[1].isOverQuota).toBeFalsy();

    metrics.usage = {'0': {1: 100}, '1': {1: 100}};
    await repo.enforceAccessKeyQuotas();
    accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeFalsy();
    expect(accessKeys[1].isOverQuota).toBeFalsy();
    done();
  });

  it('enforceAccessKeyQuotas enables and disables keys', async (done) => {
    const server = new FakeShadowsocksServer();
    const metrics = new FakeUsageMetrics({'0': {1: 500}, '1': {1: 100}});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server, metrics);
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey1.id, {quotaBytes: 200, windowHours: 1});

    await repo.enforceAccessKeyQuotas();
    const accessKeys = await repo.listAccessKeys();
    let serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey2.id);

    metrics.usage = {'0': {1: 100}, '1': {1: 100}};
    await repo.enforceAccessKeyQuotas();
    serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(2);
    done();
  });

  it('Repos created with an existing file restore access keys', async (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const repo1 = new ServerAccessKeyRepository(
        new PortProvider(), 'hostname', config, new FakeShadowsocksServer(),
        new FakeUsageMetrics({}));
    // Create 2 new access keys
    await Promise.all([repo1.createNewAccessKey(), repo1.createNewAccessKey()]);
    // Modify properties
    await repo1.setAccessKeyQuota('0', {quotaBytes: 100, windowHours: 12});
    repo1.renameAccessKey('1', 'name');

    // Create a 2nd repo from the same config file. This simulates what
    // might happen after the shadowbox server is restarted.
    const repo2 = new ServerAccessKeyRepository(
        new PortProvider(), 'hostname', config, new FakeShadowsocksServer(),
        new FakeUsageMetrics({}));
    // Check that repo1 and repo2 have the same access keys
    expect(repo1.listAccessKeys()).toEqual(repo2.listAccessKeys());
    done();
  });

  it('Does not re-use ids when using the same config file', (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    // Create a repo with 1 access key, then delete that access key.
    const repo1 = new ServerAccessKeyRepository(
        new PortProvider(), '', config, new FakeShadowsocksServer(), new FakeUsageMetrics({}));
    repo1.createNewAccessKey().then((accessKey1) => {
      repo1.removeAccessKey(accessKey1.id);

      // Create a 2nd repo with one access key, and verify that
      // it hasn't reused the first access key's ID.
      const repo2 = new ServerAccessKeyRepository(
          new PortProvider(), '', config, new FakeShadowsocksServer(), new FakeUsageMetrics({}));
      repo2.createNewAccessKey().then((accessKey2) => {
        expect(accessKey1.id).not.toEqual(accessKey2.id);
        done();
      });
    });
  });

  it('start exposes the access keys to the server', async (done) => {
    const config = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '', config, new FakeShadowsocksServer(), new FakeUsageMetrics({}));
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    // Create a new repository with the same configuration. The keys should not be exposed to the
    // server until `start` is called.
    const server = new FakeShadowsocksServer();
    const repo2 = new ServerAccessKeyRepository(
        new PortProvider(), '', config, server, new FakeUsageMetrics({}));
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
    const metrics = new FakeUsageMetrics({'0': {1: 500}, '1': {1: 300}, '2': {5: 1000}});
    const repo = new ServerAccessKeyRepository(
        new PortProvider(), '',
        new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0}), server, metrics);
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    const accessKey3 = await repo.createNewAccessKey();
    await repo.setAccessKeyQuota(accessKey1.id, {quotaBytes: 300, windowHours: 1});
    await repo.setAccessKeyQuota(accessKey2.id, {quotaBytes: 100, windowHours: 1});
    const clock = new ManualClock();

    await repo.start(clock);
    await clock.runCallbacks();
    let accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeTruthy();
    expect(accessKeys[1].isOverQuota).toBeTruthy();
    expect(accessKeys[2].isOverQuota).toBeFalsy();
    let serverAccessKeys = await server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey3.id);

    metrics.usage = {'0': {1: 100}, '1': {1: 300}, '2': {5: 1000}};  // Simulate a change in usage.
    await clock.runCallbacks();
    accessKeys = await repo.listAccessKeys();
    expect(accessKeys[0].isOverQuota).toBeFalsy();
    expect(accessKeys[1].isOverQuota).toBeTruthy();
    expect(accessKeys[2].isOverQuota).toBeFalsy();
    serverAccessKeys = await server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(2);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    expect(serverAccessKeys[1].id).toEqual(accessKey3.id);
    done();
  });
});

describe('AccessKeyUsageMetrics', () => {
  it('getOutboundByteTransfer', async (done) => {
    const usageMetrics = new AccessKeyUsageMetrics(new FakePrometheusClient({'access-key': 1024}));
    const bytesTransferred = await usageMetrics.getOutboundByteTransfer('access-key', 10);
    expect(bytesTransferred).toEqual(1024);
    done();
  });

  it('getOutboundByteTransfer returns zero when ID is missing', async (done) => {
    const usageMetrics = new AccessKeyUsageMetrics(new FakePrometheusClient({'access-key': 1024}));
    const bytesTransferred = await usageMetrics.getOutboundByteTransfer('doesnotexist', 10);
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
      new FakeUsageMetrics({}));
}
