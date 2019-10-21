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

import * as events from 'events';

import * as digitalocean_api from '../cloud/digitalocean_api';
import * as server from '../model/server';

import {App} from './app';
import {TokenManager} from './digitalocean_oauth';
import {DisplayServer, DisplayServerRepository, makeDisplayServer} from './display_server';

const TOKEN_WITH_NO_SERVERS = 'no-server-token';
const TOKEN_WITH_ONE_SERVER = 'one-server-token';

// Define functions from preload.ts.

// tslint:disable-next-line:no-any
(global as any).onUpdateDownloaded = () => {};
// tslint:disable-next-line:no-any
(global as any).bringToFront = () => {};

describe('App', () => {
  it('shows intro when starting with no manual servers or DigitalOcean token', (done) => {
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(polymerAppRoot, new InMemoryDigitalOceanTokenManager());
    polymerAppRoot.events.once('screen-change', (currentScreen) => {
      expect(currentScreen).toEqual(AppRootScreen.INTRO);
      done();
    });
    app.start();
  });

  it('will not create a manual server with invalid input', (done) => {
    // Create a new app with no existing servers or DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(polymerAppRoot, new InMemoryDigitalOceanTokenManager());
    polymerAppRoot.events.once('screen-change', (currentScreen) => {
      expect(currentScreen).toEqual(AppRootScreen.INTRO);
      app.createManualServer('bad input').catch(done);
    });
    app.start();
  });

  it('creates a manual server with valid input', async (done) => {
    // Create a new app with no existing servers or DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(polymerAppRoot, new InMemoryDigitalOceanTokenManager());
    polymerAppRoot.events.once('screen-change', (currentScreen) => {
      expect(currentScreen).toEqual(AppRootScreen.INTRO);
      polymerAppRoot.events.once('screen-change', (currentScreen) => {
        expect(currentScreen).toEqual(AppRootScreen.SERVER_VIEW);
        done();
      });
    });
    await app.start();
    await app.createManualServer(JSON.stringify({certSha256: 'cert', apiUrl: 'url'}));
  });

  it('initially shows and stores server display metadata', async (done) => {
    // Create fake servers and simulate their metadata being cached before creating the app.
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_NO_SERVERS;
    const managedServerRepo = new FakeManagedServerRepository();
    const managedServer = await managedServerRepo.createServer();
    managedServer.apiUrl = 'fake-managed-server-api-url';
    const managedDisplayServer = await makeDisplayServer(managedServer);
    const manualServerRepo = new FakeManualServerRepository();
    const manualServer1 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-1'});
    const manualServer2 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});
    const manualDisplayServer1 = await makeDisplayServer(manualServer1);
    const manualDisplayServer2 = await makeDisplayServer(manualServer2);

    const displayServerRepo = new DisplayServerRepository(new InMemoryStorage());
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(
        polymerAppRoot, tokenManager, manualServerRepo, displayServerRepo, managedServerRepo);

    await app.start();
    // Validate that server metadata is shown.
    const managedServers = await managedServerRepo.listServers();
    const manualServers = await manualServerRepo.listServers();
    const serverList = polymerAppRoot.serverList;
    expect(serverList.length).toEqual(manualServers.length + managedServers.length);
    expect(serverList).toContain(manualDisplayServer1);
    expect(serverList).toContain(manualDisplayServer2);
    expect(serverList).toContain(managedDisplayServer);

    // Validate that display servers are stored.
    const displayServers = await displayServerRepo.listServers();
    for (const displayServer of displayServers) {
      expect(serverList).toContain(displayServer);
    }
    done();
  });

  it('initially shows stored server display metadata', async (done) => {
    // Create fake servers without caching their display metadata.
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_NO_SERVERS;
    const managedServerRepo = new FakeManagedServerRepository();
    const managedServer = await managedServerRepo.createServer();
    managedServer.apiUrl = 'fake-managed-server-api-url';
    const managedDisplayServer = await makeDisplayServer(managedServer);
    const manualServerRepo = new FakeManualServerRepository();
    const manualServer1 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-1'});
    const manualServer2 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});
    const manualDisplayServer1 = await makeDisplayServer(manualServer1);
    const manualDisplayServer2 = await makeDisplayServer(manualServer2);
    const store = new Map([[
      DisplayServerRepository.SERVERS_STORAGE_KEY,
      JSON.stringify([manualDisplayServer1, manualDisplayServer2, managedDisplayServer])
    ]]);
    const displayServerRepo = new DisplayServerRepository(new InMemoryStorage(store));
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(
        polymerAppRoot, tokenManager, manualServerRepo, displayServerRepo, managedServerRepo);

    await app.start();
    const managedServers = await managedServerRepo.listServers();
    const manualServers = await manualServerRepo.listServers();
    const serverList = polymerAppRoot.serverList;
    expect(serverList.length).toEqual(manualServers.length + managedServers.length);
    expect(serverList).toContain(manualDisplayServer1);
    expect(serverList).toContain(manualDisplayServer2);
    expect(serverList).toContain(managedDisplayServer);
    done();
  });

  it('initially shows the last selected server', async (done) => {
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_ONE_SERVER;

    const LAST_DISPLAYED_SERVER_ID = 'fake-manual-server-api-url-1';
    const manualServerRepo = new FakeManualServerRepository();
    const lastDisplayedServer =
        await manualServerRepo.addServer({certSha256: 'cert', apiUrl: LAST_DISPLAYED_SERVER_ID});
    const manualServer = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});
    const manualDisplayServer1 = await makeDisplayServer(lastDisplayedServer);
    const manualDisplayServer2 = await makeDisplayServer(manualServer);
    const store = new Map([[
      DisplayServerRepository.SERVERS_STORAGE_KEY,
      JSON.stringify([manualDisplayServer1, manualDisplayServer2])
    ]]);
    const displayServerRepo = new DisplayServerRepository(new InMemoryStorage(store));
    displayServerRepo.storeLastDisplayedServerId(LAST_DISPLAYED_SERVER_ID);

    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(polymerAppRoot, tokenManager, manualServerRepo, displayServerRepo);
    polymerAppRoot.events.once('screen-change', (currentScreen) => {
      expect(currentScreen).toEqual(AppRootScreen.INTRO);
      polymerAppRoot.events.once('screen-change', (currentScreen) => {
        expect(currentScreen).toEqual(AppRootScreen.SERVER_VIEW);
        expect(polymerAppRoot.serverView.serverId).toEqual(lastDisplayedServer.getServerId());
        done();
      });
    });
    await app.start();
  });

  it('shows progress screen once DigitalOcean droplets are created', async (done) => {
    // Start the app with a fake DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_NO_SERVERS;
    const app = createTestApp(polymerAppRoot, tokenManager);
    polymerAppRoot.events.once('screen-change', (currentScreen) => {
      expect(currentScreen).toEqual(AppRootScreen.INTRO);
      polymerAppRoot.events.once('screen-change', (currentScreen) => {
        expect(currentScreen).toEqual(AppRootScreen.INSTALL_PROGRESS);
        done();
      });
    });
    await app.start();
    app.createDigitalOceanServer('fakeRegion');
  });

  it('shows progress screen when starting with DigitalOcean servers still being created',
     async (done) => {
       const polymerAppRoot = new FakePolymerAppRoot();
       const tokenManager = new InMemoryDigitalOceanTokenManager();
       tokenManager.token = TOKEN_WITH_NO_SERVERS;
       const managedSeverRepository = new FakeManagedServerRepository();
       // Manually create the server since the DO repository server factory function is synchronous.
       await managedSeverRepository.createUninstalledServer();
       const app = createTestApp(polymerAppRoot, tokenManager, null, null, managedSeverRepository);
       polymerAppRoot.events.once('screen-change', (currentScreen) => {
         expect(currentScreen).toEqual(AppRootScreen.INTRO);
         polymerAppRoot.events.once('screen-change', (currentScreen) => {
           // Servers should initially show the progress screen, until their
           // "waitOnInstall" promise fulfills.  For DigitalOcean, server objects
           // are returned by the repository as soon as the droplet exists with the
           // "shadowbox" tag, however shadowbox installation may not yet be complete.
           // This is needed in case the user restarts the manager after the droplet
           // is created but before shadowbox installation finishes.
           expect(currentScreen).toEqual(AppRootScreen.INSTALL_PROGRESS);
           done();
         });
       });
       await app.start();
     });
});

function createTestApp(
    polymerAppRoot: FakePolymerAppRoot, digitalOceanTokenManager: InMemoryDigitalOceanTokenManager,
    manualServerRepo?: server.ManualServerRepository,
    displayServerRepository?: FakeDisplayServerRepository,
    managedServerRepository?: FakeManagedServerRepository) {
  const VERSION = '0.0.1';
  const fakeDigitalOceanSessionFactory = (accessToken: string) => {
    return new FakeDigitalOceanSession(accessToken);
  };
  const fakeDigitalOceanServerRepositoryFactory =
      (session: digitalocean_api.DigitalOceanSession) => {
        const repo = managedServerRepository || new FakeManagedServerRepository();
        if (session.accessToken === TOKEN_WITH_ONE_SERVER) {
          repo.createServer();  // OK to ignore promise as the fake implementation is synchronous.
        }
        return repo;
      };
  if (!manualServerRepo) {
    manualServerRepo = new FakeManualServerRepository();
  }
  if (!displayServerRepository) {
    displayServerRepository = new FakeDisplayServerRepository();
  }
  return new App(
      polymerAppRoot, VERSION, fakeDigitalOceanSessionFactory,
      fakeDigitalOceanServerRepositoryFactory, manualServerRepo, displayServerRepository,
      digitalOceanTokenManager);
}

enum AppRootScreen {
  NONE = 0,
  INTRO,
  REGION_PICKER,
  SERVER_VIEW,
  INSTALL_PROGRESS,
  DIALOG
}

// TODO: define the AppRoot type.  Currently app.ts just defines the Polymer
// type as HTMLElement&any.
class FakePolymerAppRoot {
  events = new events.EventEmitter();
  backgroundScreen = AppRootScreen.NONE;
  currentScreen = AppRootScreen.NONE;
  serverView = {setServerTransferredData: () => {}, serverId: '', initHelpBubbles: () => {}};
  serverList: DisplayServer[] = [];

  private setScreen(screenId: AppRootScreen) {
    this.currentScreen = screenId;
    this.events.emit('screen-change', screenId);
  }

  showIntro() {
    this.setScreen(AppRootScreen.INTRO);
  }

  getAndShowRegionPicker() {
    this.setScreen(AppRootScreen.REGION_PICKER);
    return {};
  }

  getDigitalOceanOauthFlow() {
    return {};
  }

  showProgress() {
    this.setScreen(AppRootScreen.INSTALL_PROGRESS);
  }

  showModalDialog() {
    this.backgroundScreen = this.currentScreen;
    this.setScreen(AppRootScreen.DIALOG);
    const promise = new Promise(() => {});
    // Supress Promise not handled warning.
    promise.then(() => {});
    return promise;
  }

  closeModalDialog() {
    if (this.currentScreen !== AppRootScreen.DIALOG) {
      return;
    }
    this.setScreen(this.backgroundScreen);
    this.backgroundScreen = AppRootScreen.NONE;
  }

  getServerView() {
    return this.serverView;
  }

  showServerView() {
    this.setScreen(AppRootScreen.SERVER_VIEW);
  }

  // Methods like setAttribute, addEventListener, and others are currently
  // no-ops, since we are not yet testing this functionality.
  // These don't return Promise.reject(..) as that would print error trace,
  // and throwing an exception would result in breakage.
  setAttribute() {}
  addEventListener() {}
  localize() {}
}

class FakeServer implements server.Server {
  private name = 'serverName';
  private metricsEnabled = false;
  private id: string;
  apiUrl: string;
  constructor() {
    this.id = Math.random().toString();
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
  getServerId() {
    return this.id;
  }
  isHealthy() {
    return Promise.resolve(true);
  }
  getCreatedDate() {
    return new Date();
  }
  getDataUsage() {
    return Promise.resolve({bytesTransferredByUserId: {}});
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
  getHostname() {
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
}

class FakeManualServer extends FakeServer implements server.ManualServer {
  constructor(public manualServerConfig: server.ManualServerConfig) {
    super();
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

class InMemoryDigitalOceanTokenManager implements TokenManager {
  public token: string;
  getStoredToken(): string {
    return this.token;
  }
  removeTokenFromStorage() {
    this.token = null;
  }
  writeTokenToStorage(token: string) {
    this.token = token;
  }
}

class FakeDigitalOceanSession implements digitalocean_api.DigitalOceanSession {
  constructor(public accessToken: string) {}

  // Return fake account data.
  getAccount() {
    return Promise.resolve(
        {email: 'fake@email.com', uuid: 'fake', email_verified: true, status: 'active'});
  }

  // Return an empty list of droplets by default.
  getDropletsByTag = (tag: string) => Promise.resolve([]);

  // Return an empty list of regions by default.
  getRegionInfo = () => Promise.resolve([]);

  // Other methods do not yet need implementations for tests to pass.
  createDroplet =
      (displayName: string, region: string, publicKeyForSSH: string,
       dropletSpec: digitalocean_api.DigitalOceanDropletSpecification) =>
          Promise.reject(new Error('createDroplet not implemented'));
  deleteDroplet = (dropletId: number) => Promise.reject(new Error('deleteDroplet not implemented'));
  getDroplet = (dropletId: number) => Promise.reject(new Error('getDroplet not implemented'));
  getDropletTags = (dropletId: number) =>
      Promise.reject(new Error('getDropletTags not implemented'));
  getDroplets = () => Promise.reject(new Error('getDroplets not implemented'));
}

class FakeManagedServer extends FakeServer implements server.ManagedServer {
  constructor(private isInstalled = true) {
    super();
  }
  waitOnInstall(resetTimeout: boolean) {
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

class FakeManagedServerRepository implements server.ManagedServerRepository {
  private servers: server.ManagedServer[] = [];
  listServers() {
    return Promise.resolve(this.servers);
  }
  getRegionMap() {
    return Promise.resolve({'fake': ['fake1', 'fake2']});
  }
  createServer() {
    const newServer = new FakeManagedServer();
    this.servers.push(newServer);
    return Promise.resolve(newServer);
  }

  createUninstalledServer() {
    const newServer = new FakeManagedServer(false);
    this.servers.push(newServer);
    return Promise.resolve(newServer);
  }
}

class FakeDisplayServerRepository extends DisplayServerRepository {
  constructor() {
    super(new InMemoryStorage());
  }
}

export class InMemoryStorage implements Storage {
  readonly length: number;
  [key: string]: {};
  [index: number]: string;

  constructor(private store: Map<string, string> = new Map<string, string>()) {}

  clear(): void {
    throw new Error('InMemoryStorage.clear not implemented');
  }

  getItem(key: string): string|null {
    return this.store.get(key) || null;
  }

  key(index: number): string|null {
    throw new Error('InMemoryStorage.key not implemented');
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, data: string): void {
    this.store.set(key, data);
  }
}
