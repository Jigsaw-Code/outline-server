// Copyright 2020 The Outline Authors
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

import '@polymer/polymer/polymer-legacy.js';

import '../digitalocean_app/create_server_app';
import '../digitalocean_app/connect_account_app';
import '../outline_app/manage_server_app';
import '../ui_components/outline-about-dialog';
import '../ui_components/outline-feedback-dialog';
import '../ui_components/outline-notification-manager';
import '../ui_components/outline-region-picker-step';
import '../ui_components/outline-share-dialog';
import '../ui_components/outline-sort-span';
import '../ui_components/outline-step-view';
import '../ui_components/outline-survey-dialog';

import IntlMessageFormat from 'intl-messageformat';
import {css, customElement, html, LitElement, property} from 'lit-element';
import {EventEmitter} from "eventemitter3";
import {LocalStorageRepository} from "../../infrastructure/repository";
import {DigitalOceanConnectAccountApp} from "../digitalocean_app/connect_account_app";
import {sleep} from "../../infrastructure/sleep";
import {OutlineNotificationManager} from "../ui_components/outline-notification-manager";
import {ShadowboxSettings} from "../shadowbox_server";
import {
  ACCOUNT_MANAGER_KEY_COMPARATOR,
  ACCOUNT_MANAGER_KEY_EXTRACTOR,
  AccountManager,
  PersistedAccount
} from "../../model/account_manager";
import {AccountId} from "../../model/account";
import {OutlineManageServerApp} from "../outline_app/manage_server_app";
import {makeDisplayServer} from "../display_server";
import {FakeDigitalOceanServer} from "./test_helpers";
import {CloudProviderId} from "../../model/cloud";

async function makeLocalize(language: string) {
  let messages: {[key: string]: string};
  try {
    messages = await (await fetch(`./messages/${language}.json`)).json();
  } catch (e) {
    window.alert(`Could not load messages for language "${language}"`);
  }
  return (msgId: string, ...args: string[]): string => {
    // tslint:disable-next-line:no-any
    const params = {} as {[key: string]: any};
    for (let i = 0; i < args.length; i += 2) {
      params[args[i]] = args[i + 1];
    }
    if (!messages) {
      // Fallback that shows message id and params.
      return `${msgId}(${JSON.stringify(params, null, " ")})`;
    }
    // Ideally we would pre-parse and cache the IntlMessageFormat objects,
    // but it's ok here because it's a test app.
    const formatter = new IntlMessageFormat(messages[msgId], language);
    return formatter.format(params) as string;
  };
}

@customElement('outline-test-app')
export class TestApp extends LitElement {
  @property({type: String}) dir = 'ltr';
  @property({type: Function}) localize: Function;

  private readonly accountManager: AccountManager;
  private readonly shadowboxSettings: ShadowboxSettings;
  private readonly domainEvents: EventEmitter;
  private language = '';

  static get styles() {
    return css`
      :host {
        background: white;
        display: block;
        height: 100%;
        overflow-y: auto;
        padding: 10px;
        width: 100%;
      }
      .widget {
        display: block;
        padding: 20px;
      }
    `;
  }

  constructor() {
    super();
    const accountRepository = new LocalStorageRepository<PersistedAccount, AccountId>(
        'gallery-accounts', localStorage, ACCOUNT_MANAGER_KEY_EXTRACTOR,
        ACCOUNT_MANAGER_KEY_COMPARATOR);
    this.accountManager = new AccountManager(accountRepository);
    this.shadowboxSettings = {
      containerImageId: 'quay.io/outline/shadowbox:nightly',
      metricsUrl: null,
      sentryApiUrl: null,
      debug: true,
    };
    this.domainEvents = new EventEmitter();

    this.setLanguage('en');
  }

  async setLanguage(newLanguage: string) {
    if (newLanguage === this.language) {
      return;
    }
    this.localize = await makeLocalize(newLanguage);
    this.language = newLanguage;    
  }

  // tslint:disable-next-line:no-any
  private select(querySelector: string): any {
    return this.shadowRoot.querySelector(querySelector);
  }

  render() {
    return html`
      <h1>Outline Manager Components Gallery</h1>
      ${this.pageControls}
      
      <div class="widget">
        <h2>outline-about-dialog</h2>
        <button @tap=${() => this.select('outline-about-dialog').open()}>Open Dialog</button>
        <outline-about-dialog .localize=${this.localize} dir=${
        this.dir} outline-version="1.2.3"></outline-about-dialog>
      </div>

      <div class="widget">
        <h2>outline-feedback-dialog</h2>
        <button @tap=${
        () => this.select('outline-feedback-dialog')
                  .open('Pre-populated message', false)}>Open Dialog</button>
        <outline-feedback-dialog .localize=${this.localize} dir=${
        this.dir}></outline-feedback-dialog>
      </div>

      <div class="widget">
        <h2>outline-share-dialog</h2>
        <button @tap=${
        () => this.select('outline-share-dialog')
                  .open('<ACCESS_KEY>', '<INVITE_URL>')}>Open Dialog</button>
        <outline-share-dialog .localize=${this.localize} dir=${this.dir}></outline-share-dialog>
      </div>
      
      <div class="widget">
        <h2>outline-sort-icon</h2>
        <outline-sort-span dir=${this.dir} direction=1 @tap=${() => {
      const el = this.select('outline-sort-span');
      el.direction *= -1;
    }}>Column Header</outline-sort-span>
      </div>

      <div class="widget">
        <h2>outline-survey-dialog</h2>
        <button @tap=${
        () => this.select('outline-survey-dialog')
                  .open('Survey title', 'https://getoutline.org')}>Open Dialog</button>
        <outline-survey-dialog .localize=${this.localize} dir=${this.dir}></outline-survey-dialog>
      </div>

      <div class="widget">
        <h2>digitalocean-connect-account-app</h2>
        <button @tap=${this.onDigitalOceanConnectAccountAppStart}>Start</button>
        <digitalocean-connect-account-app .localize=${this.localize} dir=${this.dir}></digitalocean-connect-account-app>
      </div>

      <div class="widget">
        <h2>digitalocean-connect-account-app</h2>
        <button @tap=${this.onDigitalOceanCreateServerAppStart}>Start</button>
        <digitalocean-create-server-app .localize=${this.localize} dir=${this.dir}></digitalocean-create-server-app>
      </div>
      
      <div class="widget">
        <h2>manage-server-app</h2>
        <button @tap=${this.onOutlineManageServerAppShow}>Show</button>
        <manage-server-app .localize=${this.localize} dir=${this.dir} language="en"></manage-server-app>
      </div>
         
      <outline-notification-manager .localize=${this.localize} dir=${this.dir}></outline-notification-manager>
    `;
  }

  private onDigitalOceanConnectAccountAppStart() {
    const personalAccessToken = (this.select('#doPersonalAccessToken') as HTMLInputElement).value;
    if (!personalAccessToken) {
      const notificationManager = this.select('outline-notification-manager') as OutlineNotificationManager;
      notificationManager.showToast('DigitalOcean personal access token is required.', 3000);
      return;
    }

    // tslint:disable-next-line:no-any
    (window as any).runDigitalOceanOauth = () => {
      let isCancelled = false;
      const rejectWrapper = {reject: (error: Error) => {}};
      return {
        result: new Promise(async (resolve, reject) => {
          rejectWrapper.reject = reject;
          await sleep(3000);
          resolve(personalAccessToken);
        }),
        isCancelled: () => isCancelled,
        cancel: () => {
          isCancelled = true;
          rejectWrapper.reject(new Error('Authentication cancelled'));
        },
      };
    };

    const connectAccountApp = this.select('digitalocean-connect-account-app') as DigitalOceanConnectAccountApp;
    connectAccountApp.accountManager = this.accountManager;
    connectAccountApp.domainEvents = this.domainEvents;
    connectAccountApp.notificationManager = this.select('outline-notification-manager');
    connectAccountApp.shadowboxSettings = this.shadowboxSettings;
    connectAccountApp.start();
  }

  private async onDigitalOceanCreateServerAppStart() {
    const personalAccessToken = (this.select('#doPersonalAccessToken') as HTMLInputElement).value;
    if (!personalAccessToken) {
      const notificationManager = this.select('outline-notification-manager') as OutlineNotificationManager;
      notificationManager.showToast('DigitalOcean personal access token is required.', 3000);
      return;
    }

    const connectAccountApp = this.select('digitalocean-connect-account-app') as DigitalOceanConnectAccountApp;
    this.accountManager.initializeCloudProviders(connectAccountApp);
    const persistedAccount: PersistedAccount = {
      id: {
        cloudSpecificId: '1234',
        cloudProviderId: CloudProviderId.DigitalOcean,
      },
      credentials: personalAccessToken as unknown as object,
    };
    const account = await connectAccountApp.constructAccount(persistedAccount);
    const createServerApp = this.select('digitalocean-create-server-app');
    createServerApp.notificationManager = this.select('outline-notification-manager');
    createServerApp.start(account);
  }

  private async onOutlineManageServerAppShow() {
    const server = new FakeDigitalOceanServer();
    const displayServer = await makeDisplayServer(server);
    const manageServerApp = this.select('manage-server-app') as OutlineManageServerApp;
    manageServerApp.showServer(server, displayServer);
  }

  private get pageControls() {
    return html`<p>
      <label for="language">Language:</label><input type="text" id="language" value="${this.language}">
      <button @tap=${() => this.setLanguage((this.shadowRoot.querySelector('#language') as HTMLInputElement).value)
      }>Set Language</button>
    </p>
    <p>
      <label for="dir-select" @change=${(e: Event) => this.dir = (e.target as HTMLSelectElement).value
      }>Direction: <select id="dir-select">
        <option value="ltr" selected>LTR</option>
        <option value="rtl">RTL</option>
      </select>
    </p>
    <label for="language">DigitalOcean Personal Access Token:</label><input type="text" id="doPersonalAccessToken">`;
  }
}
