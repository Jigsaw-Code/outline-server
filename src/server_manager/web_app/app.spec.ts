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

import {InMemoryStorage} from '../infrastructure/memory_storage';
import {sleep} from '../infrastructure/sleep';
import * as server from '../model/server';

import {App} from './app';
import {DisplayServerRepository, makeDisplayServer} from './display_server';
import {AppRoot} from './ui_components/app-root.js';
import {CloudProviderId, SupportedClouds} from "../model/cloud";
import {EventEmitter} from "eventemitter3";
import {
  FAKE_SHADOWBOX_SETTINGS,
  FakeDigitalOceanAccount,
  FakeDisplayServerRepository,
  FakeManualServerRepository
} from "../model/test_helpers";
import {DigitalOceanCloud} from "./digitalocean_app/model/cloud";

const TOKEN_WITH_NO_SERVERS = 'no-server-token';
const TOKEN_WITH_ONE_SERVER = 'one-server-token';

// Define functions from preload.ts.

// tslint:disable-next-line:no-any
(global as any).onUpdateDownloaded = () => {};
// tslint:disable-next-line:no-any
(global as any).bringToFront = () => {};

// Inject app-root element into DOM once before the test suite runs.
beforeAll(async () => {
  // It seems like AppRoot class is not fully loaded/initialized until the
  // constructor, so we invoke it directly.
  const loadAppRoot = new AppRoot();

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
    await sleep(2000);  // TODO: refactor test to remove
    expect(appRoot.currentPage).toEqual('serverView');
  });

  xit('initially shows and stores server display metadata', async (done) => {
    // Create fake servers and simulate their metadata being cached before creating the app.

    // const digitalOceanStorage = new KeyValueStorage<PersistedAccount, string>('testing/accounts/digitalocean', localStorage, (entry: PersistedAccount) => entry.id);
    // const digitalOceanCloud = new DigitalOceanCloud(new EventEmitter(), FAKE_SHADOWBOX_SETTINGS, digitalOceanStorage);
    // const digitalOceanAccount = digitalOceanCloud.connectAccount('testing', 'credentials');
    const digitalOceanAccount = new FakeDigitalOceanAccount();
    const managedServer = await digitalOceanAccount.createServer('', '');
    const managedDisplayServer = await makeDisplayServer(managedServer);

    const manualServerRepo = new FakeManualServerRepository();
    const manualServer1 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-1'});
    const manualServer2 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});
    const manualDisplayServer1 = await makeDisplayServer(manualServer1);
    const manualDisplayServer2 = await makeDisplayServer(manualServer2);

    const displayServerRepo = new DisplayServerRepository(new InMemoryStorage());
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot, manualServerRepo, displayServerRepo);

    await app.start();
    // Validate that server metadata is shown.
    const managedServers = await digitalOceanAccount.listServers();
    const manualServers = await manualServerRepo.listServers();
    const serverList = appRoot.serverList;
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

  xit('initially shows stored server display metadata', async (done) => {
    // Create fake servers without caching their display metadata.
    // const tokenManager = new InMemoryDigitalOceanTokenManager();
    // tokenManager.token = TOKEN_WITH_NO_SERVERS;
    // const managedServerRepo = new FakeManagedServerRepository();
    // const managedServer = await managedServerRepo.createServer();
    // managedServer.apiUrl = 'fake-managed-server-api-url';
    // const managedDisplayServer = await makeDisplayServer(managedServer);
    const manualServerRepo = new FakeManualServerRepository();
    const manualServer1 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-1'});
    const manualServer2 = await manualServerRepo.addServer(
        {certSha256: 'cert', apiUrl: 'fake-manual-server-api-url-2'});
    const manualDisplayServer1 = await makeDisplayServer(manualServer1);
    const manualDisplayServer2 = await makeDisplayServer(manualServer2);
    const store = new Map([[
      DisplayServerRepository.SERVERS_STORAGE_KEY,
      JSON.stringify([manualDisplayServer1, manualDisplayServer2])
    ]]);
    const displayServerRepo = new DisplayServerRepository(new InMemoryStorage(store));
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot, manualServerRepo, displayServerRepo);

    await app.start();
    // const managedServers = await managedServerRepo.listServers();
    const manualServers = await manualServerRepo.listServers();
    const serverList = appRoot.serverList;
    expect(serverList.length).toEqual(manualServers.length);
    expect(serverList).toContain(manualDisplayServer1);
    expect(serverList).toContain(manualDisplayServer2);
    // expect(serverList).toContain(managedDisplayServer);
    done();
  });

  xit('initially shows the last selected server', async () => {
    // const tokenManager = new InMemoryDigitalOceanTokenManager();
    // tokenManager.token = TOKEN_WITH_ONE_SERVER;

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

    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot, manualServerRepo, displayServerRepo);
    await app.start();
    await sleep(2000);  // TODO: refactor test to remove
    expect(appRoot.currentPage).toEqual('serverView');
    expect(appRoot.selectedServer.id).toEqual(lastDisplayedServer.getManagementApiUrl());
  });

  xit('shows progress screen once DigitalOcean droplets are created', async () => {
    // Start the app with a fake DigitalOcean token.
    const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
    const app = createTestApp(appRoot);
    await app.start();
    await app.createDigitalOceanServer('fakeRegion');
    expect(appRoot.currentPage).toEqual('serverProgressStep');
  });

  xit('shows progress screen when starting with DigitalOcean servers still being created',
     async () => {
       // const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
       // const tokenManager = new InMemoryDigitalOceanTokenManager();
       // tokenManager.token = TOKEN_WITH_NO_SERVERS;
       // const managedSeverRepository = new FakeManagedServerRepository();
       // // Manually create the server since the DO repository server factory function is synchronous.
       // await managedSeverRepository.createUninstalledServer();
       // const app = createTestApp(appRoot, tokenManager, null, null, managedSeverRepository);
       // await app.start();
       // expect(appRoot.currentPage).toEqual('serverProgressStep');
     });
});

function createTestApp(
    appRoot: AppRoot,
    manualServerRepo?: server.ManualServerRepository,
    displayServerRepository?: FakeDisplayServerRepository) {
  if (!manualServerRepo) {
    manualServerRepo = new FakeManualServerRepository();
  }
  if (!displayServerRepository) {
    displayServerRepository = new FakeDisplayServerRepository();
  }
  const supportedClouds = new SupportedClouds(new EventEmitter(), FAKE_SHADOWBOX_SETTINGS, 'testing/accounts/digitalocean');
  const digitalOceanCloud = supportedClouds.get(CloudProviderId.DigitalOcean) as DigitalOceanCloud;
  digitalOceanCloud.connectAccount('testing', 'credentials');
  return new App(appRoot, '0.0.1', supportedClouds, manualServerRepo, displayServerRepository);
}
