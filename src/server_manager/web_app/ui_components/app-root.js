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
import '@polymer/app-layout/app-drawer/app-drawer.js';
import '@polymer/app-layout/app-drawer-layout/app-drawer-layout.js';
import '@polymer/app-layout/app-toolbar/app-toolbar.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-icons/iron-icons.js';
import '@polymer/iron-pages/iron-pages.js';
import '@polymer/paper-icon-button/paper-icon-button.js';
import '@polymer/paper-toast/paper-toast.js';
import '@polymer/paper-dialog/paper-dialog.js';
import '@polymer/paper-dialog-scrollable/paper-dialog-scrollable.js';
import '@polymer/paper-listbox/paper-listbox.js';
import '@polymer/paper-menu-button/paper-menu-button.js';
import './cloud-install-styles.js';
import './outline-about-dialog.js';
import './outline-do-oauth-step.js';
import './outline-feedback-dialog.js';
import './outline-survey-dialog.js';
import './outline-intro-step.js';
import './outline-language-picker.js';
import './outline-manual-server-entry.js';
import './outline-modal-dialog.js';
import './outline-region-picker-step.js';
import './outline-server-progress-step.js';
import './outline-tos-view.js';

import {AppLocalizeBehavior} from '@polymer/app-localize-behavior/app-localize-behavior.js';
import {mixinBehaviors} from '@polymer/polymer/lib/legacy/class.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';
import {PolymerElement} from '@polymer/polymer/polymer-element.js';

import {DisplayServer} from '../display_server';

import {ServerView} from './outline-server-view.js';

const TOS_ACK_LOCAL_STORAGE_KEY = 'tos-ack';

export class AppRoot extends mixinBehaviors
([AppLocalizeBehavior], PolymerElement) {
  static get template() {
    return html`
    <style include="cloud-install-styles"></style>
    <style>
      :host {
        --side-bar-width: 48px;
      }
      .app-container {
        margin: 0 auto;
      }
      /* Large display desktops */
      @media (min-width: 1281px) {
        .app-container {
          max-width: 1200px;
        }
      }
      /* Laptop, desktops */
      @media (min-width: 1025px) and (max-width: 1280px) {
        .app-container {
          max-width: 920px;
        }
      }
      #toast {
        align-items: center;
        display: flex;
        justify-content: space-between;
        padding: 24px;
        max-width: 450px;
      }
      #toast paper-icon-button {
        /* prevents the icon from resizing when there is a long message in the toast */
        flex-shrink: 0;
        padding: 0;
        height: 20px;
        width: 20px;
      }
      /* rtl:begin:ignore */
      #appDrawer {
        --app-drawer-content-container: {
          color: var(--medium-gray);
          background-color: var(--background-contrast-color);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: right;
        }
      }
      /* rtl:end:ignore */
      #appDrawer > * {
        width: 100%;
      }
      .servers {
        overflow-y: scroll;
        flex: 1;
      }
      .servers::-webkit-scrollbar {
        /* Do not display the scroll bar in the drawer or side bar. It is not styled on some platforms. */
        display: none;
      }
      .servers-section {
        padding: 12px 0;
        border-bottom: 1px solid var(--border-color);
      }
      .servers-section:last-child {
        border-bottom: none;
      }
      .servers-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-left: 24px;
        line-height: 39px;
      }
      .servers-header > span {
        flex: 1;
      }
      .do-overflow-menu {
        padding: 24px;
        color: var(--dark-gray);
        text-align: left;
        display: flex;
        flex-direction: column;
      }
      .do-overflow-menu h4 {
        margin-top: 0;
        white-space: nowrap;
      }
      .do-overflow-menu .account-info {
        display: flex;
        align-items: center;
        color: var(--faded-gray);
      }
      .do-overflow-menu .account-info img {
        margin-right: 12px;
        width: 24px;
      }
      .do-overflow-menu .sign-out-button {
        margin-top: 24px;
        align-self: flex-end;
        font-weight: bold;
        cursor: pointer;
        text-transform: uppercase;
      }
      .servers-container {
        padding-right: 12px; /* In case the server name is wraps. */
      }
      .server {
        display: flex;
        align-items: center;
        width: 100%; /* For the side bar icons. */
        margin: 18px 0;
        padding: 6px 0;
        cursor: pointer;
      }
      .server.selected {
        color: white;
        border-left: 2px solid var(--primary-green);
      }
      @keyframes rotate {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }
      .server.syncing {
        cursor: wait;
      }
      .syncing .server-icon {
        animation: rotate 1.75s ease-out infinite;
        opacity: 0.5;
      }
      .server-icon {
        width: 22px;
        height: 22px;
        /* Prevent the image from shrinking when the server title spans multiple lines */
        min-width: 22px !important;
        margin: 0 24px;
      }
      .selected > .server-icon {
        /* Account for the selected border width to preserve center alignment. */
        margin-left: 22px;
      }
      .add-server-section {
        padding: 24px 0;
        text-transform: uppercase;
        color: var(--primary-green);
        font-size: 12px;
        letter-spacing: 0.6px;
        border-top: 1px solid var(--border-color);
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
      }
      .add-server-section paper-icon-item {
        margin-left: 24px;
      }
      .add-server-section paper-icon-item iron-icon {
        margin-right: 24px;
      }
      #appDrawer > paper-listbox {
        color: var(--medium-gray);
        background-color: var(--background-contrast-color);
      }
      #appDrawer > paper-listbox > * {
        display: block;
        cursor: pointer;
        padding-left: 24px;
        font-size: 14px;
        line-height: 40px;
        outline: none;
      }
      #appDrawer a {
        color: inherit;
      }
      #appDrawer a:focus {
        outline: none;
      }
      #links-footer {
        margin-top: 36px;
      }
      .legal-links {
        margin: 0 -6px;
      }
      .legal-links > * {
        margin: 0 6px;
      }
      #language-row {
        display: flex;
        align-items: center;
      }
      #language-icon {
        padding-top: 10px;
      }
      #language-dropdown {
        padding-left: 22px;
        --paper-input-container: {
          width: 156px;
        };
      }
      app-toolbar [main-title] img {
        height: 16px;
        margin-top: 8px;
      }
      .side-bar-margin {
        margin-left: var(--side-bar-width);
      }
      /* rtl:begin:ignore */
      #sideBar {
        --app-drawer-width: var(--side-bar-width);
        --app-drawer-content-container: {
          background-color: var(--background-contrast-color);
        }
      }
      /* rtl:end:ignore */
      .side-bar-container {
        height: 100%;
        text-align: center;
        color: var(--light-gray);
        display: flex;
        flex-direction: column;
      }
      .side-bar-container .servers {
        flex: initial; /* Prevent the server list pushing down the add server button. */
      }
      .side-bar-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px 0;
        border-bottom: 1px solid var(--border-color);
      }
      .side-bar-section.menu {
        min-height: 32px;
      }
      .side-bar-section.servers-section {
        padding: 24px 0;
      }
      .side-bar-section .server {
        justify-content: center;
        margin: 12px auto;
        padding: 2px 0;
      }
      .side-bar-section .provider-icon {
        margin-bottom: 12px;
        padding: 12px 0;
        opacity: 0.54;
        filter: grayscale(100%);
      }
      .side-bar-section.add-server-section {
        flex: 1 0 24px;
        border-bottom: none;
      }
      .side-bar-section > .server-icon {
        margin: 0;
      }
      #getConnectedDialog {
        height: 562px;
        background: white;
      }
      #getConnectedDialog iframe {
        padding: 0;
        margin: 0;
        width: 100%;
        border: none;
        border-bottom: 1px solid #ccc;
        height: 500px;
      }
      #getConnectedDialog .buttons {
        margin-top: -5px; /* undo spacing added after iframe */
      }
    </style>

    <outline-tos-view id="tosView" has-accepted-terms-of-service="{{userAcceptedTos}}" hidden\$="{{hasAcceptedTos}}" localize="[[localize]]"></outline-tos-view>

    <div hidden\$="{{!hasAcceptedTos}}">
      <!-- This responsive width sets the minimum layout area to 648px.  -->
      <app-drawer-layout id="drawerLayout" responsive-width="886px" on-narrow-changed="_computeShouldShowSideBar" class\$="[[sideBarMarginClass]]">
        <app-drawer id="appDrawer" slot="drawer" on-opened-changed="_computeShouldShowSideBar">
          <app-toolbar class="toolbar" hidden\$="[[shouldShowSideBar]]">
            <paper-icon-button icon="menu" on-click="_toggleAppDrawer"></paper-icon-button>
            <div main-title=""><img src="images/outline-manager-logo.svg"></div>
          </app-toolbar>

          <!-- Servers section -->
          <div class="servers">
            <!-- DigitalOcean servers -->
            <div class="servers-section" hidden\$="{{!isSignedInToDigitalOcean}}">
              <div class="servers-header">
                <span>[[localize('servers-digitalocean')]]</span>
                <paper-menu-button horizontal-align="left" class="" close-on-activate="" no-animations="" dynamic-align="" no-overlap="">
                  <paper-icon-button icon="more-vert" slot="dropdown-trigger"></paper-icon-button>
                  <div class="do-overflow-menu" slot="dropdown-content">
                    <h4>[[localize('digitalocean-disconnect-account')]]</h4>
                    <div class="account-info"><img src="images/digital_ocean_logo.svg">{{adminEmail}}</div>
                    <div class="sign-out-button" on-tap="signOutTapped">[[localize('digitalocean-disconnect')]]</div>
                  </div>
                </paper-menu-button>
              </div>
              <div class="servers-container">
                <template is="dom-repeat" items="{{serverList}}" as="server" filter="_isServerManaged" sort="_sortServersByName">
                  <div class\$="server {{_computeServerClasses(selectedServer, server)}}" data-server\$="[[server]]" on-tap="_showServer">
                    <img class="server-icon" src\$="images/{{_computeServerImage(selectedServer, server)}}">
                    <span>{{server.name}}</span>
                  </div>
                </template>
              </div>
            </div>
            <!-- Manual servers -->
            <div class="servers-section" hidden\$="{{!hasManualServers}}">
              <div class="servers-header">
                <span>[[localize('servers-manual')]]</span>
              </div>
              <div class="servers-container">
                <template is="dom-repeat" items="{{serverList}}" as="server" filter="_isServerManual" sort="_sortServersByName">
                  <div class\$="server {{_computeServerClasses(selectedServer, server)}}" data-server\$="[[server]]" on-tap="_showServer">
                    <img class="server-icon" src\$="images/{{_computeServerImage(selectedServer, server)}}">
                    <span>{{server.name}}</span>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Add server -->
          <div class="add-server-section" on-tap="showIntro">
            <paper-icon-item>
              <iron-icon icon="add" slot="item-icon"></iron-icon>[[localize('servers-add')]]
            </paper-icon-item>
          </div>

          <!-- Links section -->
          <paper-listbox>
            <span on-tap="maybeCloseDrawer"><a href="https://s3.amazonaws.com/outline-vpn/index.html#/en/support/dataCollection">[[localize('nav-data-collection')]]</a></span>
            <span on-tap="submitFeedbackTapped">[[localize('nav-feedback')]]</span>
            <span on-tap="maybeCloseDrawer"><a href="https://s3.amazonaws.com/outline-vpn/index.html#/en/support/">[[localize('nav-help')]]</a></span>
            <span on-tap="aboutTapped">[[localize('nav-about')]]</span>
            <div id="links-footer">
              <paper-icon-item id="language-row">
                <iron-icon id="language-icon" icon="language" slot="item-icon"></iron-icon>
                <outline-language-picker id="language-dropdown" selected-language="{{language}}" languages="{{supportedLanguages}}"></outline-language-picker>
              </paper-icon-item>
              <div class="legal-links" on-tap="maybeCloseDrawer">
                <a href="https://www.google.com/policies/privacy/">[[localize('nav-privacy')]]</a>
                <a href="https://s3.amazonaws.com/outline-vpn/static_downloads/Outline-Terms-of-Service.html">[[localize('nav-terms')]]</a>
                <span on-tap="showLicensesTapped">[[localize('nav-licenses')]]</span>
              </div>      
            </div>
          </paper-listbox>
        </app-drawer>

        <app-header-layout>
          <div class="app-container">
            <iron-pages attr-for-selected="id" selected="{{ currentPage }}">
              <outline-intro-step id="intro" is-signed-in-to-digital-ocean="{{isSignedInToDigitalOcean}}" digital-ocean-email="{{adminEmail}}" localize="[[localize]]"></outline-intro-step>
              <outline-do-oauth-step id="digitalOceanOauth" localize="[[localize]]"></outline-do-oauth-step>
              <outline-manual-server-entry id="manualEntry" localize="[[localize]]"></outline-manual-server-entry>
              <outline-region-picker-step id="regionPicker" localize="[[localize]]"></outline-region-picker-step>
              <outline-server-progress-step id="serverProgressStep" localize="[[localize]]"></outline-server-progress-step>
              <div id="serverView">
                <template is="dom-repeat" items="{{serverList}}" as="server">
                  <outline-server-view id="serverView-{{_base64Encode(server.id)}}" localize="[[localize]]" hidden\$="{{!_isServerSelected(selectedServer, server)}}"></outline-server-view>
                </template>
              </div>
            </iron-pages>
          </div>
        </app-header-layout>
      </app-drawer-layout>

      <!-- Side bar -->
      <app-drawer id="sideBar" opened\$="[[shouldShowSideBar]]" persistent="">
        <div class="side-bar-container">
          <div class="side-bar-section menu">
            <paper-icon-button icon="menu" on-click="_toggleAppDrawer"></paper-icon-button>
          </div>
          <div class="servers">
            <!-- DigitalOcean servers -->
            <div class="side-bar-section servers-section" hidden\$="{{!isSignedInToDigitalOcean}}">
              <img class="provider-icon" src="images/do_white_logo.svg">
              <template is="dom-repeat" items="{{serverList}}" as="server" filter="_isServerManaged" sort="_sortServersByName">
                <div class\$="server {{_computeServerClasses(selectedServer, server)}}" data-server\$="[[server]]" on-tap="_showServer">
                  <img class="server-icon" src\$="images/{{_computeServerImage(selectedServer, server)}}">
                </div>
              </template>
            </div>
            <!-- Manual servers -->
            <div class="side-bar-section servers-section" hidden\$="{{!hasManualServers}}">
              <img class="provider-icon" src="images/cloud.svg">
              <template is="dom-repeat" items="{{serverList}}" as="server" filter="_isServerManual" sort="_sortServersByName">
                <div class\$="server {{_computeServerClasses(selectedServer, server)}}" data-server\$="[[server]]" on-tap="_showServer">
                  <img class="server-icon" src\$="images/{{_computeServerImage(selectedServer, server)}}">
                </div>
              </template>
            </div>
          </div>
          <div class="side-bar-section add-server-section" on-tap="showIntro">
            <paper-icon-item>
              <iron-icon icon="add" slot="item-icon"></iron-icon>
            </paper-icon-item>
          </div>
        </div>
      </app-drawer>

      <paper-toast id="toast"><paper-icon-button icon="icons:close" on-tap="closeError"></paper-icon-button></paper-toast>

      <!-- Modal dialogs must be outside the app container; otherwise the backdrop covers them.  -->
      <outline-survey-dialog id="surveyDialog" localize="[[localize]]"></outline-survey-dialog>
      <outline-feedback-dialog id="feedbackDialog" localize="[[localize]]"></outline-feedback-dialog>
      <outline-about-dialog id="aboutDialog" outline-version="[[outlineVersion]]" localize="[[localize]]"></outline-about-dialog>
      <outline-modal-dialog id="modalDialog"></outline-modal-dialog>
      <outline-share-dialog id="shareDialog" localize="[[localize]]"></outline-share-dialog>
      <outline-metrics-option-dialog id="metricsDialog" localize="[[localize]]"></outline-metrics-option-dialog>

      <paper-dialog id="getConnectedDialog" modal="">
        <!-- iframe gets inserted here once we are given the invite URL. -->
        <div class="buttons">
          <paper-button on-tap="closeGetConnectedDialog" autofocus="">[[localize('close')]]</paper-button>
        </div>
      </paper-dialog>

      <paper-dialog id="licenses" modal="" restorefocusonclose="">
        <paper-dialog-scrollable>
          <code id="licensesText">
            [[localize('error-licenses')]]
          </code>
        </paper-dialog-scrollable>
        <div class="buttons">
          <paper-button dialog-dismiss="" autofocus="">[[localize('close')]]</paper-button>
        </div>
      </paper-dialog>
    </div>
`;
  }

  static get is() {
    return 'app-root';
  }

  static get properties() {
    return {
      // Properties language and useKeyIfMissing are used by Polymer.AppLocalizeBehavior.
      language: {type: String, readonly: true},
      // An array of {id, name, dir} language objects.
      supportedLanguages: {type: Array, readonly: true},
      useKeyIfMissing: {type: Boolean},
      serverList: {type: Array},
      selectedServer: {type: Object},
      hasManualServers: {
        type: Boolean,
        computed: '_computeHasManualServers(serverList.*)',
      },
      adminEmail: {type: String},
      isSignedInToDigitalOcean: {
        type: Boolean,
        computed: '_computeIsSignedInToDigitalOcean(adminEmail)',
      },
      outlineVersion: String,
      userAcceptedTos: {
        type: Boolean,
        // Get notified when the user clicks the OK button in the ToS view
        observer: '_userAcceptedTosChanged',
      },
      hasAcceptedTos: {
        type: Boolean,
        computed: '_computeHasAcceptedTermsOfService(userAcceptedTos)',
      },
      currentPage: {type: String},
      shouldShowSideBar: {type: Boolean},
      sideBarMarginClass: {
        type: String,
        computed: '_computeSideBarMarginClass(shouldShowSideBar)',
      },
    };
  }

  constructor() {
    super();
    /** @type {DisplayServer} */
    this.selectedServer = undefined;
    this.language = '';
    this.supportedLanguages = [];
    this.useKeyIfMissing = true;
    /** @type {DisplayServer[]} */
    this.serverList = [];
    this.adminEmail = '';
    this.outlineVersion = '';
    this.currentPage = 'intro';
    this.shouldShowSideBar = false;

    this.addEventListener('RegionSelected', this.handleRegionSelected);
    this.addEventListener(
        'SetUpGenericCloudProviderRequested', this.handleSetUpGenericCloudProviderRequested);
    this.addEventListener('SetUpAwsRequested', this.handleSetUpAwsRequested);
    this.addEventListener('SetUpGcpRequested', this.handleSetUpGcpRequested);
    this.addEventListener('ManualServerEntryCancelled', this.handleManualCancelled);
  }

  /**
   * Sets the language and direction for the application
   * @param {string} language
   * @param {string} direction
   */
  setLanguage(language, direction) {
    const messagesUrl = `./messages/${language}.json`;
    this.loadResources(messagesUrl, language);

    const alignDir = direction === 'ltr' ? 'left' : 'right';
    this.$.appDrawer.align = alignDir;
    this.$.sideBar.align = alignDir;

    this.language = language;
  }

  showIntro() {
    this.maybeCloseDrawer();
    this.selectedServer = undefined;
    this.currentPage = 'intro';
  }

  getDigitalOceanOauthFlow(onCancel) {
    const oauthFlow = this.$.digitalOceanOauth;
    oauthFlow.onCancel = onCancel;
    return oauthFlow;
  }

  showDigitalOceanOauthFlow() {
    this.currentPage = 'digitalOceanOauth';
  }

  getAndShowDigitalOceanOauthFlow(onCancel) {
    this.currentPage = 'digitalOceanOauth';
    const oauthFlow = this.getDigitalOceanOauthFlow(onCancel);
    oauthFlow.showConnectAccount();
    return oauthFlow;
  }

  getAndShowRegionPicker() {
    this.currentPage = 'regionPicker';
    this.$.regionPicker.init();
    return this.$.regionPicker;
  }

  getManualServerEntry() {
    return this.$.manualEntry;
  }

  /**
   * @param {string} serverName
   * @param {boolean} showCancelButton
   */
  showProgress(serverName, showCancelButton) {
    this.currentPage = 'serverProgressStep';
    this.$.serverProgressStep.serverName = serverName;
    this.$.serverProgressStep.showCancelButton = showCancelButton;
    this.$.serverProgressStep.start();
  }

  showServerView() {
    this.$.serverProgressStep.stop();
    this.currentPage = 'serverView';
  }

  /**
   * Gets the ServerView for the server given by its id
   * @param {string} displayServerId
   * @returns {ServerView}
   */
  getServerView(displayServerId) {
    if (!displayServerId) {
      return null;
    }
    const selectedServerId = this._base64Encode(displayServerId);
    return this.$.serverView.querySelector(`#serverView-${selectedServerId}`);
  }

  handleRegionSelected(/** @type {Event} */ e) {
    this.fire('SetUpServerRequested', {
      regionId: this.$.regionPicker.getSelectedRegionId(),
    });
  }

  handleSetUpGenericCloudProviderRequested() {
    this.handleManualServerSelected('generic');
  }

  handleSetUpAwsRequested() {
    this.handleManualServerSelected('aws');
  }

  handleSetUpGcpRequested() {
    this.handleManualServerSelected('gcp');
  }

  handleManualServerSelected(/** @type {'generic'|'aws'|'gcp'} */ cloudProvider) {
    this.$.manualEntry.clear();
    this.$.manualEntry.cloudProvider = cloudProvider;
    this.currentPage = 'manualEntry';
  }

  handleManualCancelled() {
    this.currentPage = 'intro';
  }

  showError(/** @type {string} */ errorMsg) {
    this.showToast(errorMsg, Infinity);
  }

  showNotification(/** @type {string} */ message, durationMs = 3000) {
    this.showToast(message, durationMs);
  }

  /**
   * Show a toast with a message
   * @param {string} message
   * @param {number} duration in seconds
   */
  showToast(message, duration) {
    const toast = this.$.toast;
    toast.close();
    // Defer in order to trigger the toast animation, otherwise the
    // update happens in place.
    setTimeout(() => {
      toast.show({
        text: message,
        duration: duration,
        noOverlap: true,
      });
    }, 0);
  }

  closeError() {
    this.$.toast.close();
  }

  /**
   * @param {(retry: boolean) => void} cb a function which accepts a single boolean which is true
   *     iff
   *      the user chose to retry the failing operation.
   */
  showConnectivityDialog(cb) {
    const dialogTitle = this.localize('error-connectivity-title');
    const dialogText = this.localize('error-connectivity');
    this.showModalDialog(dialogTitle, dialogText, [this.localize('cancel'), this.localize('retry')])
        .then(clickedButtonIndex => {
          cb(clickedButtonIndex === 1);  // pass true if user clicked retry
        });
  }

  getConfirmation(title, text, confirmButtonText, continueFunc) {
    this.showModalDialog(title, text, [this.localize('cancel'), confirmButtonText])
        .then(clickedButtonIndex => {
          if (clickedButtonIndex === 1) {
            // user clicked to confirm.
            continueFunc();
          }
        });
  }

  /**
   * @param {string} errorTitle
   * @param {string} errorText
   */
  showManualServerError(errorTitle, errorText) {
    this.showModalDialog(errorTitle, errorText, [this.localize('cancel'), this.localize('retry')])
        .then(clickedButtonIndex => {
          if (clickedButtonIndex == 1) {
            this.$.manualEntry.retryTapped();
          } else {
            this.$.manualEntry.cancelTapped();
          }
        });
  }
  _computeIsSignedInToDigitalOcean(adminEmail) {
    return Boolean(adminEmail);
  }

  _computeHasManualServers(serverList) {
    return this.serverList.filter(server => !server.isManaged).length > 0;
  }

  _userAcceptedTosChanged(userAcceptedTos) {
    if (userAcceptedTos) {
      window.localStorage[TOS_ACK_LOCAL_STORAGE_KEY] = Date.now();
    }
  }

  _computeHasAcceptedTermsOfService(userAcceptedTos) {
    return userAcceptedTos || !!window.localStorage[TOS_ACK_LOCAL_STORAGE_KEY];
  }

  _toggleAppDrawer() {
    const drawerNarrow = this.$.drawerLayout.narrow;
    const forceNarrow = this.$.drawerLayout.forceNarrow;
    if (drawerNarrow) {
      if (forceNarrow) {
        // The window width is below the responsive threshold. Do not force narrow mode.
        this.$.drawerLayout.forceNarrow = false;
      }
      this.$.appDrawer.toggle();
    } else {
      // Forcing narrow mode when the window width is above the responsive threshold effectively
      // collapses the drawer. Conversely, reverting force narrow expands the drawer.
      this.$.drawerLayout.forceNarrow = !forceNarrow;
    }
  }

  maybeCloseDrawer() {
    if (this.$.drawerLayout.narrow || this.$.drawerLayout.forceNarrow) {
      this.$.appDrawer.close();
    }
  }

  submitFeedbackTapped() {
    this.$.feedbackDialog.open();
    this.maybeCloseDrawer();
  }

  aboutTapped() {
    this.$.aboutDialog.open();
    this.maybeCloseDrawer();
  }

  signOutTapped() {
    this.fire('SignOutRequested');
  }

  openManualInstallFeedback(/** @type {string} */ prepopulatedMessage) {
    this.$.feedbackDialog.open(prepopulatedMessage, true);
  }

  openShareDialog(accessKey, s3Url) {
    this.$.shareDialog.open(accessKey, s3Url);
  }

  openGetConnectedDialog(/** @type {string} */ inviteUrl) {
    const dialog = this.$.getConnectedDialog;
    if (dialog.children.length > 1) {
      return;  // The iframe is already loading.
    }
    // Reset the iframe's state, by replacing it with a newly constructed
    // iframe. Unfortunately the location.reload API does not work in our case due to
    // this Chrome error:
    // "Blocked a frame with origin "outline://web_app" from accessing a cross-origin frame."
    const iframe = document.createElement('iframe');
    iframe.onload = function() {
      dialog.open();
    };
    iframe.src = inviteUrl;
    dialog.insertBefore(iframe, dialog.children[0]);
  }

  closeGetConnectedDialog() {
    const dialog = this.$.getConnectedDialog;
    dialog.close();
    const oldIframe = dialog.children[0];
    dialog.removeChild(oldIframe);
  }

  showMetricsDialogForNewServer() {
    this.$.metricsDialog.showMetricsOptInDialog();
  }

  /**
   * @param {string} title
   * @param {string} text
   * @param {string[]} buttons
   * @returns {Promise<number>} a Promise which fulfills with the index of the button clicked.
   */
  showModalDialog(title, text, buttons) {
    return this.$.modalDialog.open(title, text, buttons);
  }

  closeModalDialog(title, text, buttons) {
    return this.$.modalDialog.close();
  }

  showLicensesTapped() {
    var xhr = new XMLHttpRequest();
    xhr.onload = () => {
      this.$.licensesText.innerText = xhr.responseText;
      this.$.licenses.open();
    };
    xhr.onerror = () => {
      console.error('could not load license.txt');
    };
    xhr.open('GET', '/ui_components/licenses/licenses.txt', true);
    xhr.send();
  }

  _computeShouldShowSideBar() {
    const drawerNarrow = this.$.drawerLayout.narrow;
    const drawerOpened = this.$.appDrawer.opened;
    if (drawerOpened && drawerNarrow) {
      this.shouldShowSideBar = false;
    } else {
      this.shouldShowSideBar = drawerNarrow;
    }
  }

  _computeSideBarMarginClass(shouldShowSideBar) {
    return shouldShowSideBar ? 'side-bar-margin' : '';
  }

  _isServerManaged(server) {
    return server.isManaged;
  }

  _isServerManual(server) {
    return !server.isManaged;
  }

  _sortServersByName(a, b) {
    const aName = a.name.toUpperCase();
    const bName = b.name.toUpperCase();
    if (aName < bName) {
      return -1;
    } else if (aName > bName) {
      return 1;
    }
    return 0;
  }

  _computeServerClasses(selectedServer, server) {
    let serverClasses = [];
    if (this._isServerSelected(selectedServer, server)) {
      serverClasses.push('selected');
    }
    if (!server.isSynced) {
      serverClasses.push('syncing');
    }
    return serverClasses.join(' ');
  }

  _computeServerImage(selectedServer, server) {
    if (this._isServerSelected(selectedServer, server)) {
      return 'server-icon-selected.png';
    }
    return 'server-icon.png';
  }

  _isServerSelected(selectedServer, server) {
    return !!selectedServer && selectedServer.id === server.id;
  }

  _showServer(event) {
    const server = event.model.server;
    this.fire('ShowServerRequested', {displayServerId: server.id});
    this.maybeCloseDrawer();
  }

  // Wrapper to encode a string in base64. This is necessary to set the server view IDs to
  // the display server IDs, which are URLs, so they can be used with selector methods. The IDs
  // are never decoded.
  _base64Encode(s) {
    return btoa(s).replace(/=/g, '');
  }
}
customElements.define(AppRoot.is, AppRoot);
