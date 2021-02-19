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

import './ui_components/app-root.js';

import * as server from '../model/server';
import * as digitalocean from "../model/digitalocean";

import {App, LAST_DISPLAYED_SERVER_STORAGE_KEY} from './app';
import {AppRoot} from './ui_components/app-root';
import {CloudAccounts} from "./cloud_accounts";
import {InMemoryStorage} from "../infrastructure/memory_storage";

// Define functions from preload.ts.
// tslint:disable-next-line:no-any
(global as any).onUpdateDownloaded = () => {};
// tslint:disable-next-line:no-any
(global as any).bringToFront = () => {};

// Inject app-root element into DOM once before each test.
beforeEach(() => {
  document.body.innerHTML = "<app-root id='appRoot' language='en'></app-root>";
});

describe('App', () => {
  it('shows intro when starting with no manual servers or DigitalOcean token', async () => {
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot);
    await app.start();
    expect(appRoot.currentPage).toEqual('intro');
  });

  it('will not create a manual server with invalid input', async () => {
    // Create a new app with no existing servers or DigitalOcean token.
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot);
    await app.start();
    expect(appRoot.currentPage).toEqual('intro');
    await expectAsync(app.createManualServer('bad input')).toBeRejectedWithError();
  });

  it('creates a manual server with valid input', async () => {
    // Create a new app with no existing servers or DigitalOcean token.
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot);
    await app.start();
    expect(appRoot.currentPage).toEqual('intro');
    await app.createManualServer(JSON.stringify({certSha256: 'cert', apiUrl: 'url'}));
    expect(appRoot.currentPage).toEqual('serverView');
  });

  it('initially shows servers', async () => {
    // Create fake servers and simulate their metadata being cached before creating the app.
    const fakeAccount = new FakeDigitalOceanAccount();
    await fakeAccount.createServer('fake-managed-server-id');
    const cloudAccounts = makeCloudAccountsWithDoAccount(fakeAccount);

    const manualServerRepo = new FakeManualServerRepository();
    await manualServerRepo.addServer({certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-1'});
    await manualServerRepo.addServer({certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});

    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    expect(appRoot.serverList.length).toEqual(0);
    const app = createTestApp(appRoot, cloudAccounts, manualServerRepo);

    await app.start();
    // Validate that server metadata is shown.
    const managedServers = await fakeAccount.listServers();
    expect(managedServers.length).toEqual(1);
    const manualServers = await manualServerRepo.listServers();
    expect(manualServers.length).toEqual(2);
    appRoot.getServerView('');
    const serverList = appRoot.serverList;

    console.log(`managedServers.length: ${managedServers.length}`);
    console.log(`manualServers.length: ${manualServers.length}`);

    expect(serverList.length).toEqual(manualServers.length + managedServers.length);
    expect(serverList).toContain(jasmine.objectContaining({id: 'fake-manual-server-api-url-1'}));
    expect(serverList).toContain(jasmine.objectContaining({id: 'fake-manual-server-api-url-2'}));
    expect(serverList).toContain(jasmine.objectContaining({id: 'fake-managed-server-id'}));
  });

  it('initially shows the last selected server', async () => {
    const LAST_DISPLAYED_SERVER_ID = 'fake-manual-server-api-url-1';
    const manualServerRepo = new FakeManualServerRepository();
    const lastDisplayedServer =
        await manualServerRepo.addServer({certSha256: 'cert', apiUrl: LAST_DISPLAYED_SERVER_ID});
    await manualServerRepo.addServer({certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});
    localStorage.setItem('lastDisplayedServer', LAST_DISPLAYED_SERVER_ID);
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot, null, manualServerRepo);
    await app.start();
    expect(appRoot.currentPage).toEqual('serverView');
    expect(appRoot.selectedServerId).toEqual(lastDisplayedServer.getManagementApiUrl());
  });

  it('shows progress screen once DigitalOcean droplets are created', async () => {
    // Start the app with a fake DigitalOcean token.
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const cloudAccounts = makeCloudAccountsWithDoAccount(new FakeDigitalOceanAccount());
    const app = createTestApp(appRoot, cloudAccounts);
    await app.start();
    await app.createDigitalOceanServer('fakeRegion');
    expect(appRoot.currentPage).toEqual('serverView');
    expect(appRoot.getServerView(appRoot.selectedServerId).selectedPage).toEqual('progressView');
  });

  it('shows progress screen when starting with DigitalOcean servers still being created',
     async () => {
       const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
       const fakeAccount = new FakeDigitalOceanAccount();
       const server = await fakeAccount.createServer(Math.random().toString());
       const cloudAccounts = makeCloudAccountsWithDoAccount(fakeAccount);
       const app = createTestApp(appRoot, cloudAccounts, null);
       // Sets last displayed server.
       localStorage.setItem(LAST_DISPLAYED_SERVER_STORAGE_KEY, server.getId());
       await app.start();
       expect(appRoot.currentPage).toEqual('serverView');
       expect(appRoot.getServerView(appRoot.selectedServerId).selectedPage).toEqual('progressView');
     });
});

function makeCloudAccountsWithDoAccount(fakeAccount: FakeDigitalOceanAccount) {
  const fakeDigitalOceanAccountFactory = (token: string) => fakeAccount;
  const cloudAccounts = new CloudAccounts(fakeDigitalOceanAccountFactory, new InMemoryStorage());
  cloudAccounts.connectDigitalOceanAccount('fake-access-token');
  return cloudAccounts;
}

function createTestApp(
    appRoot: AppRoot, cloudAccounts?: CloudAccounts,
    manualServerRepo?: server.ManualServerRepository) {
  const VERSION = '0.0.1';
  if (!cloudAccounts) {
    cloudAccounts = new CloudAccounts((token: string) => new FakeDigitalOceanAccount(), new InMemoryStorage());
  }
  if (!manualServerRepo) {
    manualServerRepo = new FakeManualServerRepository();
  }
  return new App(appRoot, VERSION, manualServerRepo, cloudAccounts);
}

class FakeServer implements server.Server {
  private name = 'serverName';
  private metricsId: string;
  private metricsEnabled = false;
  apiUrl: string;
  constructor(protected id: string) {
    this.metricsId = Math.random().toString();
  }
  getId() {
    return this.id;
  }
  getName() {
    return this.name;
  }
  setName(name: string) {
    this.name = name;
    return Promise.resolve();
  }
  getVersion() {
    return '1.2.3';
  }
  listAccessKeys() {
    return Promise.resolve([]);
  }
  getMetricsEnabled() {
    return this.metricsEnabled;
  }
  setMetricsEnabled(metricsEnabled: boolean) {
    this.metricsEnabled = metricsEnabled;
    return Promise.resolve();
  }
  getMetricsId() {
    return this.metricsId;
  }
  isHealthy() {
    return Promise.resolve(true);
  }
  getCreatedDate() {
    return new Date();
  }
  getDataUsage() {
    return Promise.resolve(new Map<server.AccessKeyId, number>());
  }
  addAccessKey() {
    return Promise.reject(new Error('FakeServer.addAccessKey not implemented'));
  }
  renameAccessKey(accessKeyId: server.AccessKeyId, name: string) {
    return Promise.reject(new Error('FakeServer.renameAccessKey not implemented'));
  }
  removeAccessKey(accessKeyId: server.AccessKeyId) {
    return Promise.reject(new Error('FakeServer.removeAccessKey not implemented'));
  }
  setHostnameForAccessKeys(hostname: string) {
    return Promise.reject(new Error('FakeServer.setHostname not implemented'));
  }
  getHostnameForAccessKeys() {
    return 'fake-server';
  }
  getManagementApiUrl() {
    return this.apiUrl || Math.random().toString();
  }
  getPortForNewAccessKeys(): number|undefined {
    return undefined;
  }
  setPortForNewAccessKeys(): Promise<void> {
    return Promise.reject(new Error('FakeServer.setPortForNewAccessKeys not implemented'));
  }
  setAccessKeyDataLimit(limit: server.DataLimit): Promise<void> {
    return Promise.reject(new Error('FakeServer.setAccessKeyDataLimit not implemented'));
  }
  removeAccessKeyDataLimit(): Promise<void> {
    return Promise.resolve();
  }
  getAccessKeyDataLimit(): server.DataLimit|undefined {
    return undefined;
  }
}

class FakeManualServer extends FakeServer implements server.ManualServer {
  constructor(public manualServerConfig: server.ManualServerConfig) {
    super(manualServerConfig.apiUrl);
  }
  getManagementApiUrl() {
    return this.manualServerConfig.apiUrl;
  }
  forget() {
    return Promise.reject(new Error('FakeManualServer.forget not implemented'));
  }
  getCertificateFingerprint() {
    return this.manualServerConfig.certSha256;
  }
}

class FakeManualServerRepository implements server.ManualServerRepository {
  private servers: server.ManualServer[] = [];

  addServer(config: server.ManualServerConfig) {
    const newServer = new FakeManualServer(config);
    this.servers.push(newServer);
    return Promise.resolve(newServer);
  }

  findServer(config: server.ManualServerConfig) {
    return this.servers.find(server => server.getManagementApiUrl() === config.apiUrl);
  }

  listServers() {
    return Promise.resolve(this.servers);
  }
}

class FakeManagedServer extends FakeServer implements server.ManagedServer {
  constructor(id: string, private isInstalled = true) {
    super(id);
  }
  waitOnInstall() {
    // Return a promise which does not yet fulfill, to simulate long
    // shadowbox install time.
    return new Promise<void>((fulfill, reject) => {});
  }
  getHost() {
    return {
      getMonthlyOutboundTransferLimit: () => ({terabytes: 1}),
      getMonthlyCost: () => ({usd: 5}),
      getRegionId: () => 'fake-region',
      delete: () => Promise.resolve(),
      getHostId: () => 'fake-host-id',
    };
  }
  isInstallCompleted() {
    return this.isInstalled;
  }
}

class FakeDigitalOceanAccount implements digitalocean.Account {
  private servers: server.ManagedServer[] = [];
  async getName(): Promise<string> {
    return 'name';
  }
  async getStatus(): Promise<digitalocean.Status> {
    return digitalocean.Status.ACTIVE;
  }
  listServers() {
    return Promise.resolve(this.servers);
  }
  getRegionMap() {
    return Promise.resolve({'fake': ['fake1', 'fake2']});
  }
  createServer(id = Math.random().toString()) {
    const newServer = new FakeManagedServer(id, false);
    this.servers.push(newServer);
    return Promise.resolve(newServer);
  }
}
