/*
  Copyright 2018 The Outline Authors

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

import {makePublicEvent} from '../../infrastructure/events';
import {sleep} from '../../infrastructure/sleep';
import {DigitalOceanAccount} from '../../model/digitalocean_account';
import {COMMON_STYLES} from '../ui_components/cloud-install-styles';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';

@customElement('digital-ocean-verify-account-app')
export class DigitalOceanVerifyAccountApp extends LitElement {
  @property({type: Function}) localize: Function;
  @property({type: String}) currentPage: string;
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;

  private cancelled = false;
  private activatingAccount = false;

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
    <iron-pages id="pages" attr-for-selected="id" selected="${this.currentPage}">
      <outline-step-view id="verifyEmail">
        <span slot="step-title">${this.localize('oauth-activate-account')}</span>
        <span slot="step-description">${this.localize('oauth-verify')}</span>
        <paper-card class="card">
          <div class="container">
            <img class="mirror" src="images/do_oauth_email.svg">
            <p>${this.localize('oauth-verify-tag')}</p>
          </div>
          <paper-button @tap="${this.cancelTapped}">${
        this.localize('oauth-sign-out')}</paper-button>
        </paper-card>
      </outline-step-view>

      <outline-step-view id="enterBilling">
        <span slot="step-title">${this.localize('oauth-activate-account')}</span>
        <span slot="step-description">${this.localize('oauth-billing')}</span>
        <paper-card class="card">
          <div class="container">
            <img class="mirror" src="images/do_oauth_billing.svg">
            <p>${this.localize('oauth-billing-tag')}</p>
          </div>
          <paper-button @tap="${this.cancelTapped}">${
        this.localize('oauth-sign-out')}</paper-button>
        </paper-card>
      </outline-step-view>

      <outline-step-view id="accountActive">
        <span slot="step-title">${this.localize('oauth-activate-account')}</span>
        <span slot="step-description">${this.localize('oauth-account-active')}</span>
        <paper-card class="card">
          <div class="container">
            <img class="mirror" src="images/do_oauth_done.svg">
            <p>${this.localize('oauth-account-active-tag')}</p>
          </div>
          <paper-button disabled="">${this.localize('oauth-sign-out')}</paper-button>
        </paper-card>
      </outline-step-view>
    </iron-pages>`;
  }

  async start(account: DigitalOceanAccount): Promise<boolean> {
    this.cancelled = false;
    this.activatingAccount = false;
    this.currentPage = 'accountActive';

    while (true) {
      if (this.cancelled) {
        return Promise.reject('Authorization cancelled');
      }

      try {
        if (await account.getStatus()) {
          // Show 'account activated' screen if activated during this session.
          if (this.activatingAccount) {
            this.currentPage = 'accountActive';
            await sleep(1500);
          }
          return true;
        } else {
          if (await account.isVerified()) {
            this.currentPage = 'enterBilling';
          } else {
            this.currentPage = 'verifyEmail';
          }
          this.activatingAccount = true;
        }
      } catch (error) {
        if (!this.cancelled) {
          console.error(`Failed to get DigitalOcean account information: ${error}`);
          this.notificationManager.showError(this.localize('error-do-account-info'));
          throw error;
        }
      }
      await sleep(1000);
    }
  }

  private cancelTapped() {
    const event = makePublicEvent('DigitalOceanVerifyAccount#Cancelled');
    this.dispatchEvent(event);
  }
}
