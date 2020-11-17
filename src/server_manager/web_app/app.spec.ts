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

class FakeSurveys implements Surveys {
  async presentDataLimitsEnabledSurvey() {}
  async presentDataLimitsDisabledSurvey() {}
}
