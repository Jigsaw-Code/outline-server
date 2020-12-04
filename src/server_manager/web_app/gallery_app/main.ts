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
import '../digitalocean_app/ui/create_server_app';
import '../digitalocean_app/ui/connect_account_app';
import '../ui_components/outline-about-dialog';
import '../ui_components/outline-do-oauth-step';
import '../ui_components/outline-feedback-dialog';
import '../ui_components/outline-notification-manager';
import '../ui_components/outline-share-dialog';
import '../ui_components/outline-sort-span';
import '../ui_components/outline-survey-dialog';

import IntlMessageFormat from 'intl-messageformat';
import {css, customElement, html, LitElement, property} from 'lit-element';
import {DigitalOceanCloud, PersistedAccount} from "../digitalocean_app/model/cloud";
import {EventEmitter} from "eventemitter3";
import {KeyValueStorage} from "../../infrastructure/key_value_storage";
import {DigitalOceanConnectAccountApp} from "../digitalocean_app/ui/connect_account_app";
import {OutlineNotificationManager} from "../ui_components/outline-notification-manager";
import {sleep} from "../../infrastructure/sleep";
import {DigitalOceanAccount} from "../digitalocean_app/model/account";
import {FAKE_SHADOWBOX_SETTINGS} from "../../model/test_helpers";

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
  @property({type: Object}) digitalOceanAccount: DigitalOceanAccount;

  private readonly digitalOceanCloud: DigitalOceanCloud = null;
  private readonly domainEvents = new EventEmitter();
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
    this.setLanguage('en');

    const digitalOceanStorage = new KeyValueStorage<PersistedAccount, string>('gallery/accounts/digitalocean', localStorage, (entry: PersistedAccount) => entry.id);
    this.digitalOceanCloud = new DigitalOceanCloud(this.domainEvents, FAKE_SHADOWBOX_SETTINGS, digitalOceanStorage);
    this.digitalOceanAccount = this.digitalOceanCloud.listAccounts()[0] as DigitalOceanAccount;
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
        <digitalocean-connect-account-app .localize=${this.localize} dir=${this.dir} 
          @digitalocean-account-connected="${this.onDigitalOceanAccountConnected}"
          @digitalocean-account-connect-cancelled="${this.onDigitalOceanAccountConnectCancelled}"></digitalocean-connect-account-app>
      </div>

      <div class="widget">
        <h2>digitalocean-connect-account-app</h2>
        <button @tap=${this.onDigitalOceanCreateServerAppStart}>Start</button>
        <digitalocean-create-server-app .localize=${this.localize} dir=${this.dir}></digitalocean-create-server-app>
      </div>
      
      <outline-notification-manager .localize=${this.localize} dir=${this.dir}></outline-notification-manager>
    `;
  }

  private get pageControls() {
    const digitalOceanAccountConnectionStatus = this.digitalOceanAccount ? 'Connected' : 'Disconnected';
    const digitalOceanAccountDisconnectButton = this.digitalOceanAccount ? html`<button @tap=${this.disconnectDigitalOceanAccount}>Disconnect</button>` : '';
    const digitalOceanAccountPersonalAccessToken = !this.digitalOceanAccount ? html`<label for="doPersonalAccessToken">DigitalOcean Personal Access Token:</label><input type="text" id="doPersonalAccessToken">` : '';
    const digitalOceanAccountControls = html`
    <p>
      <div>
        <span>DigitalOcean account: ${digitalOceanAccountConnectionStatus}</span>
        ${digitalOceanAccountDisconnectButton}
      </div>
      <div>
        ${digitalOceanAccountPersonalAccessToken}
      </div>
    </p>    
    `;

    return html`
    <p>
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
    ${digitalOceanAccountControls}`;
  }

  private onDigitalOceanConnectAccountAppStart(): void {
    // The DigitalOcean OAuth flow requires a local web server running on the
    // electron process to process the authorization response. We mock this out
    // for the gallery app.
    const personalAccessToken = this.parseDigitalOceanPersonalAccessToken();
    this.mockDigitalOceanOauth(personalAccessToken);

    const connectAccountApp = this.select('digitalocean-connect-account-app') as DigitalOceanConnectAccountApp;
    connectAccountApp.cloud = this.digitalOceanCloud;
    connectAccountApp.notificationManager = this.getNotificationManager();
    connectAccountApp.start();
  }

  private onDigitalOceanAccountConnected(event: CustomEvent): void {
    this.digitalOceanAccount = event.detail.account;
    this.getNotificationManager().showToast('DigitalOcean account connected', 3000);
  }

  private onDigitalOceanAccountConnectCancelled(event: CustomEvent): void {
    this.getNotificationManager().showToast('DigitalOcean account connect cancelled', 3000);
  }

  private async onDigitalOceanCreateServerAppStart(): Promise<void> {
    const account = this.digitalOceanCloud.listAccounts()[0];
    const createServerApp = this.select('digitalocean-create-server-app');
    createServerApp.notificationManager = this.getNotificationManager();
    createServerApp.start(account);
  }

  private parseDigitalOceanPersonalAccessToken(): string {
    const result = (this.select('#doPersonalAccessToken') as HTMLInputElement).value;
    if (!result) {
      const notificationManager = this.select('outline-notification-manager') as OutlineNotificationManager;
      const message = 'DigitalOcean personal access token is required.';
      notificationManager.showToast(message, 3000);
      throw new Error(message);
    }
    return result;
  }

  private mockDigitalOceanOauth(personalAccessToken: string): void {
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
  }

  private disconnectDigitalOceanAccount(): void {
    this.digitalOceanAccount.disconnect();
    this.digitalOceanAccount = null;
    this.getNotificationManager().showToast('DigitalOcean account disconnected', 3000);
  }

  private getNotificationManager(): OutlineNotificationManager {
    return this.select('outline-notification-manager');
  }
}
