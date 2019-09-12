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
import {AccessKeyRepository, DataUsage} from '../model/access_key';
import * as errors from '../model/errors';
import {DataUsageTimeframe} from '../model/metrics';

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

  it('Creates access keys without limit and under limit', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    expect(accessKey.dataLimit).toBeUndefined();
    expect(accessKey.isOverDataLimit()).toBeFalsy();
    done();
  });

  it('Can remove access keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      expect(countAccessKeys(repo)).toEqual(1);
      expect(repo.removeAccessKey.bind(repo, accessKey.id)).not.toThrow();
      expect(countAccessKeys(repo)).toEqual(0);
      done();
    });
  });

  it('removeAccessKey throws for missing keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      expect(countAccessKeys(repo)).toEqual(1);
      expect(repo.removeAccessKey.bind(repo, 'badId')).toThrowError(errors.AccessKeyNotFound);
      expect(countAccessKeys(repo)).toEqual(1);
      done();
    });
  });

  it('Can rename access keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      const NEW_NAME = 'newName';
      expect(repo.renameAccessKey.bind(repo, accessKey.id, NEW_NAME)).not.toThrow();
      // List keys again and expect to see the NEW_NAME.
      const accessKeys = repo.listAccessKeys();
      expect(accessKeys[0].name).toEqual(NEW_NAME);
      done();
    });
  });

  it('renameAccessKey throws for missing keys', (done) => {
    const repo = new RepoBuilder().build();
    repo.createNewAccessKey().then((accessKey) => {
      const NEW_NAME = 'newName';
      expect(repo.renameAccessKey.bind(repo, 'badId', NEW_NAME))
          .toThrowError(errors.AccessKeyNotFound);
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
    await expectAsyncThrow(repo.setPortForNewAccessKeys.bind(repo, 0), errors.InvalidPortNumber);
    await expectAsyncThrow(repo.setPortForNewAccessKeys.bind(repo, -1), errors.InvalidPortNumber);
    await expectAsyncThrow(
        repo.setPortForNewAccessKeys.bind(repo, 100.1), errors.InvalidPortNumber);
    await expectAsyncThrow(
        repo.setPortForNewAccessKeys.bind(repo, 65536), errors.InvalidPortNumber);
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

    await expectNoAsyncThrow(portProvider.reserveNewPort.bind(portProvider));
    // simulate the first key's connection on its port
    const server = new net.Server();
    server.listen(oldPort, async () => {
      await expectNoAsyncThrow(repo.setPortForNewAccessKeys.bind(repo, oldPort));
      server.close();
      done();
    });
  });

  it('Can set access key data limit', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    const limit = {bytes: 5000};
    await expectNoAsyncThrow(repo.setAccessKeyDataLimit.bind(repo, accessKey.id, limit));
    expect(accessKey.dataLimit).toEqual(limit);
    expect(accessKey.dataUsage.bytes).toEqual(0);
    done();
  });

  it('setAccessKeyDataLimit throws for missing keys', async (done) => {
    const repo = new RepoBuilder().build();
    await repo.createNewAccessKey();
    const limit = {bytes: 1000};
    await expectAsyncThrow(
        repo.setAccessKeyDataLimit.bind(repo, 'doesnotexist', limit), errors.AccessKeyNotFound);
    done();
  });

  it('setAccessKeyDataLimit fails with disallowed limit values', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    // Negative values
    const negativeBytesLimit = {bytes: -1000};
    await expectAsyncThrow(
        repo.setAccessKeyDataLimit.bind(repo, accessKey.id, negativeBytesLimit),
        errors.InvalidAccessKeyDataLimit);
    // Missing properties
    const missingDataLimit = {} as DataUsage;
    await expectAsyncThrow(
        repo.setAccessKeyDataLimit.bind(repo, accessKey.id, missingDataLimit),
        errors.InvalidAccessKeyDataLimit);
    // Undefined limit
    await expectAsyncThrow(
        repo.setAccessKeyDataLimit.bind(repo, accessKey.id, undefined),
        errors.InvalidAccessKeyDataLimit);
    done();
  });

  it('setAccessKeyDataLimit updates keys limit status', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 200});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    await repo.start(new ManualClock());

    await repo.setAccessKeyDataLimit(accessKey1.id, {bytes: 200});
    expect(accessKey1.isOverDataLimit()).toBeTruthy();
    expect(accessKey2.isOverDataLimit()).toBeFalsy();
    // We determine which access keys have been enabled/disabled by accessing them from
    // the server's perspective, ensuring `server.update` has been called.
    let serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey2.id);
    // The over-limit access key should be re-enabled after increasing its limit, while the
    // under-limit key should be disabled after setting its limit.
    prometheusClient.bytesTransferredById = {'0': 800, '1': 199};
    await repo.setAccessKeyDataLimit(accessKey1.id, {bytes: 1000});
    await repo.setAccessKeyDataLimit(accessKey2.id, {bytes: 100});
    expect(accessKey1.isOverDataLimit()).toBeFalsy();
    expect(accessKey2.isOverDataLimit()).toBeTruthy();
    serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    done();
  });

  it('can remove access key limits', async (done) => {
    const repo = new RepoBuilder().build();
    const accessKey = await repo.createNewAccessKey();
    const limit = {bytes: 100};
    await repo.setAccessKeyDataLimit(accessKey.id, limit);
    expect(accessKey.dataLimit).toBeDefined();
    await expectNoAsyncThrow(repo.removeAccessKeyDataLimit.bind(repo, accessKey.id));
    expect(accessKey.dataLimit).toBeUndefined();
    done();
  });

  it('removeAccessKeyDataLimit throws for missing keys', async (done) => {
    const repo = new RepoBuilder().build();
    await repo.createNewAccessKey();
    await expectAsyncThrow(
        repo.removeAccessKeyDataLimit.bind(repo, 'doesnotexist'), errors.AccessKeyNotFound);
    done();
  });

  it('removeAccessKeyDataLimit restores over-limit access keys', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 100});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();

    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    await repo.start(new ManualClock());
    await repo.setAccessKeyDataLimit(accessKey1.id, {bytes: 100});
    expect(server.getAccessKeys().length).toEqual(1);

    // Remove the limit; expect the key to be under limit and enabled.
    await expectNoAsyncThrow(repo.removeAccessKeyDataLimit.bind(repo, accessKey1.id));
    expect(server.getAccessKeys().length).toEqual(2);
    expect(accessKey1.isOverDataLimit()).toBeFalsy();
    expect(accessKey2.isOverDataLimit()).toBeFalsy();
    expect(accessKey1.dataLimit).toBeUndefined();
    expect(accessKey2.dataLimit).toBeUndefined();
    done();
  });

  it('enforceAccessKeyDataLimits updates keys limit status', async (done) => {
    const NUM_ACCESS_KEYS = 20;
    const bytesTransferredById = {};
    for (let i = 0; i < NUM_ACCESS_KEYS; ++i) {
      bytesTransferredById[`${i}`] = i * 1000;
    }
    const prometheusClient = new FakePrometheusClient(bytesTransferredById);
    const repo = new RepoBuilder().prometheusClient(prometheusClient).build();
    for (let i = 0; i < NUM_ACCESS_KEYS; ++i) {
      const key = await repo.createNewAccessKey();
      if (i % 2 !== 0) {
        // Set a limit on half of the keys.
        await repo.setAccessKeyDataLimit(key.id, {bytes: i * 100});
      }
    }
    await repo.enforceAccessKeyDataLimits();
    for (const key of repo.listAccessKeys()) {
      const hasDataLimit = !!key.dataLimit;
      // Keys with data limits should be over the limit; keys without a limit shouldn't.
      expect(key.isOverDataLimit()).toEqual(hasDataLimit);
      if (hasDataLimit) {
        expect(key.dataUsage.bytes).toEqual(bytesTransferredById[key.id]);
      }
    }
    // Simulate a change in usage.
    for (let i = 0; i < NUM_ACCESS_KEYS; ++i) {
      bytesTransferredById[`${i}`] = i;
    }
    prometheusClient.bytesTransferredById = bytesTransferredById;

    await repo.enforceAccessKeyDataLimits();
    for (const key of repo.listAccessKeys()) {
      // All keys should be under the data limit.
      expect(key.isOverDataLimit()).toBeFalsy();
      expect(key.dataUsage.bytes).toEqual(bytesTransferredById[key.id]);
    }
    done();
  });

  it('enforceAccessKeyDataLimits enables and disables keys', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 100});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();

    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    await repo.setAccessKeyDataLimit(accessKey1.id, {bytes: 200});

    await repo.enforceAccessKeyDataLimits();
    const accessKeys = await repo.listAccessKeys();
    let serverAccessKeys = server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey2.id);

    prometheusClient.bytesTransferredById = {'0': 100, '1': 100};
    await repo.enforceAccessKeyDataLimits();
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
    await repo1.setAccessKeyDataLimit('0', {bytes: 100});
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

  it('start periodically enforces access key data limits', async (done) => {
    const server = new FakeShadowsocksServer();
    const prometheusClient = new FakePrometheusClient({'0': 500, '1': 300, '2': 400});
    const repo =
        new RepoBuilder().prometheusClient(prometheusClient).shadowsocksServer(server).build();
    const accessKey1 = await repo.createNewAccessKey();
    const accessKey2 = await repo.createNewAccessKey();
    const accessKey3 = await repo.createNewAccessKey();
    await repo.setAccessKeyDataLimit(accessKey1.id, {bytes: 300});
    await repo.setAccessKeyDataLimit(accessKey2.id, {bytes: 100});
    const clock = new ManualClock();

    await repo.start(clock);
    await clock.runCallbacks();
    expect(accessKey1.isOverDataLimit()).toBeTruthy();
    expect(accessKey2.isOverDataLimit()).toBeTruthy();
    expect(accessKey3.isOverDataLimit()).toBeFalsy();
    expect(accessKey1.dataUsage.bytes).toEqual(500);
    expect(accessKey2.dataUsage.bytes).toEqual(300);
    expect(accessKey3.dataLimit).toBeUndefined();
    let serverAccessKeys = await server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(1);
    expect(serverAccessKeys[0].id).toEqual(accessKey3.id);
    // Simulate a change in usage.
    prometheusClient.bytesTransferredById = {'0': 100, '1': 300, '2': 1000};
    await clock.runCallbacks();
    expect(accessKey1.isOverDataLimit()).toBeFalsy();
    expect(accessKey2.isOverDataLimit()).toBeTruthy();
    expect(accessKey3.isOverDataLimit()).toBeFalsy();
    expect(accessKey1.dataUsage.bytes).toEqual(100);
    expect(accessKey2.dataUsage.bytes).toEqual(300);
    expect(accessKey3.dataLimit).toBeUndefined();
    serverAccessKeys = await server.getAccessKeys();
    expect(serverAccessKeys.length).toEqual(2);
    expect(serverAccessKeys[0].id).toEqual(accessKey1.id);
    expect(serverAccessKeys[1].id).toEqual(accessKey3.id);
    done();
  });

  it('getDataUsageTimeframe returns the data limit timeframe', async (done) => {
    const timeframe = {hours: 12345};
    const repo = new RepoBuilder().dataUsageTimeframe(timeframe).build();
    expect(repo.getDataUsageTimeframe()).toEqual(timeframe);
    done();
  });

  it('setDataUsageTimeframe sets the data limit timeframe', async (done) => {
    const repo = new RepoBuilder().build();
    const timeframe = {hours: 12345};
    await repo.setDataUsageTimeframe(timeframe);
    expect(repo.getDataUsageTimeframe()).toEqual(timeframe);
    done();
  });
});

// Convenience function to expect that an asynchronous function does not throw an error. Note that
// jasmine.toThrowError lacks asynchronous support and could lead to false positives.
async function expectNoAsyncThrow(fn: Function) {
  try {
    await fn();
  } catch (e) {
    fail(`Unexpected error thrown: ${e}`);
  }
}

// Convenience function to expect that an asynchronous function throws an error. Fails if the thrown
// error does not match `errorType`, when defined.
// tslint:disable-next-line:no-any
async function expectAsyncThrow(fn: Function, errorType?: new (...args: any[]) => Error) {
  try {
    await fn();
    fail(`Expected error to be thrown`);
  } catch (e) {
    if (!!errorType && !(e instanceof errorType)) {
      fail(`Thrown error is not of type ${errorType.name}. Got ${e.name}`);
    }
  }
}

function countAccessKeys(repo: AccessKeyRepository) {
  return repo.listAccessKeys().length;
}

class RepoBuilder {
  private port_ = 12345;
  private keyConfig_ = new InMemoryConfig<AccessKeyConfigJson>({accessKeys: [], nextId: 0});
  private shadowsocksServer_ = new FakeShadowsocksServer();
  private prometheusClient_ = new FakePrometheusClient({});
  private dataUsageTimeframe_ = {hours: 30 * 24};

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
  public dataUsageTimeframe(dataUsageTimeframe: DataUsageTimeframe) {
    this.dataUsageTimeframe_ = dataUsageTimeframe;
    return this;
  }

  public build(): ServerAccessKeyRepository {
    return new ServerAccessKeyRepository(
        this.port_, 'hostname', this.keyConfig_, this.shadowsocksServer_, this.prometheusClient_,
        this.dataUsageTimeframe_);
  }
}
