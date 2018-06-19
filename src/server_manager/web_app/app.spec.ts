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

import * as digitalocean_api from '../cloud/digitalocean_api';
import * as server from '../model/server';

import {App} from './app';
import {TokenManager} from './digitalocean_oauth';

const TOKEN_WITH_NO_SERVERS = 'no-server-token';
const TOKEN_WITH_ONE_SERVER = 'one-server-token';

// Define Electron's global  functions used by App. See server_manager/electron_app/preload.ts
// tslint:disable-next-line:no-any
const GLOBAL = global as any;
GLOBAL.onElectronEvent = (event: string, listener: () => void) => {};
GLOBAL.sendElectronEvent = (event: string) => {};

describe('App', () => {
  it('Shows intro when starting with no manual servers or DigitalOcean token', (done) => {
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(
        polymerAppRoot, new InMemoryDigitalOceanTokenManager());
    app.start().then(() => {
      expect(polymerAppRoot.currentScreen).toEqual(AppRootScreen.INTRO);
      done();
    });
  });

  it('Shows region picker when no servers exist but a DigitalOcean token is available', (done) => {
    const polymerAppRoot = new FakePolymerAppRoot();
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_NO_SERVERS;
    const app = createTestApp(polymerAppRoot, tokenManager);
    app.start().then(() => {
      expect(polymerAppRoot.currentScreen).toEqual(AppRootScreen.REGION_PICKER);
      done();
    });
  });

  it('Will not create a manual server with invalid input', (done) => {
    // Create a new app with no existing servers or DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(polymerAppRoot, new InMemoryDigitalOceanTokenManager());
    app.start().then(() => {
      app.createManualServer('bad input').catch(done);
    });
  });

  it('Creates a manual server with valid input', (done) => {
    // Create a new app with no existing servers or DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const app = createTestApp(polymerAppRoot, new InMemoryDigitalOceanTokenManager());
    app.start().then(() => {
      app.createManualServer(JSON.stringify({certSha256: 'cert', apiUrl: 'url'})).then(() => {
        expect(polymerAppRoot.currentScreen).toEqual(AppRootScreen.SERVER_VIEW);
        done();
      });
    });
  });

  it('App initially shows already created manual servers', (done) => {
    // Create a fake manual server before creating the app.
    const manualServerRepo = new FakeManualServerRepository();
    const serverConfig = {certSha256: 'cert', apiUrl: 'url'};
    manualServerRepo.addServer(serverConfig).then((manualServer) => {
      const polymerAppRoot = new FakePolymerAppRoot();
      const app =
          createTestApp(polymerAppRoot, new InMemoryDigitalOceanTokenManager(), manualServerRepo);
      app.start().then(() => {
        expect(polymerAppRoot.currentScreen).toEqual(AppRootScreen.SERVER_VIEW);
        expect(polymerAppRoot.serverView.serverId).toEqual(manualServer.getServerId());
        done();
      });
    });
  });

  it('Shows progress screen once DigitalOcean droplets are created', (done) => {
    // Start the app with a fake DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_NO_SERVERS;
    const app = createTestApp(polymerAppRoot, tokenManager);
    app.start().then(() => {
      app.createDigitalOceanServer('fake2').then(() => {
        expect(polymerAppRoot.currentScreen).toEqual(AppRootScreen.INSTALL_PROGRESS);
        done();
      });
    });
  });

  it('Shows progress screen when starting with DigitalOcean servers still being created', (done) => {
    // Start the app with a fake DigitalOcean token.
    const polymerAppRoot = new FakePolymerAppRoot();
    const tokenManager = new InMemoryDigitalOceanTokenManager();
    tokenManager.token = TOKEN_WITH_ONE_SERVER;
    const app = createTestApp(polymerAppRoot, tokenManager);
    app.start().then(() => {
      // Servers should initially show the progress screen, until their
      // "waitOnInstall" promise fulfills.  For DigitalOcean, server objects
      // are returned by the repository as soon as the droplet exists with the
      // "shadowbox" tag, however shadowbox installation may not yet be complete.
      // This is needed in case the user restarts the manager after the droplet
      // is created but before shadowbox installation finishes.
      expect(polymerAppRoot.currentScreen).toEqual(AppRootScreen.INSTALL_PROGRESS);
      done();
    });
  });
});

function createTestApp(
    polymerAppRoot: FakePolymerAppRoot, digitalOceanTokenManager: InMemoryDigitalOceanTokenManager,
    manualServerRepo?: server.ManualServerRepository) {
  const WEB_APP_URL = 'outline://fakefakefake/';
  const VERSION = '0.0.1';
  const fakeDigitalOceanSessionFactory = (accessToken: string) => {
    return new FakeDigitalOceanSession(accessToken);
  };
  const fakeDigitalOceanServerRepositoryFactory = (session: digitalocean_api.DigitalOceanSession) => {
    const repo = new FakeManagedServerRepository();
    if (session.accessToken === TOKEN_WITH_ONE_SERVER) {
      repo.createServer();  // OK to ignore promise as the fake implementation is synchronous.
    }
    return repo;
  };
  if (!manualServerRepo) {
    manualServerRepo = new FakeManualServerRepository();
  }
  return new App(
      polymerAppRoot, WEB_APP_URL, VERSION, fakeDigitalOceanSessionFactory,
      fakeDigitalOceanServerRepositoryFactory, manualServerRepo, digitalOceanTokenManager);
}

enum AppRootScreen {
  NONE = 0,
  INTRO,
  REGION_PICKER,
  SERVER_VIEW,
  INSTALL_PROGRESS
}

// TODO: define the AppRoot type.  Currently app.ts just defines the Polymer
// type as HTMLElement&any.
class FakePolymerAppRoot {
  currentScreen = AppRootScreen.NONE;
  serverView = {setServerTransferredData: () => {}, serverId: ''};

  getAndShowServerCreator() {
    return {
      showIntro: () => {
        this.currentScreen = AppRootScreen.INTRO;
      },
      getAndShowRegionPicker: () => {
        this.currentScreen = AppRootScreen.REGION_PICKER;
        return {};
      },
      showProgress: () => {
        this.currentScreen = AppRootScreen.INSTALL_PROGRESS;
      }
    };
  }

  getAndShowServerView() {
    this.currentScreen = AppRootScreen.SERVER_VIEW;
    return this.serverView;
  }

  // Methods like setAttribute, addEventListener, and others are currently
  // no-ops, since we are not yet testing this functionality.
  // These don't return Promise.reject(..) as that would print error trace,
  // and throwing an exception would result in breakage.
  setAttribute() {}
  addEventListener() {}
}

class FakeServer implements server.Server {
  private name = 'serverName';
  private metricsEnabled = false;
  private id: string;
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
  getManagementPort() {
    return 8080;
  }
}

class FakeManualServer extends FakeServer implements server.ManualServer {
  forget() {
    return Promise.reject(new Error('FakeManualServer.forget not implemented'));
  }
}

class FakeManualServerRepository implements server.ManualServerRepository {
  private servers: server.ManualServer[] = [];

  addServer(config: server.ManualServerConfig) {
    const newServer = new FakeManualServer();
    this.servers.push(newServer);
    return Promise.resolve(newServer);
  }

  listServers() {
    return Promise.resolve(this.servers);
  }
}

class InMemoryDigitalOceanTokenManager implements TokenManager {
  public token: string;
  extractTokenFromUrl(): string {
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
    return Promise.resolve({email: 'fake', uuid: 'fake', email_verified: false, status: 'fake'});
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
  getDropletTags = (dropletId: number) => Promise.reject(new Error('getDropletTags not implemented'));
  getDroplets = () => Promise.reject(new Error('getDroplets not implemented'));
}

class FakeManagedServer extends FakeServer implements server.ManagedServer {
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
    };
  }
  isInstallCompleted() {
    return false;
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
}
