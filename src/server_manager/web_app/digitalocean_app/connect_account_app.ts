/*
  Copyright 2020 The Outline Authors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
import '@polymer/polymer/polymer-legacy.js';
import '@polymer/iron-pages/iron-pages.js';
import '../ui_components/outline-step-view.js';

import {css, customElement, html, LitElement, property} from 'lit-element';
import {DigitalOceanAccount} from '../../model/digitalocean_account';
import {COMMON_STYLES} from '../ui_components/cloud-install-styles';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {makePublicEvent} from "../../infrastructure/dom_events";
import {ShadowboxSettings} from "../shadowbox_server";
import {EventEmitter} from "eventemitter3";
import {AccountFactory, AccountManager, LEGACY_DIGITALOCEAN_ACCOUNT_ID} from "../../model/account_manager";

@customElement('digitalocean-connect-account-app')
export class DigitalOceanConnectAccountApp extends LitElement implements AccountFactory<DigitalOceanAccount> {
  /**
   * Event fired upon successful completion of the DigitalOcean connect account flow.
   *
   * @event digitalocean-account-connected
   * @property {DigitalOceanAccount} account - The newly connected DigitalOcean account domain model.
   */
  public static EVENT_ACCOUNT_CONNECTED = 'digitalocean-account-connected';

  /**
   * Event fired when the user cancels the DigitalOcean connect account flow.
   *
   * @event digitalocean-account-connect-cancelled
   */
  public static EVENT_ACCOUNT_CONNECT_CANCELLED = 'digitalocean-account-connect-cancelled';

  @property({type: Function}) localize: Function;
  @property({type: String}) currentPage = 'loading';
  @property({type: Object}) accountManager: AccountManager = null;
  @property({type: Object}) domainEvents: EventEmitter = null;
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;
  @property({type: Object}) shadowboxSettings: ShadowboxSettings = null;

  private session: OauthSession;

  static get styles() {
    return [
      COMMON_STYLES, css`
      :host {
      }
      .container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;
        align-items: center;
        padding: 132px 0;
        font-size: 14px;
      }
      #connectAccount img {
        width: 48px;
        height: 48px;
        margin-bottom: 12px;
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        margin: 24px 0;
        padding: 24px;
        background: var(--background-contrast-color);
        box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2);
        border-radius: 2px;
      }
      @media (min-width: 1025px) {
        paper-card {
          /* Set min with for the paper-card to grow responsively. */
          min-width: 600px;
        }
      }
      .card p {
        color: var(--light-gray);
        width: 100%;
        text-align: center;
      }
      .card paper-button {
        color: var(--light-gray);
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 2px;
      }
      .card paper-button[disabled] {
        color: var(--medium-gray);
        background: transparent;
      }
      /* Mirror images */
      :host(:dir(rtl)) .mirror {
        transform: scaleX(-1);
      }
    `
    ];
    // TODO: RTL
  }

  render() {
    return html`
      <iron-pages id="pages" attr-for-selected="id" .selected="${this.currentPage}">
        <outline-step-view id="loading"></outline-step-view>
        
        <outline-step-view id="connectAccount">
          <span slot="step-title">${this.localize('oauth-connect-title')}</span>
          <span slot="step-description">${this.localize('oauth-connect-description')}</span>
          <paper-card class="card">
            <div class="container">
              <img src="images/digital_ocean_logo.svg">
              <p>${this.localize('oauth-connect-tag')}</p>
            </div>
            <paper-button @tap="${this.onCancel}">${this.localize('cancel')}</paper-button>
          </paper-card>
        </outline-step-view>
      </iron-pages>`;
  }

  /** Starts the connect account user flow. */
  async start(): Promise<void> {
    this.reset();
    const storedAccount = await this.accountManager.loadDigitalOceanAccount();
    if (storedAccount) {
      const serverCreatedEvent =
          makePublicEvent(DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECTED, {account: storedAccount});
      this.dispatchEvent(serverCreatedEvent);
      return;
    }

    this.currentPage = 'connectAccount';
    this.session = runDigitalOceanOauth();
    console.log(this.session);

    let accessToken;
    try {
      accessToken = await this.session.result;
    } catch (error) {
      if (this.session.isCancelled()) {
        this.onCancel();
      } else {
        console.error(`DigitalOcean authentication failed: ${error}`);
        this.notificationManager.showError(this.localize('error-do-auth'));
        throw error;
      }
    }

    const account = this.accountManager.connectDigitalOceanAccount(accessToken);
    const serverCreatedEvent =
        makePublicEvent(DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECTED, {account});
    this.dispatchEvent(serverCreatedEvent);
    this.currentPage = 'loading';
  }

  constructAccount(credentials: object): Promise<DigitalOceanAccount> {
    return new Promise(() => new DigitalOceanAccount(LEGACY_DIGITALOCEAN_ACCOUNT_ID.cloudSpecificId, credentials as unknown as string, this.domainEvents, this.accountManager, this.shadowboxSettings));
  }

  private reset() {
    if (this.session) {
      this.session.cancel();
    }
    this.currentPage = 'loading';
  }

  private onCancel() {
    const event = makePublicEvent(DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECT_CANCELLED);
    this.dispatchEvent(event);
    this.reset();
  }
}
