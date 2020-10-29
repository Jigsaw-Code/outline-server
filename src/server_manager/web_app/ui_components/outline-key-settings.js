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

import {css, html, LitElement} from "lit-element";
import {COMMON_STYLES} from "./cloud-install-styles";
import "@polymer/paper-checkbox/paper-checkbox";
import "@polymer/paper-dialog/paper-dialog";
import "@polymer/paper-dropdown-menu/paper-dropdown-menu";
import "@polymer/paper-input/paper-input";
import "@polymer/paper-item/paper-item";
import "@polymer/paper-listbox/paper-listbox";

/*
  This component is a floating window representing settings specific to individual access keys.
*/
export class OutlineKeySettings extends LitElement {
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
        #key-icon {
          filter: invert(1);
          /* Split the padding evenly between the icon and the section to be bidirectional. */
          padding: 0 12px;
        }

        #header-section {
          display: flex;
          flex-direction: row;
          padding: 0 12px;
        }

        #header-section h3 {
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

        #data-limits-menu {
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

  constructor() {
    super();
    this.keyName = "default key name";
    this.serverDefaultLimit = 50;
    this.serverDefaultLimitUnits = "GB";
    this.customLimit = 50;
    this.customLimitUnits = "GB";
    this.showCustomDataLimitDialog = false;
  }

  static get properties() {
    return {
      keyName: { type: String },
      serverDefaultLimit: { type: Number },
      serverDefaultLimitUnit: { type: String },
      customLimit: { type: Number },
      customLimitUnit: { type: String },
      showCustomDataLimitDialog: { type: Boolean }
    }
  }

  render() {
    return html`
    <style>
    #units-dropdown {
      --paper-input-container-underline: {
        display: none;
      };
      --paper-input-container-underline-focus: {
        display: none;
      };
    }
    #data-limit-input {
      --paper-input-container-label-focus: {
        color: rgb(123, 123, 123);
        
      };
    }
    </style>
      <paper-dialog id="container">
        <div id="header-section">
          <!-- TODO how to get this to work in both the gallery and ui components? -->
          <img id="key-icon" src="../../images/key-avatar.svg">
          <h3 class="settings-section-title"> Key Settings - ${this.keyName}</h3>
        </div>
        <div class="settings-section settings-content">
          <div class="settings-section-title">Data Limits</div>
          <paper-checkbox ?checked="${this.showCustomDataLimitDialog}" @tap=${this._overrideDefaultTapped}>
            Override server default (${this.serverDefaultLimit} ${this.serverDefaultLimitUnits})
          </paper-checkbox>
          <div id="data-limits-menu" ?hidden="${!this.showCustomDataLimitDialog}">
            <paper-input id="data-limit-input" label="Data Limit" always-float-label type="number" size="5">${this.customLimit}</paper-input>
            <paper-dropdown-menu id="units-dropdown" no-animations noink>
              <paper-listbox slot="dropdown-content" attr-for-selected="name" selected="${this.customLimitUnits}">
                <paper-item name="GB">GB</paper-item>
                <paper-item name="MB">MB</paper-item>
              </paper-listbox>
            </paper-dropdown-menu>
          </div>

        </div>
        <div>3</div>
        <div>4</div>
      </paper-dialog>
    `;
  }

  _overrideDefaultTapped() {
    this.showCustomDataLimitDialog = !this.showCustomDataLimitDialog;
  }

  open() {
    this.shadowRoot.querySelector("#container").open();
  }
}

customElements.define("outline-key-settings", OutlineKeySettings);
