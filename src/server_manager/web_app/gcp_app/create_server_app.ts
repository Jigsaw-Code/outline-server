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
import {customElement, html, LitElement, property} from 'lit-element';

import {GcpAccount} from '../../model/gcp_account';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';
import {makePublicEvent} from "../../infrastructure/dom_events";

// GCP mapping of locations to flags
const FLAG_IMAGE_DIR = 'images/flags';
const FLAG_MAPPING: {[cityId: string]: string} = {
  'asia-east1-a': `${FLAG_IMAGE_DIR}/taiwan.png`,
  'asia-east2-a': `${FLAG_IMAGE_DIR}/hong_kong.png`,
  'asia-northeast1-a': `${FLAG_IMAGE_DIR}/japan.png`,
  'asia-northeast2-a': `${FLAG_IMAGE_DIR}/japan.png`,
  'asia-northeast3-a': `${FLAG_IMAGE_DIR}/south_korea.png`,
  'asia-south1-a': `${FLAG_IMAGE_DIR}/india.png`,
  'asia-southeast1-a': `${FLAG_IMAGE_DIR}/singapore.png`,
  'asia-southeast2-a': `${FLAG_IMAGE_DIR}/indonesia.png`,
  'australia-southeast1-a': `${FLAG_IMAGE_DIR}/australia.png`,
  'europe-north1-a': `${FLAG_IMAGE_DIR}/finland.png`,
  'europe-west1-a': `${FLAG_IMAGE_DIR}/belgium.png`,
  'europe-west2-a': `${FLAG_IMAGE_DIR}/england.png`,
  'europe-west3-a': `${FLAG_IMAGE_DIR}/germany.png`,
  'europe-west4-a': `${FLAG_IMAGE_DIR}/netherlands.png`,
  'europe-west6-a': `${FLAG_IMAGE_DIR}/switzerland.png`,
  'northamerica-northeast1-a': `${FLAG_IMAGE_DIR}/canada.png`,
  'southamerica-east1-a': `${FLAG_IMAGE_DIR}/brazil.png`,
  'us-central1-a': `${FLAG_IMAGE_DIR}/us.png`,
  'us-east1-a': `${FLAG_IMAGE_DIR}/us.png`,
  'us-east4-a': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west1-a': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west2-a': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west3-a': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west4-a': `${FLAG_IMAGE_DIR}/us.png`,
};

const REGION_MAPPING = new Map<string, string>([
  ['asia-east1-a', 'Changhua County, Taiwan'],
  ['asia-east2-a', 'Hong Kong'],
  ['asia-northeast1-a', 'Tokyo, Japan'],
  ['asia-northeast2-a', 'Osaka, Japan'],
  ['asia-northeast3-a', 'Seoul, South Korea'],
  ['asia-south1-a', 'Mumbai, India'],
  ['asia-southeast1-a', 'Jurong West, Singapore'],
  ['asia-southeast2-a', 'Jakarta, Indonesia'],
  ['australia-southeast1-a', 'Sydney, Australia'],
  ['europe-north1-a', 'Hamina, Finland'],
  ['europe-west1-a', 'St. Ghislain, Belgium'],
  ['europe-west2-a', 'London, England, UK'],
  ['europe-west3-a', 'Frankfurt, Germany'],
  ['europe-west4-a', 'Eemshaven, Netherlands'],
  ['europe-west6-a', 'Zürich, Switzerland'],
  ['northamerica-northeast1-a', 'Montréal, Québec, Canada'],
  ['southamerica-east1-a', 'Osasco (São Paulo), Brazil'],
  ['us-central1-a', 'Council Bluffs, Iowa, USA'],
  ['us-east1-a', 'Moncks Corner, South Carolina, USA'],
  ['us-east4-a', 'Ashburn, Northern Virginia, USA'],
  ['us-west1-a', 'The Dalles, Oregon, USA'],
  ['us-west2-a', 'Los Angeles, California, USA'],
  ['us-west3-a', 'Salt Lake City, Utah, USA'],
  ['us-west4-a', 'Las Vegas, Nevada, USA'],
]);

@customElement('gcp-create-server-app')
export class GcpCreateServerApp extends LitElement {
  /**
   * Event fired upon successful completion of the GCP create server flow.
   * Note that even though the event contains the newly created server, the server
   * may still be in the process of initializing.
   *
   * @event gcp-server-created
   * @property {ManagedServer} server - The newly created ManagedServer domain model.
   */
  public static EVENT_SERVER_CREATED = 'gcp-server-created';

  /**
   * Event fired when the user cancels the create server flow.
   *
   * @event gcp-server-create-cancelled
   */
  public static EVENT_SERVER_CREATE_CANCELLED = 'gcp-server-create-cancelled';

  @property({type: Function}) localize: Function;
  @property({type: String}) currentPage = 'loading';
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;

  private regionPicker: OutlineRegionPicker;
  private account: GcpAccount;
  private projectName: string;

  render() {
    return html`
      <iron-pages id="pages" attr-for-selected="id" .selected="${this.currentPage}">
        <outline-step-view id="loading"></outline-step-view>
        <outline-step-view id="selectProject">
          <span slot="step-title">Select a GCP project</span>
          <span slot="step-description">This project is where your Outline server will be created</span>
          
        </outline-step-view>
        <outline-region-picker-step id="regionPicker" .localize=${this.localize}
            @region-selected="${this.onRegionSelected}"></outline-region-picker-step>
    </iron-pages>`;
  }

  /**
   * Starts the GCP create server flow.
   *
   * @param account The GCP account on which to create the Outline server.
   */
  async start(account: GcpAccount): Promise<void> {
    this.regionPicker =
        this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    this.account = account;

    this.reset();
    await this.selectProject();
    await this.showRegionPicker();
  }

  private selectProject(): void {
    this.projectName = '';
  }

  private async showRegionPicker(): Promise<void> {
    this.currentPage = 'regionPicker';

    try {
      const map = await this.account.getRegionMap();
      const locations = Object.entries(map).map(([cityId, regionIds]) => {
        return this.createLocationModel(cityId, regionIds);
      });
      this.regionPicker.locations = locations;
    } catch (err) {
      console.error(`Failed to get list of available regions: ${err}`);
      this.notificationManager.showError(this.localize('error-do-regions'));
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
          makePublicEvent(GcpCreateServerApp.EVENT_SERVER_CREATED, {server});
      this.dispatchEvent(serverCreatedEvent);
    } catch (error) {
      this.notificationManager.showError('error-server-creation');
    } finally {
      this.regionPicker.isServerBeingCreated = false;
    }
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
