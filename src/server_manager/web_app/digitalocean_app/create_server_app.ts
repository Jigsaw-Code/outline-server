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
import {css, customElement, html, LitElement, property} from 'lit-element';

import {HttpError} from '../../cloud/digitalocean_api';
import {makePublicEvent} from '../../infrastructure/dom_events';
import {sleep} from '../../infrastructure/sleep';
import {ManagedServerRepository, RegionId} from '../../model/server';
import * as digitalocean_server from '../digitalocean_server';
import {DigitaloceanServerRepository} from '../digitalocean_server';
import {COMMON_STYLES} from '../ui_components/cloud-install-styles';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';

// DigitalOcean mapping of regions to flags
const FLAG_IMAGE_DIR = 'images/flags';
const DIGITALOCEAN_FLAG_MAPPING: {[cityId: string]: string} = {
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
   * @event DigitalOceanCreateServerApp#server-created
   * @property {ManagedServer} server - The newly created ManagedServer domain model.
   */
  public static EVENT_SERVER_CREATED = 'server-created';

  /**
   * Event fired when the user cancels the create server flow.
   *
   * @event DigitalOceanCreateServerApp#server-create-cancelled
   */
  public static EVENT_SERVER_CREATE_CANCELLED = 'server-create-cancelled';

  @property({type: Function}) localize: Function;
  @property({type: Object}) notificationManager: OutlineNotificationManager;

  private currentPage = 'loading';
  private regionPicker: OutlineRegionPicker;
  private serverRepository: DigitaloceanServerRepository;

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
   * Starts the DigitalOcean create server flow.
   *
   * @param digitalOceanServerRepository The DigitalOcean account on which to create the Outline
   *     server.
   */
  async start(digitalOceanServerRepository: DigitaloceanServerRepository): Promise<void> {
    this.regionPicker =
        this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    this.serverRepository = digitalOceanServerRepository;

    this.reset();
    await this.validateAccount();
    await this.showRegionPicker(this.serverRepository);
  }

  private async validateAccount() {
    let activatingAccount = false;

    while (true) {
      const account = await this.serverRepository.getAccount();
      if (account.status === 'active') {
        if (activatingAccount) {
          this.currentPage = 'accountActive';
          await sleep(1500);
        }
        break;
      } else {
        activatingAccount = true;
        if (!account.email_verified) {
          this.currentPage = 'verifyEmail';
        } else {
          this.currentPage = 'enterBilling';
        }
        await sleep(1000);
      }
    }
  }

  private async showRegionPicker(digitalOceanServerRepository: ManagedServerRepository):
      Promise<void> {
    this.currentPage = 'regionPicker';

    try {
      const regionMap = await digitalOceanServerRepository.getRegionMap();
      const locations = Object.entries(regionMap).map(([cityId, regionIds]) => {
        return this.createLocationModel(cityId, regionIds);
      });
      this.regionPicker.locations = locations;
    } catch (error) {
      if (error instanceof HttpError && error.getStatusCode() !== 401) {
        console.error(`Failed to get list of available regions: ${error}`);
        this.notificationManager.showError('error-do-regions');
      }
    }
  }

  private reset() {
    this.currentPage = 'loading';
    this.regionPicker.reset();
  }

  private async onRegionSelected(event: CustomEvent) {
    this.regionPicker.isServerBeingCreated = true;

    try {
      const serverName = this.makeLocalizedServerName(event.detail.regionId);
      const server = await this.serverRepository.createServer(event.detail.regionId, serverName);
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
  }

  private createLocationModel(cityId: string, regionIds: string[]): Location {
    return {
      id: regionIds.length > 0 ? regionIds[0] : null,
      name: this.localize(`city-${cityId}`),
      flag: DIGITALOCEAN_FLAG_MAPPING[cityId] || '',
      available: regionIds.length > 0,
    };
  }

  private makeLocalizedServerName(regionId: RegionId) {
    const serverLocation = this.getLocalizedCityName(regionId);
    return this.localize('server-name', 'serverLocation', serverLocation);
  }

  private getLocalizedCityName(regionId: RegionId) {
    const cityId = digitalocean_server.GetCityId(regionId);
    return this.localize(`city-${cityId}`);
  }
}
