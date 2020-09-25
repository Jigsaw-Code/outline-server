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
import {customElement, html, LitElement, property} from 'lit-element';

import {DigitalOceanAccount} from '../../model/digitalocean_account';
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

@customElement('digital-ocean-create-server')
export class DigitalOceanCreateServer extends LitElement {
  @property({type: Function}) localize: Function;
  @property({type: Object}) notificationManager: OutlineNotificationManager = null;

  render() {
    return html`
        <outline-region-picker-step id="regionPicker" 
            .localize=${this.localize}></outline-region-picker-step>
    `;
  }

  // The region picker initially shows all options as disabled. Options are enabled by this code,
  // after checking which regions are available.
  async show(account: DigitalOceanAccount, retryFn: <T>(fn: () => Promise<T>) => Promise<T>) {
    const regionPicker = this.shadowRoot.querySelector('#regionPicker') as OutlineRegionPicker;
    regionPicker.reset();

    try {
      const map = await retryFn(() => account.getRegionMap());
      const locations = Object.entries(map).map(([cityId, regionIds]) => {
        return this.createLocationModel(cityId, regionIds);
      });
      regionPicker.locations = locations;
    } catch (err) {
      console.error(`Failed to get list of available regions: ${err}`);
      this.notificationManager.showError(this.localize('error-do-regions'));
    }
  }

  private createLocationModel(cityId: string, regionIds: string[]): Location {
    return {
      id: regionIds.length > 0 ? regionIds[0] : null,
      name: this.localize(`city-${cityId}`),
      flag: DIGITALOCEAN_FLAG_MAPPING[cityId] || '',
      available: regionIds.length > 0,
    };
  }
}
