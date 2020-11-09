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

import {LightsailAccount} from '../../model/lightsail_account';
import {makePublicEvent} from '../../infrastructure/dom_events';
import {COMMON_STYLES} from '../ui_components/cloud-install-styles';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';
import {HttpError} from "../../infrastructure/fetch";

// Amazon Lightsail mapping of locations to flags
const FLAG_IMAGE_DIR = 'images/flags';
const FLAG_MAPPING: {[cityId: string]: string} = {
  'us-east-1': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west-2': `${FLAG_IMAGE_DIR}/us.png`,
  'ap-south-1': `${FLAG_IMAGE_DIR}/india.png`,
  'ap-northeast-2': `${FLAG_IMAGE_DIR}/south_korea.png`,
  'ap-southeast-1': `${FLAG_IMAGE_DIR}/singapore.png`,
  'ap-southeast-2': `${FLAG_IMAGE_DIR}/australia.png`,
  'ap-northeast-1': `${FLAG_IMAGE_DIR}/japan.png`,
  'ca-central-1': `${FLAG_IMAGE_DIR}/canada.png`,
  'eu-central-1': `${FLAG_IMAGE_DIR}/germany.png`,
  'eu-west-1': `${FLAG_IMAGE_DIR}/ireland.png`,
  'eu-west-2': `${FLAG_IMAGE_DIR}/england.png`,
  'eu-west-3': `${FLAG_IMAGE_DIR}/france.png`,
};

const REGION_MAPPING = new Map<string, string>([
  ["us-east-1", "US East (N. Virginia)"],
  ["us-east-2", "US East (Ohio)"],
  ["us-west-2", "US West (Oregon)"],
  ["ap-south-1", "Asia Pacific (Mumbai)"],
  ["ap-northeast-2", "Asia Pacific (Seoul)"],
  ["ap-southeast-1", "Asia Pacific (Singapore)"],
  ["ap-southeast-2", "Asia Pacific (Sydney)"],
  ["ap-northeast-1", "Asia Pacific (Tokyo)"],
  ["ca-central-1", "Canada (Central)"],
  ["eu-central-1", "EU (Frankfurt)"],
  ["eu-west-1", "EU (Ireland)"],
  ["eu-west-2", "EU (London)"],
  ["eu-west-3", "EU (Paris)"],
]);

/**
 * A web component that guides a user through the process of creating an Outline
 * server on Amazon Lightsail.
 */
@customElement('lightsail-create-server-app')
export class LightsailCreateServerApp extends LitElement {
  /**
   * Event fired upon successful completion of the Amazon Lightsail create server flow.
   * Note that even though the event contains the newly created server, the server
   * may still be in the process of initializing.
   *
   * @event lightsail-server-created
   * @property {ManagedServer} server - The newly created ManagedServer domain model.
   */
  public static EVENT_SERVER_CREATED = 'lightsail-server-created';

  /**
   * Event fired when the user cancels the create server flow.
   *
   * @event lightsail-server-create-cancelled
   */
  public static EVENT_SERVER_CREATE_CANCELLED = 'lightsail-server-create-cancelled';

  @property({type: Function}) localize: Function;
  @property({type: Object}) notificationManager: OutlineNotificationManager;

  private currentPage = 'loading';
  private regionPicker: OutlineRegionPicker;
  private account: LightsailAccount;

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

        <outline-region-picker-step id="regionPicker" .localize=${this.localize}
            @region-selected="${this.onRegionSelected}"></outline-region-picker-step>
      </iron-pages>`;
  }

  /**
   * Starts the DigitalOcean create server flow.
   *
   * @param account The DigitalOcean account on which to create the Outline server.
   */
  async start(account: LightsailAccount): Promise<void> {
    this.regionPicker =
        this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    this.account = account;

    this.reset();
    await this.showRegionPicker();
  }

  private async showRegionPicker(): Promise<void> {
    this.currentPage = 'regionPicker';

    try {
      const regionMap = await this.account.getRegionMap();
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
      const serverName = event.detail.regionId;
      const server = await this.account.createServer(event.detail.regionId, serverName);
      const serverCreatedEvent =
          makePublicEvent(LightsailCreateServerApp.EVENT_SERVER_CREATED, {server});
      this.dispatchEvent(serverCreatedEvent);
    } catch (error) {
      this.notificationManager.showError('error-server-creation');
    } finally {
      this.regionPicker.isServerBeingCreated = false;
    }
  }

  private onCancelTapped() {
    const customEvent = new CustomEvent(LightsailCreateServerApp.EVENT_SERVER_CREATE_CANCELLED);
    this.dispatchEvent(customEvent);
  }

  private createLocationModel(cityId: string, regionIds: string[]): Location {
    return {
      id: regionIds.length > 0 ? regionIds[0] : null,
      name: REGION_MAPPING.get(cityId) || cityId,
      flag: FLAG_MAPPING[cityId] || '',
      available: regionIds.length > 0,
    };
  }
}
