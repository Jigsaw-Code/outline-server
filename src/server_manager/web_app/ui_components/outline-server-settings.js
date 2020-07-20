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
import '@polymer/paper-checkbox/paper-checkbox.js';
import '@polymer/paper-dropdown-menu/paper-dropdown-menu.js';
import '@polymer/paper-input/paper-input.js';
import './cloud-install-styles.js';
import './outline-server-settings-styles.js';
import './outline-iconset.js';
import './outline-validated-input.js';
import {Polymer} from '@polymer/polymer/lib/legacy/polymer-fn.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';

Polymer({
  _template: html`
    <style include="cloud-install-styles"></style>
    <style include="outline-server-settings-styles"></style>
    <style>
      .content {
        flex-grow: 1;
      }
      .setting {
        padding: 24px;
        align-items: flex-start;
      }
      .setting:not(:first-child) {
        margin-top: 8px;
      }
      .setting-icon,
      img.setting-icon {
        margin-right: 24px;
        color: #fff;
        opacity: 0.87;
      }
      .setting > div {
        width: 100%;
      }
      .setting h3 {
        margin: 0 0 16px 0;
        padding: 0;
        color: #fff;
        font-size: 16px;
        width: 100%;
      }
      .setting p {
        margin-bottom: 12px;
        width: 60%;
        color: var(--medium-gray);
      }
      #experiments p {
        width: 80%;
      }
      #experiments .sub-section p {
        width: 100%;
      }
      .sub-section {
        background: var(--border-color);
        padding: 16px;
        margin: 24px 0;
        display: flex;
        align-items: center;
        border-radius: 2px;
      }
      .sub-section iron-icon {
        margin-right: 16px;
      }
      .selection-container {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .selection-container > .content {
        flex: 4;
      }
      .selection-container > paper-dropdown-menu {
        flex: 1;
      }
      .data-limits-input {
        display: flex;
        align-items: center;
      }
      .data-limits-input paper-input:not([readonly]) {
        width: auto;
        --paper-input-container: {
          width: 120px;
        }
      }
      .data-limits-disclaimer {
        margin: 0 0 8px 0;
      }
      .data-limits-disclaimer p {
        width: 100%;
      }
      .detail {
        margin-top: 0px;
        font-size: 12px;
      }
      paper-input:not([readonly]) {
        width: 60%;
      }
      paper-dropdown-menu {
        border: 1px solid var(--medium-gray);
        border-radius: 4px;
        max-width: 150px;
        --paper-input-container: {
          padding: 0 4px;
          text-align: center;
        }
        --paper-input-container-input: {
          color: var(--medium-gray);
          font-size: 14px;
        }
        --paper-dropdown-menu-ripple: {
          display: none;
        }
        --paper-input-container-underline: {
          display: none;
        }
        --paper-input-container-underline-focus: {
          display: none;
        }
      }
      .data-limits-input paper-dropdown-menu {
        border: none;
        --paper-input-container: {
          width: 64px;
        }
      }
      paper-listbox paper-item {
        font-size: 14px;
      }
      paper-listbox paper-item:hover {
        cursor: pointer;
        background-color: #eee;
      }
      #data-limits-container .selection-container p {
        margin: 0 0 24px 0;
        width: 80%;
      }
      #data-limits-container .selection-container span {
        display: block;
        margin-top: 6px;
      }
      paper-checkbox {
        /* We want the ink to be the color we're going to, not coming from */
        --paper-checkbox-checked-color: var(--primary-green);
        --paper-checkbox-checked-ink-color: var(--dark-gray);
        --paper-checkbox-unchecked-color: var(--light-gray);
        --paper-checkbox-unchecked-ink-color: var(--primary-green);
      }
      .selection-container paper-checkbox {
        margin-right: 4px;
      }
    </style>
    <div class="container">
      <div class="content">
        <!-- DO information -->
        <div class="setting card-section" hidden\$="[[!isServerManaged]]">
          <img class="setting-icon digital-ocean-icon" src="images/do_white_logo.svg">
          <div>
            <h3>DigitalOcean</h3>
            <paper-input readonly="" value="[[serverLocation]]" label="[[localize('settings-server-location')]]" hidden\$="[[!serverLocation]]" always-float-label="" maxlength="100"></paper-input>
            <paper-input readonly="" value="[[serverMonthlyCost]] USD" label="[[localize('settings-server-cost')]]" hidden\$="[[!serverMonthlyCost]]" always-float-label="" maxlength="100"></paper-input>
            <paper-input readonly="" value="[[serverMonthlyTransferLimit]]" label="[[localize('settings-transfer-limit')]]" hidden\$="[[!serverMonthlyTransferLimit]]" always-float-label="" maxlength="100"></paper-input>
          </div>
        </div>
        <div class="setting card-section">
          <iron-icon class="setting-icon" icon="outline-iconset:outline"></iron-icon>
          <div>
            <h3>[[localize('settings-server-info')]]</h3>
            <!-- TODO: consider making this an outline-validated-input -->
            <paper-input id="serverNameInput" class="server-name" value="{{serverName}}" label="[[localize('settings-server-name')]]" always-float-label="" maxlength="100" on-keydown="_handleNameInputKeyDown" on-blur="_handleNameInputBlur"></paper-input>
            <p class="detail">[[localize('settings-server-rename')]]</p>
            <outline-validated-input editable="[[isAccessKeyPortEditable]]" visible="[[serverPortForNewAccessKeys]]" label="[[localize('settings-access-key-port')]]" allowed-pattern="[0-9]{1,5}" max-length="5" value="[[serverPortForNewAccessKeys]]" client-side-validator="[[_validatePort]]" event="ChangePortForNewAccessKeysRequested" localize="[[localize]]"></outline-validated-input>
            <outline-validated-input editable="[[isHostnameEditable]]" visible="[[serverHostname]]" label="[[localize('settings-server-hostname')]]" max-length="253" value="[[serverHostname]]" event="ChangeHostnameForAccessKeysRequested" localize="[[localize]]"></outline-validated-input>
            <paper-input readonly="" value="[[serverManagementApiUrl]]" label="[[localize('settings-server-api-url')]]" hidden\$="[[!serverManagementApiUrl]]" always-float-label="" maxlength="100"></paper-input>
            <paper-input readonly="" value="[[serverCreationDate]]" label="[[localize('settings-server-creation')]]" hidden\$="[[!serverCreationDate]]" always-float-label="" maxlength="100"></paper-input>
            <paper-input readonly="" value="[[serverId]]" label="[[localize('settings-server-id')]]" hidden\$="[[!serverId]]" always-float-label="" maxlength="100"></paper-input>
            <paper-input readonly="" value="[[serverVersion]]" label="[[localize('settings-server-version')]]" hidden\$="[[!serverVersion]]" always-float-label="" maxlength="100"></paper-input>
          </div>
        </div>
        <!-- Data limits -->
        <div class="setting card-section" hidden\$="[[!supportsAccessKeyDataLimit]]">
          <iron-icon class="setting-icon" icon="icons:perm-data-setting"></iron-icon>
          <div id="data-limits-container">
            <div class="selection-container">
              <div class="content">
                <h3>[[localize('data-limits')]]</h3>
                <p>[[localize('data-limits-description')]]</p>
              </div>
              <!-- NOTE: The dropdown is not automatically sized to the button's width:
                           https://github.com/PolymerElements/paper-dropdown-menu/issues/229 -->
              <paper-dropdown-menu no-label-float="" horizontal-align="left">
                <paper-listbox slot="dropdown-content" selected="{{_computeDataLimitsEnabledName(isAccessKeyDataLimitEnabled)}}" attr-for-selected="name" on-selected-changed="_accessKeyDataLimitEnabledChanged">
                  <paper-item name="enabled">[[localize('enabled')]]</paper-item>
                  <paper-item name="disabled">[[localize('disabled')]]</paper-item>
                </paper-listbox>
              </paper-dropdown-menu>
            </div>
            <div class="sub-section data-limits-disclaimer" hidden\$="[[!showFeatureMetricsDisclaimer]]">
              <iron-icon icon="icons:error-outline"></iron-icon>
              <p inner-h-t-m-l="[[localize('data-limits-disclaimer', 'openLink', '<a href=https://s3.amazonaws.com/outline-vpn/index.html#/en/support/dataCollection>', 'closeLink', '</a>')]]"></p>
            </div>
            <div class="data-limits-input" hidden\$="[[!isAccessKeyDataLimitEnabled]]">
              <paper-input id="accessKeyDataLimitInput" value="[[accessKeyDataLimit.value]]" label="Data limit per key" always-float-label="" allowed-pattern="[0-9]+" required="" auto-validate="" maxlength="9" on-keydown="_handleAccessKeyDataLimitInputKeyDown" on-blur="_requestSetAccessKeyDataLimit"></paper-input>
              <paper-dropdown-menu no-label-float="">
                <paper-listbox id="accessKeyDataLimitUnits" slot="dropdown-content" selected="[[accessKeyDataLimit.unit]]" attr-for-selected="name" on-selected-changed="_requestSetAccessKeyDataLimit">
                  <paper-item name="MB">MB</paper-item>
                  <paper-item name="GB">GB</paper-item>
                </paper-listbox>
              </paper-dropdown-menu>
            </div>
          </div>
        </div>
        <!-- Experiments -->
        <div id="experiments" class="setting card-section" hidden\$="[[!shouldShowExperiments]]">
          <iron-icon class="setting-icon" icon="icons:build"></iron-icon>
          <div>
            <h3>[[localize('experiments')]]</h3>
            <p>[[localize('experiments-description')]]</p>
            <div class="sub-section">
              <iron-icon icon="icons:error-outline"></iron-icon>
              <p inner-h-t-m-l="[[localize('experiments-disclaimer', 'openLink', '<a href=https://s3.amazonaws.com/outline-vpn/index.html#/en/support/dataCollection>', 'closeLink', '</a>')]]"></p>
            </div>
          </div>
        </div>
        <!-- Metrics controls -->
        <div class="setting card-section">
          <iron-icon class="setting-icon" icon="editor:insert-chart"></iron-icon>
          <div>
            <div class="selection-container">
              <paper-checkbox checked="{{metricsEnabled}}" on-change="_metricsEnabledChanged"></paper-checkbox>
              <h3>[[localize('settings-metrics-header')]]</h3>
            </div>
            <p inner-h-t-m-l="[[localize('metrics-description', 'openLink', '<a href=https://s3.amazonaws.com/outline-vpn/index.html#/en/support/dataCollection>', 'closeLink', '</a>')]]"></p>
          </div>
        </div>
      </div>
    </div>
`,

  is: 'outline-server-settings',

  properties: {
    isServerManaged: Boolean,
    serverName: String,
    metricsEnabled: Boolean,
    // Initialize to null so we can use the hidden attribute, which does not work well with
    // undefined values.
    serverId: {type: String, value: null},
    serverHostname: {type: String, value: null},
    serverManagementApiUrl: {type: String, value: null},
    serverPortForNewAccessKeys: {type: Number, value: null},
    serverVersion: {type: String, value: null},
    isAccessKeyPortEditable: {type: Boolean, value: false},
    isAccessKeyDataLimitEnabled: {type: Boolean, notify: true},
    accessKeyDataLimit: {type: Object, value: null},  // type: app.DisplayDataAmount
    supportsAccessKeyDataLimit:
        {type: Boolean, value: false},  // Whether the server supports data limits.
    showFeatureMetricsDisclaimer: {type: Boolean, value: false},
    isHostnameEditable: {type: Boolean, value: true},
    serverCreationDate: {type: String, value: null},
    serverLocation: {type: String, value: null},
    serverMonthlyCost: {type: String, value: null},
    serverMonthlyTransferLimit: {type: String, value: null},
    localize: {type: Function, readonly: true},
    shouldShowExperiments: {type: Boolean, value: false},
  },

  setServerName: function(name) {
    this.initialName = name;
    this.name = name;
  },

  _handleNameInputKeyDown: function(event) {
    if (event.key === 'Escape') {
      this.serverName = this.initialName;
      this.$.serverNameInput.blur();
    } else if (event.key === 'Enter') {
      this.$.serverNameInput.blur();
    }
  },

  _handleNameInputBlur: function(event) {
    const newName = this.serverName;
    if (!newName) {
      this.serverName = this.initialName;
      return;
    }
    // Fire signal if name has changed.
    if (newName !== this.initialName) {
      this.fire('ServerRenameRequested', {newName});
    }
  },

  _metricsEnabledChanged: function() {
    const metricsSignal =
        this.metricsEnabled ? 'EnableMetricsRequested' : 'DisableMetricsRequested';
    this.fire(metricsSignal);
  },

  _accessKeyDataLimitEnabledChanged: function(e) {
    const wasDataLimitEnabled = this.isAccessKeyDataLimitEnabled;
    const isDataLimitEnabled = e.detail.value === 'enabled';
    if (isDataLimitEnabled === undefined || wasDataLimitEnabled === undefined) {
      return;
    } else if (isDataLimitEnabled === wasDataLimitEnabled) {
      return;
    }
    this.isAccessKeyDataLimitEnabled = isDataLimitEnabled;
    if (isDataLimitEnabled) {
      this._requestSetAccessKeyDataLimit();
    } else {
      this.fire('RemoveAccessKeyDataLimitRequested');
    }
  },

  _handleAccessKeyDataLimitInputKeyDown: function(event) {
    if (event.key === 'Escape') {
      this.$.accessKeyDataLimitInput.value = this.accessKeyDataLimit.value;
      this.$.accessKeyDataLimitInput.blur();
    } else if (event.key === 'Enter') {
      this.$.accessKeyDataLimitInput.blur();
    }
  },

  _requestSetAccessKeyDataLimit: function() {
    if (this.$.accessKeyDataLimitInput.invalid) {
      return;
    }
    const value = Number(this.$.accessKeyDataLimitInput.value);
    const unit = this.$.accessKeyDataLimitUnits.selected;
    this.fire('SetAccessKeyDataLimitRequested', {limit: {value, unit}});
  },

  _computeDataLimitsEnabledName: function(isAccessKeyDataLimitEnabled) {
    return isAccessKeyDataLimitEnabled ? 'enabled' : 'disabled';
  },

  _validatePort: function(value) {
    const port = Number(value);
    const valid = !Number.isNaN(port) && port >= 1 && port <= 65535 && Number.isInteger(port);
    return valid ? '' : this.localize('error-keys-port-bad-input');
  }
});
