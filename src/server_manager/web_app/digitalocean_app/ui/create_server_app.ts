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
import '../../ui_components/outline-region-picker-step';
import '../../ui_components/outline-step-view.js';

import {css, customElement, html, LitElement, property} from 'lit-element';

import {makePublicEvent} from '../../../infrastructure/dom_events';
import {sleep} from '../../../infrastructure/sleep';
import {DigitalOceanAccount, DigitalOceanLocation, DigitalOceanStatus} from '../../../model/account';
import {COMMON_STYLES} from '../../ui_components/cloud-install-styles';
import {OutlineNotificationManager} from '../../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../../ui_components/outline-region-picker-step';
import {HttpError} from '../infrastructure/api';

// DigitalOcean mapping of regions to flags
const FLAG_IMAGE_DIR = 'images/flags';
const FLAG_MAPPING: {[cityId: string]: string} = {
  ams: `${FLAG_IMAGE_DIR}/netherlands.png`,
  sgp: `${FLAG_IMAGE_DIR}/singapore.png`,
  blr: `${FLAG_IMAGE_DIR}/india.png`,
  fra: `${FLAG_IMAGE_DIR}/germany.png`,
  lon: `${FLAG_IMAGE_DIR}/uk.png`,
  sfo: `${FLAG_IMAGE_DIR}/us.png`,
  tor: `${FLAG_IMAGE_DIR}/canada.png`,
  nyc: `${FLAG_IMAGE_DIR}/us.png`,
};

/**
 * A web component that guides a user through the process of creating an Outline
 * server on DigitalOcean.
 *
 * Applications must call {@link start} to begin the server creation flow. The flow
 * is asynchronous and events will be fired on successful server creation or user
 * cancellation.
 */
@customElement('digitalocean-create-server-app')
export class DigitalOceanCreateServerApp extends LitElement {
  /**
   * Event fired upon successful completion of the DigitalOcean create server flow.
   * Note that even though the event contains the newly created server, the server
   * may still be in the process of initializing.
   *
   * @event do-server-created
   * @property {ManagedServer} server - The newly created ManagedServer domain model.
   */
  public static EVENT_SERVER_CREATED = 'do-server-created';

  /**
   * Event fired when the user cancels the create server flow.
   *
   * @event do-server-create-cancelled
   */
  public static EVENT_SERVER_CREATE_CANCELLED = 'do-server-create-cancelled';

  @property({type: Function}) localize: Function = null;
  @property({type: String}) currentPage = 'loading';
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;

  private regionPicker: OutlineRegionPicker;
  private account: DigitalOceanAccount;

  static get styles() {
    return [
      COMMON_STYLES, css`
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
      }`
    ];
  }

  render() {
    return html`
      <iron-pages id="pages" attr-for-selected="id" .selected="${this.currentPage}">
        <outline-step-view id="loading"></outline-step-view>
      
        <outline-step-view id="verifyEmail">
          <span slot="step-title">${this.localize('oauth-activate-account')}</span>
          <span slot="step-description">${this.localize('oauth-verify')}</span>
          <paper-card class="card">
            <div class="container">
              <img class="mirror" src="images/do_oauth_email.svg">
              <p>${this.localize('oauth-verify-tag')}</p>
            </div>
            <paper-button @tap="${this.onCancelTapped}">${this.localize('cancel')}</paper-button>
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
            <paper-button @tap="${this.onCancelTapped}">${this.localize('cancel')}</paper-button>
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
          </paper-card>
        </outline-step-view>
        
        <outline-region-picker-step id="regionPicker" .localize=${this.localize}
            @region-selected="${this.onRegionSelected}"></outline-region-picker-step>
    </iron-pages>`;
  }

  /**
   * Starts the DigitalOcean create server user flow.
   *
   * @param account The DigitalOcean account on which to create the Outline server.
   */
  async start(account: DigitalOceanAccount): Promise<void> {
    this.regionPicker =
        this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    this.account = account;

    this.reset();
    await this.validateAccount();
    await this.showRegionPicker();
  }

  private async validateAccount() {
    let activatingAccount = false;

    while (true) {
      const status = await this.account.getStatus();
      if (status === DigitalOceanStatus.ACTIVE) {
        if (activatingAccount) {
          this.currentPage = 'accountActive';
          await sleep(1500);
        }
        break;
      } else {
        activatingAccount = true;
        if (status === DigitalOceanStatus.EMAIL_NOT_VERIFIED) {
          this.currentPage = 'verifyEmail';
        } else {
          this.currentPage = 'enterBilling';
        }
        await sleep(1000);
      }
    }
  }

  private async showRegionPicker(): Promise<void> {
    this.currentPage = 'regionPicker';

    try {
      const locations = await this.account.listLocations();
      const displayLocations = locations.map((entry: DigitalOceanLocation) => {
        return this.createLocationModel(entry.regionId, entry.dataCenterIds);
      });
      this.regionPicker.locations = displayLocations;
    } catch (error) {
      if (error instanceof HttpError && error.getStatusCode() !== 401) {
        console.error(`Failed to get list of available regions: ${error}`);
        this.notificationManager.showError('error-do-regions');
      }
    }
  }

  private reset() {
    console.log('reset');
    this.currentPage = 'loading';
    this.regionPicker.reset();
  }

  private async onRegionSelected(event: CustomEvent) {
    this.regionPicker.isServerBeingCreated = true;

    try {
      const serverName = this.makeLocalizedServerName(event.detail.regionId);
      const server = await this.account.createServer(serverName, event.detail.regionId);
      console.log(server);


      const serverCreatedEvent =
          makePublicEvent(DigitalOceanCreateServerApp.EVENT_SERVER_CREATED, {server});
      this.dispatchEvent(serverCreatedEvent);
    } catch (error) {
      this.notificationManager.showError('error-server-creation');
    } finally {
      this.regionPicker.isServerBeingCreated = false;
    }
  }

  private onCancelTapped() {
    const customEvent = new CustomEvent(DigitalOceanCreateServerApp.EVENT_SERVER_CREATE_CANCELLED);
    this.dispatchEvent(customEvent);
    this.reset();
  }

  private createLocationModel(locationId: string, dataCenterIds: string[]): Location {
    return {
      id: dataCenterIds.length > 0 ? dataCenterIds[0] : null,
      nameMessageId: `city-${locationId}`,
      flagUri: FLAG_MAPPING[locationId] || '',
      available: dataCenterIds.length > 0,
    };
  }

  private makeLocalizedServerName(locationId: string) {
    const serverLocation = this.localize(`city-${locationId}`);
    return this.localize('server-name', 'serverLocation', serverLocation);
  }
}
