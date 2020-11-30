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

import '@polymer/paper-button/paper-button';
import '@polymer/paper-checkbox/paper-checkbox';
import '@polymer/paper-dialog/paper-dialog';
import '@polymer/paper-dropdown-menu/paper-dropdown-menu';
import '@polymer/paper-input/paper-input';
import '@polymer/paper-item/paper-item';
import '@polymer/paper-listbox/paper-listbox';
import './cloud-install-styles.js';

import {PaperDialogElement} from '@polymer/paper-dialog/paper-dialog';
import {PaperInputElement} from '@polymer/paper-input/paper-input';
import {PaperListboxElement} from '@polymer/paper-listbox/paper-listbox';
import {css, customElement, html, internalProperty, LitElement, property} from 'lit-element';

import {DisplayAccessKey, DisplayDataAmount} from '../ui_components/outline-server-view';

/*
  This component is a floating window representing settings specific to individual access keys.
  Its state is dynamically set when it's opened using the open() method instead of with any in-HTML
  attributes.
*/
@customElement('outline-key-settings')
export class OutlineKeySettings extends LitElement {
  @internalProperty() serverDefaultLimit: DisplayDataAmount = null;
  @internalProperty() showCustomDataLimitDialog = false;

  public key: DisplayAccessKey = null;

  static get styles() {
    return [
      css`
        #container {
          width: 100%;
          display: flex;
          flex-flow: column nowrap;
        }

        /* for now until I make an icon */
        #keyIcon {
          filter: invert(1);
          /* Split the padding evenly between the icon and the section to be bidirectional. */
          padding: 0 12px;
        }

        #headerSection {
          display: flex;
          flex-direction: row;
          padding: 0 12px;
        }

        #headerSection h3 {
          font-size: 18px;
          color: rgba(0, 0, 0, 0.87);
          line-height: 24px;
        }

        .settings-section {
          flex: 1;
          padding: 0 78px;
        }

        .settings-section-title {
          font-weight: 500;
        }

        #dataLimitsMenu {
          display: flex;
          flex-flow: row nowrap;
        }

        #units-dropdown {
          width: 50px;
          padding: 0 10px;
        }
      `,
    ];
  }

  render() {
    // Custom element mixins aren't supported in style()
    return html`
      <style include="cloud-install-styles"></style>
      <style>
        #units-dropdown {
          --paper-input-container-underline: {
            display: none;
          }
          --paper-input-container-underline-focus: {
            display: none;
          }
        }
        #dataLimitInput {
          --paper-input-container-label-focus: {
            color: rgb(123, 123, 123);
          }
        }
      </style>
      <paper-dialog id="container">
        <div id="headerSection">
          <!-- TODO how to get this to work in both the gallery and ui components? -->
          <img id="keyIcon" src="../../images/key-avatar.svg" />
          <h3 class="settings-section-title">Key Settings - ${this.key?.name}</h3>
        </div>
        <div class="settings-section settings-content">
          <div class="settings-section-title">Data Limits</div>
          <paper-checkbox ?checked=${this.showCustomDataLimitDialog} @tap=${
        this.setCustomLimitTapped}>
            Set a custom data limit
          </paper-checkbox>
          <div id="dataLimitsMenu" ?hidden=${!this.showCustomDataLimitDialog}>
            <paper-input id="dataLimitInput" label="Data Limit" always-float-label allowed-pattern="[0-9]+">
              ${this.activeDataLimit()?.value || ''}
            </paper-input>
            <paper-dropdown-menu no-animations noink>
              <paper-listbox id="dataLimitUnits" slot="dropdown-content" attr-for-selected="name" selected="${
        this.activeDataLimit()?.unit || 'GB'}">
                <paper-item name="GB">GB</paper-item>
                <paper-item name="MB">MB</paper-item>
              </paper-listbox>
            </paper-dropdown-menu>
          </div>
        </div>
        <div>3</div>
        <div id="buttons-container">
          <paper-button @tap=${this.saveKeySettings}>Save</paper-button>
          <paper-button @tap=${this.close}>Cancel</paper-button>
        </div>
      </paper-dialog>
    `;
  }

  private _dataLimitValue() {
    return Number((this.shadowRoot.querySelector('#dataLimitInput') as PaperInputElement).value);
  }

  private _dataLimitType() {
    return (this.shadowRoot.querySelector('#dataLimitUnits') as PaperListboxElement).selected as
        'GB' |
        'MB';
  }

  private activeDataLimit() {
    // Returns the limit which currently is enforced on this key, or undefined if there is none.
    return this.key?.dataLimit || this.serverDefaultLimit;
  }

  private setCustomLimitTapped() {
    this.showCustomDataLimitDialog = !this.showCustomDataLimitDialog;
  }

  private saveKeySettings() {
    const event = new CustomEvent('SaveKeySettingsRequested', {
      detail: {keySettings: this},
      // Required for the event to bubble past a shadow DOM boundary
      bubbles: true,
      composed: true
    });
    this.dispatchEvent(event);
  }

  // TODOBEFOREPUSH only send a request if the limit changed
  public dataLimitChanged() {
    // const dataLimitIsSet = this.showCustomDataLimitDialog;
    // // if the key has a limit XOR whether a data limit is set
    // if(!!this.key.dataLimit !== dataLimitIsSet) {
    //   return true;
    // }
    // // if the amount on the input doesn't match key.limit
    return true;
  }

  public dataLimitAmount(): DisplayDataAmount {
    return {unit: this._dataLimitType(), value: this._dataLimitValue()};
  }

  public open(accessKey: DisplayAccessKey, serverDefaultLimit: DisplayDataAmount) {
    this.key = accessKey;
    this.serverDefaultLimit = serverDefaultLimit;
    this.showCustomDataLimitDialog = !!accessKey.dataLimit;
    (this.shadowRoot.querySelector('#container') as PaperDialogElement).open();
  }

  public close() {
    (this.shadowRoot.querySelector('#container') as PaperDialogElement).close();
  }
}
