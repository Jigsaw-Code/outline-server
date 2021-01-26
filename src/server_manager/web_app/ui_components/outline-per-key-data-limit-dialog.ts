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

import {PaperButtonElement} from '@polymer/paper-button/paper-button';
import {PaperDialogElement} from '@polymer/paper-dialog/paper-dialog';
import {PaperDropdownMenuElement} from '@polymer/paper-dropdown-menu/paper-dropdown-menu';
import {PaperInputElement} from '@polymer/paper-input/paper-input';
import {PaperListboxElement} from '@polymer/paper-listbox/paper-listbox';
import {css, customElement, html, internalProperty, LitElement, property} from 'lit-element';

import {COMMON_STYLES} from './cloud-install-styles';
import {DisplayAccessKey, DisplayDataAmount} from './outline-server-view';

/**
 * A floating window representing settings specific to individual access keys. Its state is
 * dynamically set when opened using the open() method instead of with any in-HTML attributes.
 *
 * This element relies on conceptual separation of the data limit as input by the user, the data
 * limit of the UI key, and the actual data limit as saved on the server.  App controls the UI data
 * limit and the request to the server, and the display key in the element is never itself changed.
 */
@customElement('outline-per-key-data-limit-dialog')
export class OutlinePerKeyDataLimitDialog extends LitElement {
  /** @member key The UI access key representing the key we're working on. */
  @internalProperty() key: DisplayAccessKey = null;
  /** @member key The default data limit of the server we're working on, or null */
  @internalProperty() serverDefaultLimit: DisplayDataAmount = null;
  /**
   * @member showMenu Whether the menu for inputting the data limit should be shown. Controlled by
   * the checkbox.
   */
  @internalProperty() showMenu = false;
  /**
   * @member enableSave Whether the save button is enabled.  Controlled by the validator on the
   * input.
   */
  @internalProperty() enableSave = false;
  @property({type: Function}) localize: Function;

  static get styles() {
    return [
      COMMON_STYLES,
      css`
        #container {
          width: 100%;
          display: flex;
          flex-flow: column nowrap;
        }

        #dataLimitIcon {
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

        #save[disabled] {
          color: var(--dark-gray);
          background-color: rgba(0, 0, 0, 0.13);
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
          <iron-icon id="dataLimitIcon" icon="icons:perm-data-setting"></iron-icon>
          <h3>${this.localize('per-key-data-limit-dialog-title', 'keyName', keyName)}</h3>
        </div>
        <div id="menuSection">
          <paper-checkbox ?checked=${this.showMenu} @tap=${this._setCustomLimitTapped}>
            ${this.localize('per-key-data-limit-dialog-set-custom')}
          </paper-checkbox>
          <div id="menu" ?hidden=${!this.showMenu}>
            <paper-input
              id="dataLimitInput"
              label=${this.localize('data-limit')}
              always-float-label
              allowed-pattern="[0-9\\.]"
              pattern="[0-9]+(\\.[0-9]*)?"
              auto-validate
              value=${this._initialValue()}
              size="7"
              @keyup=${this._setSaveButtonDisabledState}
            >
            </paper-input>
            <paper-dropdown-menu id="unitsDropdown" noink>
              <paper-listbox
                id="unitsListbox"
                slot="dropdown-content"
                attr-for-selected="name"
                selected="${this._initialUnit()}"
              >
                <paper-item name="GB">GB</paper-item>
                <paper-item name="MB">MB</paper-item>
              </paper-listbox>
            </paper-dropdown-menu>
          </div>
        </div>
        <div id="buttonsSection">
          <paper-button id="save" ?disabled=${!this.enableSave} @tap=${this._sendSaveEvent}>${
        this.localize('save')}</paper-button>
          <paper-button @tap=${this.close}>${this.localize('cancel')}</paper-button>
        </div>
      </paper-dialog>
    `;
  }

  private _queryAs<T extends HTMLElement>(selector: string): T {
    return this.shadowRoot.querySelector(selector) as T;
  }

  private get _input(): PaperInputElement {
    return this._queryAs<PaperInputElement>('#dataLimitInput');
  }

  private _dataLimitValue() {
    return Number(this._input.value);
  }

  private _dataLimitType() {
    return this._queryAs<PaperDropdownMenuElement>('#unitsDropdown').selectedItemLabel as 'GB' |
        'MB';
  }

  private _initialUnit() {
    return this._activeDataLimit()?.unit || 'GB';
  }

  private _initialValue() {
    return this._activeDataLimit()?.value.toString() || '';
  }

  private _activeDataLimit(): DisplayDataAmount|undefined {
    // Returns the limit which currently is enforced on this key, or undefined if there is none.
    return this.key?.dataLimit || this.serverDefaultLimit;
  }

  private async _setCustomLimitTapped() {
    this.showMenu = !this.showMenu;
    if (this.showMenu) {
      await this.updateComplete;
      this._input.focus();
    }
  }

  private _setSaveButtonDisabledState() {
    this.enableSave = !this._input.invalid;
  }

  private _sendSaveEvent() {
    const change = this._dataLimitChange();
    const eventName = `${change === Change.REMOVED ? 'Remove' : 'Save'}PerKeyDataLimitRequested`;

    this.dispatchEvent(new CustomEvent(eventName, {
      detail: {ui: this},
      // Required for the event to bubble past a shadow DOM boundary
      bubbles: true,
      composed: true,
    }));
  }

  /**
   * Calculates what type of change, or none at all, the user made.
   */
  private _dataLimitChange(): Change {
    const keyLimit = this.key?.dataLimit;
    if (this.showMenu) {
      if (!keyLimit) {
        return Change.SET;
      }
      const inputLimit = this.inputDataLimit();
      if (inputLimit.value !== keyLimit.value || inputLimit.unit !== keyLimit.unit) {
        return Change.SET;
      }
      return Change.UNCHANGED;
    }
    // If we unchecked, then the key will have an active data limit.
    if (keyLimit) {
      return Change.REMOVED;
    }
    return Change.UNCHANGED;
  }

  /**
   * Returns true if the data limit was changed by the user.
   */
  public dataLimitChanged() {
    return this._dataLimitChange() !== Change.UNCHANGED;
  }

  /**
   * The current data limit as input by the user, but not necessarily as saved.
   */
  public inputDataLimit(): DisplayDataAmount {
    return this.showMenu ? {unit: this._dataLimitType(), value: this._dataLimitValue()} : null;
  }

  /**
   * The ID of the key being worked on.  Useful for making API requests for the given key.
   */
  public keyId() {
    return this.key.id;
  }

  /**
   * Opens the dialog to display data limit information about the given key
   *
   * @param accessKey - The access key row from outline-server-view representing the key to work on
   * @param serverDefaultLimit - The default data limit for the server, or null if there is none
   */
  public open(accessKey: DisplayAccessKey, serverDefaultLimit: DisplayDataAmount) {
    this.key = accessKey;
    this.serverDefaultLimit = serverDefaultLimit;
    this.showMenu = !!accessKey.dataLimit;
    this._queryAs<PaperDialogElement>('#container').open();
  }

  /**
   * Sets the input state of the dialog back to what it was when it was first opened.
   */
  public reset() {
    this.showMenu = !!this.key?.dataLimit;
    // Manually reset the value to clear user input
    this._input.value = this._initialValue();
    this._queryAs<PaperListboxElement>('#unitsListbox').select(this._initialUnit());
  }

  /**
   * Closes the dialog.
   */
  public close() {
    this._queryAs<PaperDialogElement>('#container').close();
  }
}

enum Change {
  SET,        // A data limit was added or the existing data limit changed
  REMOVED,    // The data limit for the key was removed
  UNCHANGED,  // No functional change happened.
}
