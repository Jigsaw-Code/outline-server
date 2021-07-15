/*
  Copyright 2021 The Outline Authors

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

import '@polymer/paper-input/paper-input';

import {customElement, html, LitElement, property} from 'lit-element';

import {COMMON_STYLES} from './cloud-install-styles';
import {CloudLocation} from '../../model/location';
import {getShortName} from '../location_formatting';
import {SETTINGS_STYLES} from './outline-server-settings-styles';

/** Setting card for displaying DigitalOcean-specific info */
@customElement('outline-do-info-setting')
export class OutlineDoInfoSetting extends LitElement {
  static get styles() {
    return [COMMON_STYLES];
  }

  @property({type: String}) serverMonthlyCost: string;
  @property({type: String}) serverMonthlyTransferLimit: string;
  @property({type: Object}) cloudLocation: CloudLocation;
  @property({type: Function}) localize: (id: string) => string;

  render() {
    return html`
      <!-- We need to use <style> because lit-element doesn't support CSS mixins,
           which are required to customize the appearance of <paper-input>.
           See https://github.com/lit/lit-element/issues/633. -->
      <style>${SETTINGS_STYLES}</style>
      <div class="setting card-section">
        <img class="setting-icon" src="images/do_white_logo.svg">
        <div>
          <h3>DigitalOcean</h3>
          <paper-input readonly always-float-label maxlength="100"
              .value="${getShortName(this.cloudLocation, this.localize)}"
              .label="${this.localize('settings-server-location')}"
              .hidden="${!this.cloudLocation}"></paper-input>
          <paper-input readonly always-float-label maxlength="100"
              .value="${this.serverMonthlyCost}"
              .label="${this.localize('settings-server-cost')}"
              .hidden="${!this.serverMonthlyCost}"></paper-input>
          <paper-input readonly always-float-label maxlength="100"
              .value="${this.serverMonthlyTransferLimit}"
              .label="${this.localize('settings-transfer-limit')}"
              .hidden="${!this.serverMonthlyTransferLimit}"></paper-input>
        </div>
      </div>`;
  }
}
