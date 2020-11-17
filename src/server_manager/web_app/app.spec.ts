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
import * as digitalocean_api from './digitalocean_app/digitalocean_api';
import {Account, DigitalOceanSession, DropletInfo, RegionInfo} from './digitalocean_app/digitalocean_api';
import * as server from '../model/server';
import {AccessKey, DataUsageByAccessKey, ManagedServer, ManagedServerHost} from '../model/server';

import {App} from './app';
import {DisplayServer, DisplayServerRepository} from './display_server';
import {AppRoot} from './ui_components/app-root.js';
import {ServerView} from './ui_components/outline-server-view.js';
import {CloudProviderId} from "../model/cloud";
import {AccountId, DigitalOceanAccount} from "../model/account";
import {DigitalOceanLocation, DigitalOceanStatus} from "./digitalocean_app/digitalocean_account";
import {InMemoryStorage} from '../infrastructure/memory_storage';
import {Surveys} from '../model/survey';
import {EventEmitter} from 'eventemitter3';
import {ShadowboxSettings} from "./shadowbox_server";
import {
  ACCOUNT_MANAGER_KEY_COMPARATOR,
  ACCOUNT_MANAGER_KEY_EXTRACTOR,
  AccountManager,
  PersistedAccount
} from "../model/account_manager";
import {LocalStorageRepository} from "../infrastructure/repository";

// Define functions from preload.ts.

// tslint:disable-next-line:no-any
(global as any).onUpdateDownloaded = () => {};
// tslint:disable-next-line:no-any
(global as any).bringToFront = () => {};

describe('App', () => {});

function createTestApp(
    polymerAppRoot: FakePolymerAppRoot,
    manualServerRepo: server.ManualServerRepository = new FakeManualServerRepository(),
    displayServerRepository: FakeDisplayServerRepository = new FakeDisplayServerRepository()) {
  const shadowboxSettings: ShadowboxSettings = {
    containerImageId: 'quay.io/outline/shadowbox:nightly',
    metricsUrl: null,
    sentryApiUrl: null,
    debug: true,
  };
  const storageRepository = new LocalStorageRepository<PersistedAccount, AccountId>(
      'accounts', new InMemoryStorage(), ACCOUNT_MANAGER_KEY_EXTRACTOR,
      ACCOUNT_MANAGER_KEY_COMPARATOR);
  return new App(
      polymerAppRoot, '0.0.1', new EventEmitter(), shadowboxSettings,
      manualServerRepo, displayServerRepository, new AccountManager(storageRepository));
}

enum AppRootScreen {
  NONE = 0,
  INTRO,
  DIGITAL_OCEAN_CREATE_SERVER_APP,
  SERVER_VIEW,
  INSTALL_PROGRESS,
  DIALOG
}

class FakePolymerAppRoot extends AppRoot {
  events = new EventEmitter();
  backgroundScreen = AppRootScreen.NONE;
  currentScreen = AppRootScreen.NONE;
  serverView = {
    setServerTransferredData: () => {},
    serverId: '',
    initHelpBubbles: () => {}} as unknown as ServerView;
  serverList: DisplayServer[] = [];
  is: 'fake-polymer-app-root';

  private setScreen(screenId: AppRootScreen) {
    this.currentScreen = screenId;
    this.events.emit('screen-change', screenId);
  }

  showIntro() {
    this.setScreen(AppRootScreen.INTRO);
  }

  getAndShowDigitalOceanCreateServerApp() {
    this.setScreen(AppRootScreen.DIGITAL_OCEAN_CREATE_SERVER_APP);
    return {};
  }

  showProgress() {
    this.setScreen(AppRootScreen.INSTALL_PROGRESS);
  }

  showModalDialog() {
    this.backgroundScreen = this.currentScreen;
    this.setScreen(AppRootScreen.DIALOG);
    const promise = new Promise<number>(() => 0);
    // Suppress Promise not handled warning.
    promise.then(v => v);
    return promise;
  }

  closeModalDialog() {
    if (this.currentScreen !== AppRootScreen.DIALOG) {
      return;
    }
    this.setScreen(this.backgroundScreen);
    this.backgroundScreen = AppRootScreen.NONE;
  }

  getServerView(serverId: string): ServerView {
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
  private readonly id: string;
  private name = 'serverName';
  private metricsEnabled = false;
  protected apiUrl: string;

  constructor() {
    this.id = Math.random().toString();
  }

  getServerId(): string {
    return this.id;
  }

  getName(): string {
    return this.name;
  }

  setName(name: string): Promise<void> {
    this.name = name;
    return Promise.resolve();
  }

  getVersion(): string {
    return '1.2.3';
  }

  listAccessKeys(): Promise<AccessKey[]> {
    return Promise.resolve([]);
  }

  getDataUsage(): Promise<DataUsageByAccessKey> {
    return Promise.resolve({bytesTransferredByUserId: {}});
  }

  addAccessKey(): Promise<AccessKey> {
    return Promise.reject(new Error('FakeServer.addAccessKey not implemented'));
  }

  renameAccessKey(accessKeyId: server.AccessKeyId, name: string): Promise<void> {
    return Promise.reject(new Error('FakeServer.renameAccessKey not implemented'));
  }

  removeAccessKey(accessKeyId: server.AccessKeyId): Promise<void> {
    return Promise.reject(new Error('FakeServer.removeAccessKey not implemented'));
  }

  getAccessKeyDataLimit(): server.DataLimit|undefined {
    return undefined;
  }

  setAccessKeyDataLimit(limit: server.DataLimit): Promise<void> {
    return Promise.reject(new Error('FakeServer.setAccessKeyDataLimit not implemented'));
  }

  removeAccessKeyDataLimit(): Promise<void> {
    return Promise.resolve();
  }

  getMetricsEnabled(): boolean {
    return this.metricsEnabled;
  }

  setMetricsEnabled(metricsEnabled: boolean): Promise<void> {
    this.metricsEnabled = metricsEnabled;
    return Promise.resolve();
  }

  isHealthy(): Promise<boolean> {
    return Promise.resolve(true);
  }

  getCreatedDate(): Date {
    return new Date();
  }

  getHostnameForAccessKeys(): string {
    return 'fake-server';
  }

  setHostnameForAccessKeys(hostname: string): Promise<void> {
    return Promise.reject(new Error('FakeServer.setHostname not implemented'));
  }

  getManagementApiUrl(): string {
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
    this.apiUrl = this.manualServerConfig.apiUrl;
  }

  getCertificateFingerprint(): string {
    return this.manualServerConfig.certSha256;
  }

  forget(): void {
    throw new Error('FakeManualServer.forget not implemented');
  }
}

class FakeDigitalOceanApiClient implements DigitalOceanSession {
  constructor(public accessToken: string) {}

  // Return fake account data.
  getAccount(): Promise<Account> {
    return Promise.resolve({
      email: 'fake@email.com',
      uuid: 'fake',
      email_verified: true,
      status: 'active'
    });
  }

  // Other methods do not yet need implementations for tests to pass.
  createDroplet(
      displayName: string, region: string, publicKeyForSSH: string,
      dropletSpec: digitalocean_api.DigitalOceanDropletSpecification): Promise<{droplet: DropletInfo}> {
    return Promise.reject(new Error('createDroplet not implemented'));
  }

  deleteDroplet(dropletId: number): Promise<void> {
    return Promise.reject(new Error('deleteDroplet not implemented'));
  }

  // Return an empty list of regions by default.
  getRegionInfo(): Promise<RegionInfo[]> {
    return Promise.resolve([]);
  }

  getDroplet(dropletId: number): Promise<DropletInfo> {
    return Promise.reject(new Error('getDroplet not implemented'));
  }

  getDropletTags(dropletId: number): Promise<string[]> {
    return   Promise.reject(new Error('getDropletTags not implemented'));
  }

  // Return an empty list of droplets by default.
  getDropletsByTag(tag: string): Promise<DropletInfo[]> {
    return Promise.resolve([]);
  }

  getDroplets(): Promise<DropletInfo[]> {
    return Promise.reject(new Error('getDroplets not implemented'));
  }
}

class FakeDigitalOceanServer extends FakeServer implements ManagedServer {
  constructor(private isInstalled = true) {
    super();
  }

  waitOnInstall(resetTimeout: boolean) {
    // Return a promise which does not yet fulfill, to simulate long
    // shadowbox install time.
    return new Promise<void>((fulfill, reject) => {});
  }

  getHost(): ManagedServerHost {
    return {
      getId: () => 'fake-host-id',
      getCloudProviderId: () => CloudProviderId.DigitalOcean,
      getLocationId: () => 'nyc1',
      getMonthlyOutboundTransferLimit: () => ({terabytes: 1}),
      getMonthlyCost: () => ({usd: 5}),
      delete: () => Promise.resolve(),
    };
  }

  isInstallCompleted(): boolean {
    return this.isInstalled;
  }
}

class FakeDigitalOceanAccount implements DigitalOceanAccount {
  private servers: ManagedServer[] = [];

  getId(): AccountId {
    return {
      cloudSpecificId: '',
      cloudProviderId: CloudProviderId.DigitalOcean,
    };
  }

  getDisplayName(): Promise<string> {
    return Promise.resolve('Test DigitalOcean account');
  }

  getCredentials(): object {
    return 'oauth-token' as unknown as object;
  }

  disconnect(): void {
    // no-op
  }

  getStatus(): Promise<DigitalOceanStatus> {
    return Promise.resolve(DigitalOceanStatus.ACTIVE);
  }

  listLocations(): Promise<DigitalOceanLocation[]> {
    return Promise.resolve([{
      regionId: 'nyc',
      dataCenterIds: ['nyc1'],
    }]);
  }

  createServer(): Promise<ManagedServer> {
    const newServer = new FakeDigitalOceanServer();
    this.servers.push(newServer);
    return Promise.resolve(newServer);
  }

  listServers(fetchFromHost: boolean): Promise<ManagedServer[]> {
    return Promise.resolve(this.servers);
  }

  registerAccountConnectionIssueListener(fn: () => void): void {
    // no-op
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

class FakeDisplayServerRepository extends DisplayServerRepository {
  constructor() {
    super(new InMemoryStorage());
  }
}

class FakeSurveys implements Surveys {
  async presentDataLimitsEnabledSurvey() {}
  async presentDataLimitsDisabledSurvey() {}
}
