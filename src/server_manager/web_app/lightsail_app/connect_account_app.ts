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
import {css, customElement, html, LitElement, property} from "lit-element";
import {AppSettings} from "../app";
import {LocalStorageRepository} from "../../infrastructure/repository";
import * as account from "../../model/account";
import {OutlineNotificationManager} from "../ui_components/outline-notification-manager";
import {COMMON_STYLES} from '../ui_components/cloud-install-styles';
import {makePublicEvent} from "../../infrastructure/events";
import {LightsailAccount} from "../../model/lightsail_account";
import {CloudProviderId} from "../../model/cloud";
import {LightsailSdkProviderService} from "../../cloud/lightsail_api";

@customElement('lightsail-connect-account-app')
export class LightsailConnectAccountApp extends LitElement {
  /**
   * Event fired upon successful completion of the Amazon Lightsail connect account flow.
   *
   * @event lightsail-account-connected
   * @property {LightsailAccount} account - The newly connected Amazon Lightsail account domain model.
   */
  public static EVENT_ACCOUNT_CONNECTED = 'lightsail-account-connected';

  /**
   * Event fired when the user cancels the Amazon Lightsail connect account flow.
   *
   * @event lightsail-account-connect-cancelled
   */
  public static EVENT_ACCOUNT_CONNECT_CANCELLED = 'lightsail-account-connect-cancelled';

  @property({type: Function}) localize: Function;
  @property({type: Object}) appSettings: AppSettings = null;
  @property({type: Object}) accountRepository: LocalStorageRepository<account.Data, string> = null;
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;

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
      }`
    ];
    // TODO: RTL
  }

  render() {
    return html`
    <outline-step-view id="connectAccount">
      <span slot="step-title">Sign in with your Amazon Lightsail account.</span>
      <span slot="step-description">${this.localize('oauth-connect-description')}</span>
      <paper-card class="card">
        <div class="container">
          <img src="images/aws-logo.svg">
          <p>${this.localize('oauth-connect-tag')}</p>
        </div>
        <paper-button @tap="${this.onCancel}">${this.localize('cancel')}</paper-button>
      </paper-card>
    </outline-step-view>`;
  }

  async start(): Promise<void> {
    try {
      // const credential = await runGcpOauth();
      // const data = await this.createAccountData(credential);
      // const account = await this.createAccountModel(data);
      // const serverCreatedEvent =
      //     makePublicEvent(LightsailConnectAccountApp.EVENT_ACCOUNT_CONNECTED, {account});
      // this.dispatchEvent(serverCreatedEvent);
    } catch (error) {
      console.error(`Lightsail authentication failed: ${error}`);
      this.notificationManager.showError(this.localize('error-do-auth'));
      throw error;
    }
  }

  async createAccountModel(data: account.Data): Promise<LightsailAccount> {
    const lightsailCredential = data.credential as string;
    const providerService = new LightsailSdkProviderService(lightsailCredential);
    return new LightsailAccount(providerService, data, this.accountRepository);
  }

  private async createAccountData(credentials: Credentials) {
    return {
      id: 'blah',
      displayName: 'blah',
      provider: CloudProviderId.Lightsail,
      credential: credentials.refresh_token,
    };
  }

  private onCancel() {
    const event = makePublicEvent(LightsailConnectAccountApp.EVENT_ACCOUNT_CONNECT_CANCELLED);
    this.dispatchEvent(event);
  }
}
