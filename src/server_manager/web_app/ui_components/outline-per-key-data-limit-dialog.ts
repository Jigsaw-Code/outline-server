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
import {PaperDropdownMenuElement} from '@polymer/paper-dropdown-menu/paper-dropdown-menu';
import {PaperInputElement} from '@polymer/paper-input/paper-input';
import {css, customElement, html, internalProperty, LitElement, property} from 'lit-element';

import {COMMON_STYLES} from './cloud-install-styles';
import {DisplayAccessKey, DisplayDataAmount} from './outline-server-view';

/*
  This component is a floating window representing settings specific to individual access keys.
  Its state is dynamically set when it's opened using the open() method instead of with any in-HTML
  attributes.
*/
@customElement('outline-per-key-data-limit-dialog')
export class OutlinePerKeyDataLimitDialog extends LitElement {
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
          font-weight: 500;
          color: rgba(0, 0, 0, 0.87);
          line-height: 24px;
        }

        #menuSection {
          flex: 1;
          padding: 0 78px;
          margin-top: 10px;
        }

        #buttonsSection {
          margin-top: 10px;
          display: flex;
          flex-direction: row-reverse;
        }

        paper-button {
          display: flex;
          height: 36px;
          text-align: center;
        }

        #save {
          background-color: var(--primary-green);
          color: #fff;
        }

        #menu {
          display: flex;
          flex-flow: row nowrap;
        }

        #unitsDropdown {
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
          background-color: var(--background-contrast-color);
          color: #fff;
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
        #unitsDropdown {
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
          <img id="keyIcon" src="../../images/key-avatar.svg" />
          <h3>${this.localize('per-key-data-limit-dialog-title', 'keyName', keyName)}</h3>
        </div>
        <div id="menuSection">
          <paper-checkbox ?checked=${this.showCustomDataLimitDialog} @tap=${
        this.setCustomLimitTapped}>
            ${this.localize('per-key-data-limit-dialog-set-custom')}
          </paper-checkbox>
          <div id="menu" ?hidden=${!this.showCustomDataLimitDialog}>
            <paper-input
              id="dataLimitInput"
              label=${this.localize('per-key-data-limit-dialog-label')}
              always-float-label
              allowed-pattern="[0-9]+"
              value=${this.activeDataLimit()?.value || ''}
              size="7"
            >
            </paper-input>
            <paper-dropdown-menu id="unitsDropdown" noink>
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
        <div id="buttonsSection">
          <paper-button id="save" @tap=${this.saveKeySettings}>${
        this.localize('save')}</paper-button>
          <paper-button @tap=${this.close}>${this.localize('cancel')}</paper-button>
        </div>
      </paper-dialog>
    `;
  }

  private _queryAs<T extends HTMLElement>(selector: string): T {
    return this.shadowRoot.querySelector(selector) as T;
  }

  private _dataLimitValue() {
    return Number(this._queryAs<PaperInputElement>('#dataLimitInput').value);
  }

  private _dataLimitType() {
    return this._queryAs<PaperDropdownMenuElement>('#unitsDropdown').selectedItemLabel as 'GB' |
        'MB';
  }

  private activeDataLimit(): DisplayDataAmount|undefined {
    // Returns the limit which currently is enforced on this key, or undefined if there is none.
    return this.key?.dataLimit || this.serverDefaultLimit;
  }

  private async setCustomLimitTapped() {
    this.showCustomDataLimitDialog = !this.showCustomDataLimitDialog;
    if (this.showCustomDataLimitDialog) {
      await this.updateComplete;
      this._queryAs<HTMLElement>('#dataLimitInput').focus();
    }
  }

  private saveKeySettings() {
    const event = new CustomEvent('SavePerKeyDataLimitRequested', {
      detail: {ui: this},
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
    this._queryAs<PaperDialogElement>('#container').open();
  }

  public close() {
    this._queryAs<PaperDialogElement>('#container').close();
  }
}
