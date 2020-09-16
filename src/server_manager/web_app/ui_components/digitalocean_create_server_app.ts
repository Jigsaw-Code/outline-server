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
import {customElement, LitElement, property} from 'lit-element';
import {App, NotificationManager} from "../app";
import * as server from "../../model/server";
import {Location, OutlineRegionPicker} from "./outline-region-picker-step";

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

@customElement('digital-ocean-create-server')
export class DigitalOceanCreateServer extends LitElement {
  @property({type: Function}) localize: Function;
  @property({type: Object}) app: App = null;
  @property({type: Object}) digitalOceanRepository: server.ManagedServerRepository = null;
  @property({type: Object}) notificationManager: NotificationManager = null;

  private regionPicker: OutlineRegionPicker;

  // @ts-ignore
  firstUpdated(_changedProperties) {
    super.firstUpdated(_changedProperties);

    this.regionPicker = new OutlineRegionPicker();
    this.regionPicker.localize = this.localize;
    this.shadowRoot.appendChild(this.regionPicker);
    this.requestUpdate();
  }

  private createLocationModel(cityId: string, regionIds: string[]): Location {
    return {
      id: regionIds.length > 0 ? regionIds[0] : null,
      name: this.localize(`city-${cityId}`),
      flag: DIGITALOCEAN_FLAG_MAPPING[cityId] || '',
      available: regionIds.length > 0,
    };
  }

  // The region picker initially shows all options as disabled. Options are enabled by this code,
  // after checking which regions are available.
  async show() {
    this.regionPicker.reset();
    try {
      const map = await this.app.digitalOceanRetry(() => this.digitalOceanRepository.getRegionMap());
      console.log(map);
      const locations = Object.entries(map).map(([cityId, regionIds]) => {
        return this.createLocationModel(cityId, regionIds);
      });
      console.log(locations);
      // const regionPicker = this.shadowRoot.querySelector('#regionPicker') as OutlineRegionPicker;
      this.regionPicker.locations = locations;
    } catch (err) {
      console.error(`Failed to get list of available regions: ${err}`);
      this.notificationManager.showError(this.localize('error-do-regions'));
    }
  }
}
