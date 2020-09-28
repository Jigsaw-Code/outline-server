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

import {GcpAccount} from '../../model/gcp_account';
import {OutlineNotificationManager} from '../ui_components/outline-notification-manager';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';

@customElement('gcp-create-server')
export class GcpCreateServer extends LitElement {
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
  async show(account: GcpAccount, retryFn: <T>(fn: () => Promise<T>) => Promise<T>) {
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
      name: cityId,
      flag: 'images/flags/us.png',
      available: regionIds.length > 0,
    };
  }
}