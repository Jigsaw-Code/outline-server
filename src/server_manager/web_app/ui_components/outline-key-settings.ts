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

import {PaperDialogElement} from '@polymer/paper-dialog/paper-dialog';
import {PaperInputElement} from '@polymer/paper-input/paper-input';
import {PaperListboxElement} from '@polymer/paper-listbox/paper-listbox';
import {css, customElement, html, internalProperty, LitElement, property} from 'lit-element';

import {DisplayAccessKey, DisplayDataAmount} from '../ui_components/outline-server-view';

import {COMMON_STYLES} from './cloud-install-styles';

/*
  This component is a floating window representing settings specific to individual access keys.
  Its state is dynamically set when it's opened using the open() method instead of with any in-HTML
  attributes.
*/
@customElement('outline-key-settings')
export class OutlineKeySettings extends LitElement {
  @internalProperty() serverDefaultLimit: DisplayDataAmount = null;
  @internalProperty() showCustomDataLimitDialog = false;
  @property({type: Function}) localize: Function;

  public key: DisplayAccessKey = null;

  static get styles() {
    return [
      COMMON_STYLES,
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
          margin-top: 10px;
          margin-bottom: 10px;
        }

        .settings-section-title {
          font-weight: 500;
          margin-bottom: 10px;
        }

        #dataLimitsMenu {
          display: flex;
          flex-flow: row nowrap;
        }

        #dataLimitUnits {
          width: 50px;
          padding: 0 10px;
        }

        paper-checkbox {
          /* We want the ink to be the color we're going to, not coming from */
          --paper-checkbox-checked-color: var(--primary-green);
          --paper-checkbox-checked-ink-color: var(--dark-gray);
          --paper-checkbox-unchecked-color: var(--dark-gray);
          --paper-checkbox-unchecked-ink-color: var(--primary-green);
        }

        paper-listbox paper-item:hover {
          cursor: pointer;
          background-color: #eee;
        }
      `,
    ];
  }

  render() {
    // this.key will always be defined once the dialog is open, but before it's opened we get an
    // error if we don't account for the undefined key
    const keyName = this.key?.name || this.key?.placeholderName;
    return html`
      <style>
        /* Custom element mixins with brackets don't work in style() */
        #dataLimitUnits {
          --paper-input-container-underline: {
            display: none;
          }
          --paper-input-container-underline-focus: {
            display: none;
          }
        }
        paper-input {
          --paper-input-container-label-focus: {
            color: rgb(123, 123, 123);
          }
        }
      </style>
      <paper-dialog id="container">
        <div id="headerSection">
          <!-- TODO how to get this to work in both the gallery and ui components? -->
          <img id="keyIcon" src="../../images/key-avatar.svg" />
          <h3 class="settings-section-title">${
        this.localize('key-settings-title', 'keyName', keyName)}</h3>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">${
        this.localize('key-settings-data-limits-title')}</div>
          <paper-checkbox ?checked=${this.showCustomDataLimitDialog} @tap=${
        this.setCustomLimitTapped}>
            ${this.localize('key-settings-set-custom')}
          </paper-checkbox>
          <div id="dataLimitsMenu" ?hidden=${!this.showCustomDataLimitDialog}>
            <paper-input
              id="dataLimitInput"
              label=${this.localize('key-settings-data-limit-label')}
              always-float-label
              allowed-pattern="[0-9]+"
              value=${this.activeDataLimit()?.value || ''}
              size="7"
            >
            </paper-input>
            <paper-dropdown-menu id="dataLimitUnits" no-animations noink>
              <paper-listbox
                slot="dropdown-content"
                attr-for-selected="name"
                selected="${this.activeDataLimit()?.unit || 'GB'}"
              >
                <paper-item name="GB">GB</paper-item>
                <paper-item name="MB">MB</paper-item>
              </paper-listbox>
            </paper-dropdown-menu>
          </div>
        </div>
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

  private async setCustomLimitTapped() {
    this.showCustomDataLimitDialog = !this.showCustomDataLimitDialog;
    if (this.showCustomDataLimitDialog) {
      await this.updateComplete;
      (this.shadowRoot.querySelector('#dataLimitInput') as HTMLElement).focus();
    }
  }

  private saveKeySettings() {
    const event = new CustomEvent('SaveKeySettingsRequested', {
      detail: {keySettings: this},
      // Required for the event to bubble past a shadow DOM boundary
      bubbles: true,
      composed: true,
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
