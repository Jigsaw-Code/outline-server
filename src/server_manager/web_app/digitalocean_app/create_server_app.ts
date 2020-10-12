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

import {makePublicEvent} from '../../infrastructure/dom_events';
import {ManagedServer, ManagedServerRepository, RegionId} from '../../model/server';
import * as digitalocean_server from '../digitalocean_server';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';
import {XhrError} from "../../cloud/digitalocean_api";

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

@customElement('digitalocean-create-server-app')
export class DigitalOceanCreateServerApp extends LitElement {
  public static EVENT_SERVER_CREATED = 'do-create-server-app-server-created';
  public static EVENT_AUTHORIZATION_ERROR = 'do-create-server-app-authorization-error';

  @property({type: Function}) localize: Function;

  private digitalOceanServerRepository: ManagedServerRepository;
  private notificationManager: OutlineNotificationManager;

  render() {
    return html`<outline-region-picker-step .localize=${this.localize} 
        @outline-region-picker-region-selected="${
        this.onRegionSelected}"></outline-region-picker-step>`;
  }

  async onRegionSelected(event: CustomEvent) {
    const regionPicker =
        this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    regionPicker.isServerBeingCreated = true;

    try {
      const server =
          await this.createServer(this.digitalOceanServerRepository, event.detail.regionId);
      const serverCreatedEvent =
          makePublicEvent(DigitalOceanCreateServerApp.EVENT_SERVER_CREATED, {server});
      this.dispatchEvent(serverCreatedEvent);
    } catch (error) {
      this.notificationManager.showError('error-server-creation');
    }
  }

  setNotificationManager(notificationManager: OutlineNotificationManager) {
    this.notificationManager = notificationManager;
  }

  async start(digitalOceanServerRepository: ManagedServerRepository): Promise<void> {
    this.digitalOceanServerRepository = digitalOceanServerRepository;
    return this.showRegionPicker(this.digitalOceanServerRepository);
  }

  private async showRegionPicker(digitalOceanServerRepository: ManagedServerRepository):
      Promise<void> {
    const regionPicker =
        this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    regionPicker.isServerBeingCreated = false;
    regionPicker.reset();

    try {
      // TODO: Catch and rethrow authorization error
      const regionMap = await digitalOceanServerRepository.getRegionMap();
      const locations = Object.entries(regionMap).map(([cityId, regionIds]) => {
        return this.createLocationModel(cityId, regionIds);
      });
      regionPicker.locations = locations;
    } catch (error) {
      if (error instanceof XhrError) {
        const event = makePublicEvent(DigitalOceanCreateServerApp.EVENT_AUTHORIZATION_ERROR);
        this.dispatchEvent(event);
      } else {
        console.error(`Failed to get list of available regions: ${error}`);
        this.notificationManager.showError('error-do-regions');
      }
    }
  }

  private createServer(digitalOceanServerRepository: ManagedServerRepository, regionId: string):
      Promise<ManagedServer> {
    const serverName = this.makeLocalizedServerName(regionId);
    return digitalOceanServerRepository.createServer(regionId, serverName);
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
