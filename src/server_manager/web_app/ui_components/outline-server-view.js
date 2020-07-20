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
import '@polymer/paper-dialog/paper-dialog.js';
import '@polymer/iron-icons/iron-icons.js';
import '@polymer/iron-pages/iron-pages.js';
import '@polymer/iron-icons/editor-icons.js';
import '@polymer/iron-icons/social-icons.js';
import '@polymer/paper-icon-button/paper-icon-button.js';
import '@polymer/paper-item/paper-item.js';
import '@polymer/paper-listbox/paper-listbox.js';
import '@polymer/paper-menu-button/paper-menu-button.js';
import '@polymer/paper-progress/paper-progress.js';
import '@polymer/paper-tabs/paper-tabs.js';
import '@polymer/paper-tooltip/paper-tooltip.js';
import './cloud-install-styles.js';
import './outline-iconset.js';
import './outline-help-bubble.js';
import './outline-metrics-option-dialog.js';
import './outline-server-settings.js';
import './outline-share-dialog.js';
import './outline-sort-span.js';
import {html, PolymerElement} from '@polymer/polymer';
import {DirMixin} from '@polymer/polymer/lib/mixins/dir-mixin.js';


import * as byte_size from 'byte-size';

byte_size.defaultOptions({
  units: 'metric',
  toStringFn: function() {
    return `${this.value} ${this.unit}`;
  },
});

const MY_CONNECTION_USER_ID = '0';

// Makes an CustomEvent that bubbles up beyond the shadow root.
function makePublicEvent(eventName, detail) {
  const params = {bubbles: true, composed: true};
  if (detail !== undefined) {
    params.detail = detail;
  }
  return new CustomEvent(eventName, params);
}

function compare(a, b) {
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
}

/**
 * An access key to be displayed
 * @typedef {Object} DisplayAccessKey
 * @prop {string} id
 * @prop {string} placeholderName
 * @prop {string} name
 * @prop {string} accessUrl
 * @prop {number} transferredBytes
 * @prop {number} relativeTraffic
 */

/**
 * @typedef {Object} DisplayDataAmount
 * @prop {'MB'|'GB'} unit
 * @prop {number} value
 */

export class ServerView extends DirMixin(PolymerElement) {
  static get template() {
    return html`
    <style include="cloud-install-styles"></style>
    <style>
      .container {
        display: flex;
        flex-direction: column;
        padding: 24px;
        color: var(--light-gray);
      }
      .tabs-container {
        display: flex;
        flex-direction: row;
        border-bottom: 1px solid var(--border-color);
      }
      .tabs-spacer {
        flex: 2;
      }
      paper-tabs {
        flex: 1;
        --paper-tabs-selection-bar-color: var(--primary-green);
        --paper-tab-ink: var(--primary-green);
        --paper-tab-content-unselected {
          color: var(--dark-gray);
        }
      }
      div[name="connections"],
      div[name="settings"],
      .access-key-list {
        margin-top: 24px;
      }
      .server-header {
        display: flex;
        flex-direction: column;
        margin: 24px 0;
      }
      .server-name {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
      .server-name h3 {
        font-size: 36px;
        font-weight: 400;
        color: #ffffff;
        flex: 11;
        margin: 0 0 6px 0;
      }
      .server-location,
      .unreachable-server paper-button {
        color: var(--medium-gray);
      }
      .unreachable-server {
        flex-direction: column;
        align-items: center;
        margin-top: 24px;
        padding: 72px 48px;
      }
      .unreachable-server p {
        line-height: 22px;
        max-width: 50ch;
        text-align: center;
        color: var(--medium-gray);
      }
      .unreachable-server .button-container {
        padding: 24px 0;
      }
      .unreachable-server paper-button.try-again-btn {
        color: var(--primary-green);
      }
      .server-img {
        width: 142px;
        height: 142px;
        margin: 24px;
      }
      .stats-container {
        display: flex;
        flex-direction: row;
        margin: 0 -8px;
      }
      .stats-card {
        flex-direction: column;
        flex: 1;
        margin: 0 8px;
      }
      .stats {
        margin: 30px 0 18px 0;
        color: #fff;
        white-space: nowrap;
      }
      .stats > * {
        font-weight: 300;
        display: inline-block;
        margin: 0;
      }
      .stats h3 {
        font-size: 48px;
      }
      .stats p,
      .stats-card p {
        margin: 0;
        font-size: 14px;
        font-weight: normal;
      }
      @media (max-width: 938px) {
        /* Reduce the cards' size so they fit comfortably on small displays. */
        .stats {
          margin-top: 24px;
        }
        .stats h3 {
          font-size: 42px;
        }
        .stats-card p {
          font-size: 12px;
        }
      }
      .transfer-stats .stats,
      .transfer-stats .stats p {
        color: var(--primary-green);
      }
      .stats-card p,
      .stats-card iron-icon {
        color: var(--medium-gray);
      }
      .access-key-list {
        flex-direction: column;
        padding: 24px 16px 24px 30px;
      }
      .access-key-row {
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 15px 0;
      }
      .header-row {
        font-size: 12px;
        color: var(--medium-gray);
        margin-bottom: 12px;
      }
      .header-row paper-button {
        color: white;
        height: 32px;
        font-size: 13px;
        padding: 0 28px 0px 28px;
        background-color: #00bfa5;
        margin: 0px 12px 0px 96px;
        height: 36px;
      }
      .header-row-spacer {
        /* 24px (share icon) + 40px (overflow menu) + 8px (margin) */
        min-width: 72px;
      }
      .measurement-container {
        display: flex;
        flex: 3;
        align-items: center;
      }
      .measurement-container paper-progress {
        max-width: 72px;
        margin: 0 24px 0 12px;
        --paper-progress-height: 8px;
        --paper-progress-active-color: var(--primary-green);
      }
      .measurement-container paper-progress.data-limits {
        border: 1px solid var(--primary-green);
        border-radius: 2px;
      }
      @media (max-width: 640px) {
        .measurement-container paper-progress {
          width: 48px;
        }
      }
      paper-progress.data-limits:hover {
        cursor: pointer;
      }
      .measurement {
        /* Space the usage bars evenly */
        min-width: 9ch;
        /* We don't want numbers separated from their units */
        white-space: nowrap;
        font-size: 14px;
        color: var(--medium-gray);
        line-height: 24px;
      }
      .access-key-container {
        display: flex;
        flex: 4;
        align-items: center;
      }
      .sort-icon {
        /* Disable click events on the sorting icons, so that the event gets propagated to the
           parent, which defines the dataset elements needed for displaying the icon. */
        pointer-events: none;
      }
      #manager-access-key-description {
        font-size: 12px;
        font-weight: 400;
        margin-top: 4px;
        color: var(--medium-gray);
      }
      .manager-access-key-icon.access-key-icon {
        height: 48px;
      }
      .access-key-icon {
        width: 42px;
        height: 42px;
        margin-right: 18px;
      }
      .access-key-name {
        display: flex;
        flex-direction: column;
        font-weight: 500;
        flex: 1;
      }
      input.access-key-name {
        font-family: inherit;
        font-size: inherit;
        border-top: none;
        border-left: none;
        border-right: none;
        border-bottom: 1px solid transparent;
        border-radius: 2px;
        padding: 4px 8px;
        position: relative;
        left: -8px; /* Align with padding */
        background: var(--background-contrast-color);
        color: var(--light-gray);
      }
      input.access-key-name::placeholder {
        opacity: inherit;
        color: inherit;
      }
      input.access-key-name:hover {
        border-bottom-color: var(--border-color);
      }
      input.access-key-name:focus {
        border-bottom-color: var(--primary-green);
        border-radius: 0px;
        outline: none;
        font-weight: normal;
      }
      .overflow-menu {
        display: flex;
        justify-content: flex-end;
        padding: 0px;
        min-width: 40px;
        margin-left: 8px;
        color: var(--medium-gray);
      }
      .overflow-menu paper-item {
        cursor: pointer;
      }
      paper-item {
        font-size: 14px;
      }
      paper-listbox iron-icon {
        margin-right: 10px;
        width: 18px;
      }
      paper-dropdown {
        box-shadow: 0px 0px 20px #999999;
      }
      #addAccessKeyButton {
        background: var(--primary-green);
        color: #fff;
        border-radius: 50%;
      }
      .actions {
        flex: 1;
        display: flex;
        justify-content: flex-end;
        align-items: center;
        text-align: end;
      }
      .connect-button,
      .share-button {
        color: white;
        padding: 0;
        margin: 0;
        height: 24px;
        width: 24px;
      }
      .add-new-key {
        color: var(--primary-green);
        cursor: pointer;
      }
      outline-help-bubble {
        text-align: center;
      }
      outline-help-bubble h3 {
        padding-bottom: 0;
        font-weight: 500;
        line-height: 28px;
        font-size: 16px;
        margin: 0px 0px 12px 0px;
      }
      outline-help-bubble img {
        width: 76px;
        height: auto;
        margin: 12px 0px 24px 0px;
      }
      .digital-ocean-icon {
        opacity: 0.54;
      }
      .flex-1 {
        flex: 1;
      }
      /* Mirror icons */
      :host(:dir(rtl)) iron-icon,
      :host(:dir(rtl)) .share-button,
      :host(:dir(rtl)) .access-key-icon {
        transform: scaleX(-1);
      }
    </style>

    <div class="container">
      <div class="server-header">
        <div class="server-name">
          <h3>[[serverName]]</h3>
          <paper-menu-button horizontal-align="right" class="overflow-menu flex-1" hidden\$="{{!isServerReachable}}" close-on-activate="" no-animations="" dynamic-align="" no-overlap="">
            <paper-icon-button icon="more-vert" slot="dropdown-trigger"></paper-icon-button>
            <paper-listbox slot="dropdown-content">
              <paper-item hidden\$="[[!isServerManaged]]" on-tap="destroyServer">
                <iron-icon icon="icons:remove-circle-outline"></iron-icon>[[localize('server-destroy')]]
              </paper-item>
              <paper-item hidden\$="[[isServerManaged]]" on-tap="removeServer">
                <iron-icon icon="icons:remove-circle-outline"></iron-icon>[[localize('server-remove')]]
              </paper-item>
            </paper-listbox>
          </paper-menu-button>
        </div>
        <div class="server-location" hidden\$="{{!isServerReachable}}">[[serverLocation]]</div>
      </div>
      <div class="tabs-container" hidden\$="{{!isServerReachable}}">
        <div class="tabs-spacer"></div>
        <paper-tabs selected="{{selectedTab}}" attr-for-selected="name" noink="">
          <paper-tab name="connections">[[localize('server-connections')]]</paper-tab>
          <paper-tab name="settings" id="settingsTab">[[localize('server-settings')]]</paper-tab>
        </paper-tabs>
      </div>

      <!-- Unreachable server display -->
      <div class="card-section unreachable-server" hidden\$="{{isServerReachable}}">
        <img class="server-img" src="images/server-unreachable.png">
        <h3>[[localize('server-unreachable')]]</h3>
        <p></p>
        <div>[[localize('server-unreachable-description')]]</div>
        <span hidden\$="{{isServerManaged}}">[[localize('server-unreachable-managed-description')]]</span>
        <span hidden\$="{{!isServerManaged}}">[[localize('server-unreachable-manual-description')]]</span>
        <div class="button-container">
          <paper-button on-tap="removeServer" hidden\$="{{isServerManaged}}">[[localize('server-remove')]]</paper-button>
          <paper-button on-tap="destroyServer" hidden\$="{{!isServerManaged}}">[[localize('server-destroy')]]</paper-button>
          <paper-button on-tap="retryDisplayingServer" class="try-again-btn">[[localize('retry')]]</paper-button>
        </div>
      </div>

      <iron-pages selected="{{selectedTab}}" attr-for-selected="name" hidden\$="{{!isServerReachable}}">
        <div name="connections">
          <div class="stats-container">
            <div class="stats-card transfer-stats card-section">
              <iron-icon icon="icons:swap-horiz"></iron-icon>
              <div class="stats">
                <h3>[[_getFormattedTransferredValue(totalInboundBytes, '0')]]</h3>
                <p>[[_getFormattedTransferredUnit(totalInboundBytes, 'B')]]</p>
              </div>
              <p>[[localize('server-data-transfer')]]</p>
            </div>
            <div hidden\$="[[!isServerManaged]]" class="stats-card card-section">
              <div>
                <img class="digital-ocean-icon" src="images/do_white_logo.svg">
              </div>
              <div class="stats">
                <h3>[[managedServerUtilzationPercentage]]</h3>
                <p>/[[_formatBytesTransferred(monthlyOutboundTransferBytes)]]</p>
              </div>
              <p>[[localize('server-data-used')]]</p>
            </div>
            <div class="stats-card card-section">
              <iron-icon icon="outline-iconset:key"></iron-icon>
              <div class="stats">
                <h3>[[accessKeyRows.length]]</h3>
                <p>[[localize('server-keys')]]</p>
              </div>
              <p>[[localize('server-access')]]</p>
            </div>
          </div>

          <div class="access-key-list card-section">
            <!-- header row -->
            <div class="access-key-row header-row">
              <outline-sort-span class="access-key-container"
                  direction="[[_computeColumnDirection('name', accessKeySortBy, accessKeySortDirection)]]"
                  on-tap="_setSortByOrToggleDirection" data-sort-by="name">
                [[localize('server-access-keys')]]
              </outline-sort-span>
              <outline-sort-span class="measurement-container"
                  direction="[[_computeColumnDirection('usage', accessKeySortBy, accessKeySortDirection)]]"
                  on-tap="_setSortByOrToggleDirection" data-sort-by="usage">
                [[localize('server-usage')]]
              </outline-sort-span>
              <span class="flex-1 header-row-spacer"></span>
            </div>
            <!-- admin row -->
            <div class="access-key-row" id="managerRow">
              <span class="access-key-container">
                <img class="manager-access-key-icon access-key-icon" src="images/manager-key-avatar.svg">
                <div class="access-key-name">
                  <div>[[localize('server-my-access-key')]]</div>
                  <div id="manager-access-key-description">[[localize('server-connect-devices')]]</div>
                </div>
              </span>
              <span class="measurement-container">
                <span class="measurement">[[_formatBytesTransferred(myConnection.transferredBytes, "...")]]</span>
                <paper-progress value="[[myConnection.relativeTraffic]]" class\$="[[_computePaperProgressClass(isAccessKeyDataLimitEnabled)]]"></paper-progress>
                <paper-tooltip animation-delay="0" offset="0" position="top" hidden\$="[[!isAccessKeyDataLimitEnabled]]">
                  [[_getDataLimitsUsageString(myConnection)]]
                </paper-tooltip>
              </span>
              <span class="actions">
                <span class="flex-1">
                  <paper-icon-button icon="outline-iconset:devices" class="connect-button" on-tap="_handleConnectPressed"></paper-icon-button>
                </span>
                <span class="overflow-menu flex-1"></span>
              </span>
            </div>
            <div id="accessKeysContainer">
              <!-- rows for each access key -->
              <template is="dom-repeat" items="{{accessKeyRows}}" filter="isRegularConnection" sort="{{_sortAccessKeys(accessKeySortBy, accessKeySortDirection)}}" observe="name transferredBytes">
                <!-- TODO(alalama): why is observe not responding to rename? -->
                <div class="access-key-row">
                  <span class="access-key-container">
                    <img class="access-key-icon" src="images/key-avatar.svg">
                    <input type="text" class="access-key-name" id\$="access-key-[[item.id]]" placeholder="{{item.placeholderName}}" value="[[item.name]]" on-blur="_handleNameInputBlur" on-keydown="_handleNameInputKeyDown">
                  </span>
                  <span class="measurement-container">
                    <span class="measurement">[[_formatBytesTransferred(item.transferredBytes, "...")]]</span>
                    <paper-progress value="[[item.relativeTraffic]]" class\$="[[_computePaperProgressClass(isAccessKeyDataLimitEnabled)]]"></paper-progress>
                    <paper-tooltip animation-delay="0" offset="0" position="top" hidden\$="[[!isAccessKeyDataLimitEnabled]]">
                      [[_getDataLimitsUsageString(item)]]
                    </paper-tooltip>
                  </span>
                  <span class="actions">
                    <span class="flex-1">
                      <paper-icon-button icon="outline-iconset:share" class="share-button" on-tap="_handleShareCodePressed"></paper-icon-button>
                    </span>
                    <span class="flex-1">
                      <paper-menu-button horizontal-align="right" class="overflow-menu" close-on-activate="" no-animations="" no-overlap="" dynamic-align="">
                        <paper-icon-button icon="more-vert" slot="dropdown-trigger"></paper-icon-button>
                        <paper-listbox slot="dropdown-content">
                          <paper-item on-tap="_handleRenameAccessKeyPressed">
                            <iron-icon icon="icons:create"></iron-icon>[[localize('server-access-key-rename')]]
                          </paper-item>
                          <paper-item on-tap="_handleRemoveAccessKeyPressed">
                            <iron-icon icon="icons:delete"></iron-icon>[[localize('remove')]]
                          </paper-item>
                        </paper-listbox>
                      </paper-menu-button>
                    </span>
                  </span>
                </div>
              </template>
            </div>
            <!-- add key button -->
            <div class="access-key-row" id="addAccessKeyRow">
              <span class="access-key-container">
                <paper-icon-button icon="icons:add" on-tap="_handleAddAccessKeyPressed" id="addAccessKeyButton" class="access-key-icon"></paper-icon-button>
                <div class="add-new-key" on-tap="_handleAddAccessKeyPressed">[[localize('server-access-key-new')]]</div>
              </span>
            </div>
          </div>
        </div>
        <div name="settings">
          <outline-server-settings id="serverSettings" server-id="[[serverId]]" server-hostname="[[serverHostname]]" server-name="[[serverName]]" server-version="[[serverVersion]]" is-hostname-editable="[[isHostnameEditable]]" server-management-api-url="[[serverManagementApiUrl]]" server-port-for-new-access-keys="[[serverPortForNewAccessKeys]]" is-access-key-port-editable="[[isAccessKeyPortEditable]]" access-key-data-limit="{{accessKeyDataLimit}}" is-access-key-data-limit-enabled="{{isAccessKeyDataLimitEnabled}}" supports-access-key-data-limit="[[supportsAccessKeyDataLimit]]" show-feature-metrics-disclaimer="[[showFeatureMetricsDisclaimer]]" server-creation-date="[[serverCreationDate]]" server-monthly-cost="[[monthlyCost]]" server-monthly-transfer-limit="[[_formatBytesTransferred(monthlyOutboundTransferBytes)]]" is-server-managed="[[isServerManaged]]" server-location="[[serverLocation]]" metrics-enabled="[[metricsEnabled]]" localize="[[localize]]">
          </outline-server-settings>
        </div>
      </iron-pages>
    </div>

    <outline-help-bubble id="getConnectedHelpBubble" vertical-align="bottom" horizontal-align="right">
      <img src="images/connect-tip-2x.png">
      <h3>[[localize('server-help-connection-title')]]</h3>
      <p>[[localize('server-help-connection-description')]]</p>
      <paper-button on-tap="closeGetConnectedHelpBubble">[[localize('server-help-connection-ok')]]</paper-button>
    </outline-help-bubble>
    <outline-help-bubble id="addAccessKeyHelpBubble" vertical-align="bottom" horizontal-align="left">
      <img src="images/key-tip-2x.png">
      <h3>[[localize('server-help-access-key-title')]]</h3>
      <p>[[localize('server-help-access-key-description')]]</p>
      <paper-button on-tap="closeAddAccessKeyHelpBubble">[[localize('server-help-access-key-next')]]</paper-button>
    </outline-help-bubble>
    <outline-help-bubble id="dataLimitsHelpBubble" vertical-align="top" horizontal-align="right">
      <h3>[[localize('data-limits-dialog-title')]]</h3>
      <p>[[localize('data-limits-dialog-text')]]</p>
      <paper-button on-tap="closeDataLimitsHelpBubble">[[localize('ok')]]</paper-button>
    </outline-help-bubble>
    `;
    }

    static get is() {
      return 'outline-server-view';
    }

    static get properties() {
      return {
        serverId: String,
        serverName: String,
        serverHostname: String,
        serverVersion: String,
        isHostnameEditable: {type: Boolean},
        serverManagementApiUrl: String,
        serverPortForNewAccessKeys: Number,
        isAccessKeyPortEditable: {type: Boolean},
        serverCreationDate: String,
        serverLocation: String,
        accessKeyDataLimit: {type: Object},
        isAccessKeyDataLimitEnabled: {type: Boolean},
        supportsAccessKeyDataLimit: {type: Boolean},
        showFeatureMetricsDisclaimer: {type: Boolean},
        isServerManaged: Boolean,
        isServerReachable: Boolean,
        retryDisplayingServer: Function,
        myConnection: Object,
        totalInboundBytes: Number,
        accessKeyRows: {type: Array},
        hasNonAdminAccessKeys: Boolean,
        metricsEnabled: Boolean,
        monthlyOutboundTransferBytes: {type: Number},
        monthlyCost: {type: Number},
        selectedTab: {type: String},
        managedServerUtilzationPercentage: {
          type: Number,
          computed:
              '_computeManagedServerUtilzationPercentage(totalInboundBytes, monthlyOutboundTransferBytes)',
        },
        accessKeySortBy: {type: String},
        accessKeySortDirection: {type: Number},
        localize: {type: Function, readonly: true},
      };
    }

    static get observers() {
      return [
        '_accessKeysAddedOrRemoved(accessKeyRows.splices)',
        '_myConnectionChanged(myConnection)',
        '_selectedTabChanged(selectedTab)',
      ];
    }

    constructor() {
      super();
      this.serverId = '';
      this.serverName = '';
      this.serverHostname = '';
      this.serverVersion = '';
      this.isHostnameEditable = false;
      this.serverManagementApiUrl = '';
      /** @type {number} */
      this.serverPortForNewAccessKeys = null;
      this.isAccessKeyPortEditable = false;
      this.serverCreationDate = '';
      this.serverLocation = '';
      /** @type {DisplayDataAmount} */
      this.accessKeyDataLimit = null;
      this.isAccessKeyDataLimitEnabled = false;
      /** Whether the server supports data limits. */
      this.supportsAccessKeyDataLimit = false;
      this.showFeatureMetricsDisclaimer = false;
      this.isServerManaged = false;
      this.isServerReachable = false;
      /**
       *  Callback for retrying to display an unreachable server.
       *  @type {() => void)}
       */
      this.retryDisplayingServer = null;
      /**
       *  myConnection has the same fields as each item in accessKeyRows.  It may
       *  be unset in some old versions of Outline that allowed deleting this row
       *  @type {DisplayAccessKey}
       */
      this.myConnection = null;
      this.totalInboundBytes = 0;
      /** @type {DisplayAccessKey[]} */
      this.accessKeyRows = [];
      this.hasNonAdminAccessKeys = false;
      this.metricsEnabled = false;
      // Initialize monthlyOutboundTransferBytes and monthlyCost to 0, so they can
      // be bound to hidden attributes.  Initializing to undefined does not
      // cause hidden$=... expressions to be evaluated and so elements may be
      // shown incorrectly.  See:
      //   https://stackoverflow.com/questions/33700125/polymer-1-0-hidden-attribute-negate-operator
      //   https://www.polymer-project.org/1.0/docs/devguide/data-binding.html
      this.monthlyOutboundTransferBytes = 0;
      this.monthlyCost = 0;
      this.selectedTab = 'connections';
      this.accessKeySortBy = 'name';
      /**
       * The direction to sort: 1 == ascending, -1 == descending
       * @type {-1|1}
       */
      this.accessKeySortDirection = 1;
      /** @type {(msgId: string, ...params: string[]) => string} */
      this.localize = null;
    }

    /**
     * @param {DisplayAccessKey} accessKey
     */
    addAccessKey(accessKey) {
      // TODO(fortuna): Restore loading animation.
      // TODO(fortuna): Restore highlighting.
      this.push('accessKeyRows', accessKey);
      // Force render the access key list so that the input is present in the DOM
      this.$.accessKeysContainer.querySelector('dom-repeat').render();
      const input = this.shadowRoot.querySelector(`#access-key-${accessKey.id}`);
      input.select();
    }

  removeAccessKey(accessKeyId) {
    for (let ui in this.accessKeyRows) {
      if (this.accessKeyRows[ui].id === accessKeyId) {
        this.splice('accessKeyRows', ui, 1);
        return;
      }
    }
  }

  _handleAddAccessKeyPressed() {
    this.dispatchEvent(makePublicEvent('AddAccessKeyRequested'));
    this.$.addAccessKeyHelpBubble.hide();
  }

  _handleNameInputKeyDown(event) {
    const input = event.target;
    if (event.key === 'Escape') {
      const accessKey = event.model.item;
      input.value = accessKey.name;
      input.blur();
    } else if (event.key === 'Enter') {
      input.blur();
    }
  }

  _handleNameInputBlur(event) {
    const input = event.target;
    const accessKey = event.model.item;
    const displayName = input.value;
    if (displayName === accessKey.name) {
      return;
    }
    input.disabled = true;
    this.dispatchEvent(makePublicEvent('RenameAccessKeyRequested', {
      accessKeyId: accessKey.id,
      newName: displayName,
      entry: {
        commitName: () => {
          input.disabled = false;
          // Update accessKeyRows so the UI is updated.
          this.accessKeyRows = this.accessKeyRows.map((row) => {
            if (row.id !== accessKey.id) {
              return row
            }
            return {...row, name: displayName};
          });
        },
        revertName: () => {
          input.value = accessKey.name;
          input.disabled = false;
        },
      },
    }));
  }

  _handleRenameAccessKeyPressed(event) {
    const input = this.$.accessKeysContainer.querySelectorAll(
        '.access-key-row .access-key-container > input')[event.model.index];
    // This needs to be deferred because the closing menu messes up with the focus.
    window.setTimeout(() => {
      input.focus();
    }, 0);
  }

  _handleConnectPressed() {
    this.$.getConnectedHelpBubble.hide();
    this.dispatchEvent(makePublicEvent(
        'OpenGetConnectedDialogRequested', {accessKey: this.myConnection.accessUrl}));
  }

  _handleShareCodePressed(event) {
    const accessKey = event.model.item;
    this.dispatchEvent(
        makePublicEvent('OpenShareDialogRequested', {accessKey: accessKey.accessUrl}));
  }

  _handleRemoveAccessKeyPressed(e) {
    const accessKey = e.model.item;
    this.dispatchEvent(makePublicEvent('RemoveAccessKeyRequested', {accessKeyId: accessKey.id}));
  }

  setServerTransferredData(totalBytes) {
    this.totalInboundBytes = totalBytes;
  }

  updateAccessKeyRow(accessKeyId, fields) {
    let newAccessKeyRow;
    if (accessKeyId === MY_CONNECTION_USER_ID) {
      newAccessKeyRow = Object.assign({}, this.get('myConnection'), fields);
      this.set('myConnection', newAccessKeyRow);
    }
    for (let ui in this.accessKeyRows) {
      if (this.accessKeyRows[ui].id === accessKeyId) {
        newAccessKeyRow = Object.assign({}, this.get(['accessKeyRows', ui]), fields);
        this.set(['accessKeyRows', ui], newAccessKeyRow);
        return;
      }
    }
  }

  _formatBytesTransferred(numBytes, emptyValue = '') {
    if (!numBytes) {
      // numBytes may not be set for manual servers, or may be 0 for
      // unused access keys.
      return emptyValue;
    }

    // Show 0 decimals for < 1MB, 1 decimal for >= 1MB, 2 decimals for >= 1GB.
    let numDecimals = 0;
    if (numBytes >= 10 ** 9) {
      numDecimals = 2;
    } else if (numBytes >= 10 ** 6) {
      numDecimals = 1;
    }

    return byte_size(numBytes, {precision: numDecimals}).toString();
  }

  _getFormattedTransferredUnit(numBytes, emptyValue = '') {
    const formattedTransfer = this._formatBytesTransferred(numBytes);
    if (!formattedTransfer) {
      return emptyValue;
    }
    const units = formattedTransfer.match(/[a-zA-Z%]+/g);
    if (!units || units.length < 0) {
      return emptyValue;
    }
    return units.pop();
  }

  _getFormattedTransferredValue(numBytes, emptyValue = '') {
    const formattedTransfer = this._formatBytesTransferred(numBytes);
    if (!formattedTransfer) {
      return emptyValue;
    }
    const value = parseFloat(formattedTransfer);
    return !!value ? value : emptyValue;
  }

  _computeManagedServerUtilzationPercentage(numBytes, monthlyLimitBytes) {
    let utilizationPercentage = 0;
    if (monthlyLimitBytes && numBytes) {
      utilizationPercentage = Math.round((numBytes / monthlyLimitBytes) * 100);
    }
    if (document.documentElement.dir === 'rtl') {
      return `%${utilizationPercentage}`;
    }
    return `${utilizationPercentage}%`;
  }

  _accessKeysAddedOrRemoved(changeRecord) {
    // Check for myConnection and regular access keys.
    let hasNonAdminAccessKeys = false;
    for (let ui in this.accessKeyRows) {
      if (this.accessKeyRows[ui].id === MY_CONNECTION_USER_ID) {
        this.myConnection = this.accessKeyRows[ui];
      } else {
        hasNonAdminAccessKeys = true;
      }
    }
    this.hasNonAdminAccessKeys = hasNonAdminAccessKeys;
  }

  _myConnectionChanged(myConnection) {
    if (!myConnection) {
      this.$.getConnectedHelpBubble.hide();
    }
  }

  _selectedTabChanged(selectedTab) {
    if (this.selectedTab === 'settings') {
      this.closeAddAccessKeyHelpBubble();
      this.closeGetConnectedHelpBubble();
      this.closeDataLimitsHelpBubble();
      this.$.serverSettings.setServerName(this.serverName);
    }
  }

  // Help bubbles should be shown after this outline-server-view
  // is on the screen (e.g. selected in iron-pages). If help bubbles
  // are initialized before this point, setPosition will not work and
  // they will appear in the top left of the view.
  showGetConnectedHelpBubble() {
    return this._showHelpBubble('getConnectedHelpBubble', 'managerRow');
  }

  showAddAccessKeyHelpBubble() {
    return this._showHelpBubble('addAccessKeyHelpBubble', 'addAccessKeyRow', 'down', 'left');
  }

  showDataLimitsHelpBubble() {
    return this._showHelpBubble('dataLimitsHelpBubble', 'settingsTab', 'up', 'right');
  }

  closeAddAccessKeyHelpBubble() {
    this.$.addAccessKeyHelpBubble.hide();
  }

  closeGetConnectedHelpBubble() {
    this.$.getConnectedHelpBubble.hide();
  }

  closeDataLimitsHelpBubble() {
    this.$.dataLimitsHelpBubble.hide();
  }

  _showHelpBubble(
      helpBubbleId, positionTargetId, arrowDirection = 'down', arrowAlignment = 'right') {
    return new Promise(resolve => {
      const helpBubble = this.$[helpBubbleId];
      helpBubble.show(this.$[positionTargetId], arrowDirection, arrowAlignment);
      helpBubble.addEventListener('outline-help-bubble-dismissed', resolve);
    });
  }

  isRegularConnection(item) {
    return item.id !== MY_CONNECTION_USER_ID;
  }

  _computeColumnDirection(columnName, accessKeySortBy, accessKeySortDirection) {
    if (columnName === accessKeySortBy) {
      return accessKeySortDirection;
    }
    return 0;
  }

  _setSortByOrToggleDirection(e) {
    const sortBy = e.target.dataset.sortBy;
    if (this.accessKeySortBy !== sortBy) {
      this.accessKeySortBy = sortBy;
      this.accessKeySortDirection = sortBy == 'usage' ? -1 : 1;
    } else {
      this.accessKeySortDirection *= -1;
    }
  }

  _sortAccessKeys(accessKeySortBy, accessKeySortDirection) {
    if (accessKeySortBy === 'usage') {
      return (a, b) => {
        return (a.transferredBytes - b.transferredBytes) * accessKeySortDirection;
      };
    }
    // Default to sorting by name.
    return (a, b) => {
      if (a.name && b.name) {
        return compare(a.name.toUpperCase(), b.name.toUpperCase()) * accessKeySortDirection;
      } else if (a.name) {
        return -1;
      } else if (b.name) {
        return 1
      } else {
        return 0;
      }
    };
  }

  destroyServer() {
    this.dispatchEvent(makePublicEvent('DeleteServerRequested'));
  }

  removeServer() {
    this.dispatchEvent(makePublicEvent('ForgetServerRequested'));
  }

  _computePaperProgressClass(isAccessKeyDataLimitEnabled) {
    return isAccessKeyDataLimitEnabled ? 'data-limits' : '';
  }

  _getDataLimitsUsageString(accessKey) {
    if (!this.accessKeyDataLimit) {
      return '';
    }
    const used = this._formatBytesTransferred(accessKey.transferredBytes, '0');
    const total = this.accessKeyDataLimit.value + ' ' + this.accessKeyDataLimit.unit;
    return this.localize('data-limits-usage', 'used', used, 'total', total);
  }
}

customElements.define(ServerView.is, ServerView);
