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
import '@polymer/paper-button/paper-button.js';
import '@polymer/paper-progress/paper-progress.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-icons/iron-icons.js';
import './cloud-install-styles.js';
import './outline-step-view.js';

import {html, PolymerElement} from '@polymer/polymer';

export class OutlineRegionPicker extends PolymerElement {
  static get template() {
    return html`
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
        <paper-button id="createServerButton" on-tap="_handleCreateServerTap" disabled\$="[[!_isCreateButtonEnabled(creatingServer, selectedLocationId)]]">
          [[localize('region-setup')]]
        </paper-button>
      </span>
      <div class="card-content" id="cityContainer">
        <template is="dom-repeat" items="{{locations}}">
          <input type="radio" location\$="{{item}}" name="location" id\$="{{item}}" disabled\$="{{!_isLocationAvailable(item)}}" on-change="_locationSelected" \\="">
          <label for\$="{{item}}" class="city-button">
            <iron-icon icon="check-circle" hidden\$="{{!_isLocationSelected(selectedLocationId, item.id)}}"></iron-icon>
            <img class="flag" src\$="{{item.flag}}">
            <div class="city-name">{{item.name}}</div>
          </label>
        </template>
      </div>
      <paper-progress hidden\$="[[!creatingServer]]" indeterminate="" class="slow"></paper-progress>
    </outline-step-view>
    `;
  }

  static get is() {
    return 'outline-region-picker-step';
  }

  static get properties() {
    return {
      locations: {
        type: Array,
        readonly: true,
      },
      selectedLocationId: String,
      creatingServer: {
        type: Boolean,
        value: false,
      },
      localize: {
        type: Function,
        readonly: true,
      },
    };
  }

  init() {
    this._clearSelectedLocation();
  }

  _clearSelectedLocation() {
    this.selectedLocationId = null;
    // Ensure that no radio button is checked.
    const checkedCityElement = this.$.cityContainer.querySelector('input[name="city"]:checked');
    if (checkedCityElement) {
      checkedCityElement.checked = false;
    }
  }

  _isLocationAvailable(location) {
    return location.available;
  }

  _isLocationSelected(selectedLocationId, id) {
    if (!selectedLocationId) {
      return false;
    }
    return selectedLocationId === id;
  }

  _isCreateButtonEnabled(creatingServer, selectedLocationId) {
    return !creatingServer && selectedLocationId;
  }

  _locationSelected(event) {
    this.selectedLocationId = event.model.get('item').id;
  }

  _handleCreateServerTap() {
    const selectedLocation =
        this.locations.find(location => location.id === this.selectedLocationId);
    const params = {
      bubbles: true,
      composed: true,
      detail: {selectedRegionId: selectedLocation.locationId}
    };
    const customEvent = new CustomEvent('RegionSelected', params);
    this.dispatchEvent(customEvent);
  }
}

customElements.define(OutlineRegionPicker.is, OutlineRegionPicker);
