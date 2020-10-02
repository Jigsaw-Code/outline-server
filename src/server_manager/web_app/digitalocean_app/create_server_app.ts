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
import {EventEmitter} from 'eventemitter3';
import {customElement, html, LitElement, property} from 'lit-element';

import * as digitalocean_server from '../digitalocean_server';
import {ManagedServer, ManagedServerRepository, RegionId} from '../../model/server';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';
import {makePublicEvent} from "../../infrastructure/dom_events";

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

@customElement('digitalocean-create-server')
export class DigitalOceanCreateServer extends LitElement {
  // External events
  public static EVENT_SERVER_CREATED = 'DigitalOceanCreateServer#ServerCreated';
  public static EVENT_AUTHORIZATION_ERROR = 'DigitalOceanCreateServer#AuthorizationError';
  // Internal events
  private static EVENT_CREATE_SERVER_REQUESTED = 'DigitalOceanCreateServer#_RequestCreateServer';

  @property({type: Function}) localize: Function;
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;

  private eventEmitter = new EventEmitter();

  constructor() {
    super();
    this.addEventListener(OutlineRegionPicker.EVENT_REGION_SELECTED, (event: CustomEvent) => {
      this.eventEmitter.emit(DigitalOceanCreateServer.EVENT_CREATE_SERVER_REQUESTED, event.detail.regionId);
    });
  }

  render() {
    return html`<outline-region-picker-step .localize=${this.localize}></outline-region-picker-step>`;
  }

  async start(digitalOceanServerRepository: ManagedServerRepository): Promise<void> {
    await this.showRegionPicker(digitalOceanServerRepository);

    this.eventEmitter.once(DigitalOceanCreateServer.EVENT_CREATE_SERVER_REQUESTED, async (regionId) => {
      const server = this.createServer(digitalOceanServerRepository, regionId);
      const event = makePublicEvent(DigitalOceanCreateServer.EVENT_SERVER_CREATED, { server });
      this.dispatchEvent(event);
      // TODO: Add create server failed event
    });

    return;
  }

  private async showRegionPicker(digitalOceanServerRepository: ManagedServerRepository): Promise<void> {
    const regionPicker = this.shadowRoot.querySelector('outline-region-picker-step') as OutlineRegionPicker;
    regionPicker.reset();

    try {
      // TODO: Catch and rethrow authorization error
      const regionMap = await digitalOceanServerRepository.getRegionMap();
      const locations = Object.entries(regionMap).map(([cityId, regionIds]) => {
        return this.createLocationModel(cityId, regionIds);
      });
      regionPicker.locations = locations;
    } catch (err) {
      console.error(`Failed to get list of available regions: ${err}`);
      this.notificationManager.showError(this.localize('error-do-regions'));
    }
  }

  private createServer(digitalOceanServerRepository: ManagedServerRepository, regionId: string): Promise<ManagedServer> {
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
