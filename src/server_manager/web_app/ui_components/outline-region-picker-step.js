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
import '@polymer/polymer/polymer-legacy.js';

import '@polymer/paper-button/paper-button.js';
import '@polymer/paper-progress/paper-progress.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-icons/iron-icons.js';
import './cloud-install-styles.js';
import './outline-step-view.js';
import {Polymer} from '@polymer/polymer/lib/legacy/polymer-fn.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';
const FLAG_IMAGE_DIR = 'images/flags';
const flagById = {
  ams: `${FLAG_IMAGE_DIR}/netherlands.png`,
  sgp: `${FLAG_IMAGE_DIR}/singapore.png`,
  blr: `${FLAG_IMAGE_DIR}/india.png`,
  fra: `${FLAG_IMAGE_DIR}/germany.png`,
  lon: `${FLAG_IMAGE_DIR}/uk.png`,
  sfo: `${FLAG_IMAGE_DIR}/us.png`,
  tor: `${FLAG_IMAGE_DIR}/canada.png`,
  nyc: `${FLAG_IMAGE_DIR}/us.png`,
};

Polymer({
  _template: html`
    <style include="cloud-install-styles"></style>

    <style>
      input[type="radio"] {
        display: none;
      }
      input[type="radio"]:checked + label.city-button {
        background-color: rgba(255, 255, 255, 0.08);
        box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2);
        border-radius: 4px;
        border: 1px solid var(--primary-green);
      }
      input[type="radio"] + label.city-button:hover {
        border: 1px solid var(--primary-green);
      }
      input[type="radio"] + label.city-button {
        display: inline-block;
        flex: 1;
        /* Distribute space evenly, accounting for margins, so there are always 4 cards per row. */
        min-width: calc(25% - 24px);
        position: relative;
        margin: 4px;
        padding-top: 24px;
        text-align: center;
        border: 1px solid;
        border-color: rgba(0, 0, 0, 0);
        cursor: pointer;
        transition: 0.5s;
        background: var(--background-contrast-color);
        box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2);
        border-radius: 4px;
      }
      input[type="radio"]:disabled + label.city-button {
        /* TODO(alalama): make it look good and indicate disabled */
        filter: blur(2px);
      }
      .city-name {
        color: var(--light-gray);
        font-size: 16px;
        line-height: 19px;
        padding: 48px 0 24px 0;
      }
      paper-button {
        background: var(--primary-green);
        color: #fff;
        text-align: center;
        font-size: 14px;
      }
      .flag {
        width: 86px;
        height: 86px;
      }
      .card-content {
        display: flex;
        flex-flow: wrap;
        padding-top: 24px;
      }
      iron-icon {
        color: var(--primary-green);
        position: absolute;
        top: 0;
        right: 0;
        margin: 6px;
      }
    </style>
    <outline-step-view display-action="">
      <span slot="step-title">[[localize('region-title')]]</span>
      <span slot="step-description">[[localize('region-description')]]</span>
      <span slot="step-action">
        <paper-button id="createServerButton" on-tap="handleCreateServerTap" disabled\$="[[!isCreateButtonEnabled(creatingServer, selectedCityId)]]">
          [[localize('region-setup')]]
        </paper-button>
      </span>
      <div class="card-content" id="cityContainer">
        <template is="dom-repeat" items="{{cities}}">
          <input type="radio" city\$="{{item}}" name="city" id\$="{{item}}" disabled\$="{{!isAvailable(availableRegionIds, item)}}" on-change="citySelected" \\="">
          <label for\$="{{item}}" class="city-button">
            <iron-icon icon="check-circle" hidden\$="{{!_isSelectedCity(selectedCityId, item)}}"></iron-icon>
            <img class="flag" src\$="{{getFlag(item)}}">
            <div class="city-name">{{getCityName(item, localize)}}</div>
          </label>
        </template>
      </div>
      <paper-progress hidden\$="[[!creatingServer]]" indeterminate="" class="slow"></paper-progress>
    </outline-step-view>
`,

  is: 'outline-region-picker-step',

  properties: {
    cities: {
      type: Array,
      readonly: true,
      value: Object.keys(flagById),
    },
    availableRegionIds: {
      // One-to-one map from cityIds to regionIds.
      type: Object,
      readonly: true,
      value: {},
    },
    selectedCityId: String,
    creatingServer: Boolean,
    localize: {
      type: Function,
      readonly: true,
    },
  },

  handleCreateServerTap: function() {
    this.creatingServer = true;
    this.fire('RegionSelected');
  },

  getCityName: function(cityId, localize) {
    if (!this.localize) {
      return '';
    }
    return this.localize(`city-${cityId}`) || '';
  },

  getFlag: function(cityId) {
    return flagById[cityId] || '';
  },

  isAvailable: function(map, cityId) {
    if (!map) {
      return false;
    }
    return cityId in map;
  },

  citySelected: function(event) {
    this.selectedCityId = event.model.get('item');
  },

  _isSelectedCity: function(selectedCityId, cityId) {
    if (!selectedCityId) {
      return false;
    }
    return selectedCityId === cityId;
  },

  getSelectedRegionId: function() {
    return this.availableRegionIds[this.selectedCityId];
  },

  init: function() {
    this.creatingServer = false;
    this.selectedCityId = null;
    // Ensure that no radio button is checked.
    const checkedCityElement = this.$.cityContainer.querySelector('input[name="city"]:checked');
    if (checkedCityElement) {
      checkedCityElement.checked = false;
    }
  },

  isCreateButtonEnabled: function(creatingServer, selectedCityId) {
    return !creatingServer && selectedCityId;
  }
});
