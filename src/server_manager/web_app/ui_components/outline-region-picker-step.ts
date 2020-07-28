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
import '@polymer/paper-button/paper-button';
import '@polymer/paper-progress/paper-progress';
import '@polymer/iron-icon/iron-icon';
import '@polymer/iron-icons/iron-icons';
import './outline-step-view';

import {css, customElement, html, LitElement, property} from 'lit-element';

import {styleElement} from './cloud-install-styles';

export interface Location {
  id: string;
  name: string;
  flag: string;
  locationId: string;
  available: boolean;
}

@customElement('outline-region-picker-step')
export class OutlineRegionPicker extends LitElement {
  @property({type: Array}) locations: Location[] = [];
  @property({type: String}) selectedLocationId: string;
  @property({type: Boolean}) isServerBeingCreated: boolean;
  @property({type: Function}) localize: Function;

  static get styles() {
    return css`
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
    `;
  }

  render() {
    const styles = styleElement.querySelector('template').content;
    return html`
    ${styles}
    <outline-step-view display-action="">
      <span slot="step-title">${this.localize('region-title')}</span>
      <span slot="step-description">${this.localize('region-description')}</span>
      <span slot="step-action">
        <paper-button id="createServerButton" @tap="${this._handleCreateServerTap}" ?disabled="${
        !this._isCreateButtonEnabled(this.isServerBeingCreated, this.selectedLocationId)}">
          ${this.localize('region-setup')}
        </paper-button>
      </span>
      <div class="card-content" id="cityContainer">
        ${this.locations.map(item => {
      return html`
          <input type="radio" id="card-${item.id}" name="${item.id}" ?disabled="${
          !item.available}" .checked="${
          this._isLocationSelected(
              this.selectedLocationId, item.id)}" @tap="${this._locationSelected}">
          <label for="card-${item.id}" class="city-button">
            <iron-icon icon="check-circle" ?hidden="${
          !this._isLocationSelected(this.selectedLocationId, item.id)}"></iron-icon>
            <img class="flag" src="${item.flag}">
            <div class="city-name">${item.name}</div>
          </label>`;
    })}
      </div>
      <paper-progress .hidden="${
        !this.isServerBeingCreated}" indeterminate="" class="slow"></paper-progress>
    </outline-step-view>
    `;
  }

  init(): void {
    this.isServerBeingCreated = false;
    this.selectedLocationId = null;
  }

  _isLocationSelected(selectedLocationId: string, locationId: string): boolean {
    return selectedLocationId === locationId;
  }

  _isCreateButtonEnabled(isCreatingServer: boolean, selectedLocationId: string): boolean {
    return !isCreatingServer && selectedLocationId != null;
  }

  _locationSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    this.selectedLocationId = inputEl.name;
  }

  _handleCreateServerTap(): void {
    this.isServerBeingCreated = true;
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
