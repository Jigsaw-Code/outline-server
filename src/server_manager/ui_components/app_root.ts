// Copyright 2018 The Outline Authors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {DisplayServer} from '../web_app/display_server';

// tslint:disable-next-line:no-any
declare function Polymer(o: any): void;

// TODO: Import outline-i18n as a module, rather than a window global
declare namespace OutlineI18n {
  function getBestMatchingLanguage(languages: object): string;
}

const TOS_ACK_LOCAL_STORAGE_KEY = 'tos-ack';

// TODO: Convert to a PolymerElement class
Polymer({
  is: 'app-root',
  behaviors: [
    // tslint:disable-next-line:no-any
    (Polymer as any).AppLocalizeBehavior
  ],
  properties: {
    LANGUAGES_AVAILABLE: {
      type: Object,
      readonly: true,
      value: {
        am: {id: 'am', dir: 'ltr'},
        ar: {id: 'ar', dir: 'rtl'},
        bg: {id: 'bg', dir: 'ltr'},
        ca: {id: 'ca', dir: 'ltr'},
        cs: {id: 'cs', dir: 'ltr'},
        da: {id: 'da', dir: 'ltr'},
        de: {id: 'de', dir: 'ltr'},
        el: {id: 'el', dir: 'ltr'},
        en: {id: 'en', dir: 'ltr'},
        'es-419': {id: 'es-419', dir: 'ltr'},
        fa: {id: 'fa', dir: 'rtl'},
        fi: {id: 'fi', dir: 'ltr'},
        fil: {id: 'fil', dir: 'ltr'},
        fr: {id: 'fr', dir: 'ltr'},
        he: {id: 'he', dir: 'rtl'},
        hi: {id: 'hi', dir: 'ltr'},
        hr: {id: 'hr', dir: 'ltr'},
        hu: {id: 'hu', dir: 'ltr'},
        id: {id: 'id', dir: 'ltr'},
        it: {id: 'it', dir: 'ltr'},
        ja: {id: 'ja', dir: 'ltr'},
        ko: {id: 'ko', dir: 'ltr'},
        km: {id: 'km', dir: 'ltr'},
        lt: {id: 'lt', dir: 'ltr'},
        lv: {id: 'lv', dir: 'ltr'},
        nl: {id: 'nl', dir: 'ltr'},
        no: {id: 'no', dir: 'ltr'},
        pl: {id: 'pl', dir: 'ltr'},
        'pt-BR': {id: 'pt-BR', dir: 'ltr'},
        ro: {id: 'ro', dir: 'ltr'},
        ru: {id: 'ru', dir: 'ltr'},
        sk: {id: 'sk', dir: 'ltr'},
        sl: {id: 'sl', dir: 'ltr'},
        sr: {id: 'sr', dir: 'ltr'},
        'sr-Latn': {id: 'sr-Latn', dir: 'ltr'},
        sv: {id: 'sv', dir: 'ltr'},
        th: {id: 'th', dir: 'ltr'},
        tr: {id: 'tr', dir: 'ltr'},
        uk: {id: 'uk', dir: 'ltr'},
        ur: {id: 'ur', dir: 'rtl'},
        vi: {id: 'vi', dir: 'ltr'},
        zh: {id: 'zh', dir: 'ltr'},
        'zh-CN': {id: 'zh-CN', dir: 'ltr'},
        'zh-TW': {id: 'zh-TW', dir: 'ltr'},
      }
    },
    DEFAULT_LANGUAGE: {
      type: String,
      readonly: true,
      value: 'en'
    },
    useKeyIfMissing: {
      type: Boolean,
      value: true
    },
    language: {
      type: String,
      readonly: true,
      computed: '_computeLanguage(LANGUAGES_AVAILABLE, DEFAULT_LANGUAGE)'
    },
    serverList: {
      type: Array,
      value: [],
    },
    selectedServer: {
      type: Object, // DisplayServer in display_server.ts
      value: undefined,
    },
    hasManualServers: {
      type: Boolean,
      computed: '_computeHasManualServers(serverList.*)',
    },
    adminEmail: {
      type: String,
      value: ''
    },
    isSignedInToDigitalOcean: {
      type: Boolean,
      computed: '_computeIsSignedInToDigitalOcean(adminEmail)'
    },
    outlineVersion: String,
    userAcceptedTos: {
      type: Boolean,
       // Get notified when the user clicks the OK button in the ToS view
      observer: '_userAcceptedTosChanged',
    },
    hasAcceptedTos: {
      type: Boolean,
      computed: '_computeHasAcceptedTermsOfService(userAcceptedTos)'
    },
    currentPage: {
      type: String,
      value: 'intro'
    },
    shouldShowSideBar: {
      type: Boolean,
      value: false
    },
    sideBarMarginClass: {
      type: String,
      computed: '_computeSideBarMarginClass(shouldShowSideBar)'
    },
  },
  listeners: {
    'RegionSelected': 'handleRegionSelected',
    'MetricsChoiceSelected': 'handleMetricsChoiceSelected',
    'SetUpGenericCloudProviderRequested': 'handleSetUpGenericCloudProviderRequested',
    'SetUpAwsRequested': 'handleSetUpAwsRequested',
    'SetUpGcpRequested': 'handleSetUpGcpRequested',
    'ManualServerEntryCancelled': 'handleManualCancelled'
  },
  ready() {
    const messagesUrl = `/messages/${this.language}.json`;
    this.loadResources(messagesUrl, this.language);
    const languageProperties = this.LANGUAGES_AVAILABLE[this.language];
    if (languageProperties && languageProperties.dir === 'rtl') {
      document.documentElement.setAttribute('dir', 'rtl');
      this.$.appDrawer.align = 'right';
      this.$.sideBar.align = 'right';
    }
  },
  showIntro() {
    this.maybeCloseDrawer();
    this.selectedServer = undefined;
    this.currentPage = 'intro';
  },
  getDigitalOceanOauthFlow(onCancel: Function) {
    const oauthFlow = this.$.digitalOceanOauth;
    oauthFlow.onCancel = onCancel;
    return oauthFlow;
  },
  showDigitalOceanOauthFlow() {
    this.currentPage = 'digitalOceanOauth';
  },
  getAndShowDigitalOceanOauthFlow(onCancel: Function) {
    this.currentPage = 'digitalOceanOauth';
    const oauthFlow = this.getDigitalOceanOauthFlow(onCancel);
    oauthFlow.showConnectAccount();
    return oauthFlow;
  },
  getAndShowRegionPicker() {
    this.currentPage = 'regionPicker';
    this.$.regionPicker.init();
    return this.$.regionPicker;
  },
  getManualServerEntry() {
    return this.$.manualEntry;
  },
  showProgress(serverName: string, showCancelButton: boolean) {
    this.currentPage = 'serverProgressStep';
    this.$.serverProgressStep.serverName = serverName;
    this.$.serverProgressStep.showCancelButton = showCancelButton;
    this.$.serverProgressStep.start();
  },
  showServerView() {
    this.$.serverProgressStep.stop();
    this.currentPage = 'serverView';
  },
  getServerView(displayServerId: string) {
    if (!displayServerId) {
      return null;
    }
    const selectedServerId = this._base64Encode(displayServerId);
    return this.$.serverView.querySelector(`#serverView-${selectedServerId}`);
  },
  handleRegionSelected(e: Event) {
    this.fire('SetUpServerRequested', {
      regionId: this.$.regionPicker.getSelectedRegionId()
    });
  },
  handleSetUpGenericCloudProviderRequested() {
    this.handleManualServerSelected('generic');
  },
  handleSetUpAwsRequested() {
    this.handleManualServerSelected('aws');
  },
  handleSetUpGcpRequested() {
    this.handleManualServerSelected('gcp');
  },
  handleManualServerSelected(cloudProvider: string) {
    this.$.manualEntry.clear();
    this.$.manualEntry.cloudProvider = cloudProvider;
    this.currentPage = 'manualEntry';
  },
  handleManualCancelled() {
    this.currentPage = 'intro';
  },
  showError(errorMsg: string) {
    this.showToast(errorMsg, Infinity);
  },
  showNotification(message: string, durationMs=3000) {
    this.showToast(message, durationMs);
  },
  showToast(message: string, duration: number) {
    const toast = this.$.toast;
    toast.close();
    // Defer in order to trigger the toast animation, otherwise the
    // update happens in place.
    setTimeout(() => {
      toast.show({
        text: message,
        duration,
        noOverlap: true
      });
    }, 0);
  },
  closeError() {
    this.$.toast.close();
  },
  // cb is a function which accepts a single boolean which is true iff
  // the user chose to retry the failing operation.
  showConnectivityDialog(cb: (isRetry: boolean) => void) {
    const dialogTitle = this.localize('error-connectivity-title');
    const dialogText = this.localize('error-connectivity');
    this.showModalDialog(dialogTitle, dialogText, [this.localize('cancel'), this.localize('retry')])
    .then((clickedButtonIndex: number) => {
      cb(clickedButtonIndex === 1);  // pass true if user clicked retry
    });
  },
  getConfirmation(title: string, text: string, confirmButtonText: string, continueFunc: () => void) {
    this.showModalDialog(title, text, [this.localize('cancel'), confirmButtonText])
    .then((clickedButtonIndex: number) => {
      if (clickedButtonIndex === 1) {  // user clicked to confirm.
        continueFunc();
      }
    });
  },
  showManualServerError(errorTitle: string, errorText: string) {
    this.showModalDialog(errorTitle, errorText, [this.localize('cancel'), this.localize('retry')])
        .then((clickedButtonIndex: number) => {
          if (clickedButtonIndex === 1) {
            this.$.manualEntry.retryTapped();
          } else {
            this.$.manualEntry.cancelTapped();
          }
        });
  },
  _computeIsSignedInToDigitalOcean(adminEmail: string) {
    return Boolean(adminEmail);
  },
  _computeHasManualServers(serverList: DisplayServer[]) {
    return this.serverList.filter((server: DisplayServer) => !server.isManaged).length > 0;
  },
  _userAcceptedTosChanged(userAcceptedTos: boolean) {
    if (userAcceptedTos) {
      window.localStorage[TOS_ACK_LOCAL_STORAGE_KEY] = Date.now();
    }
  },
  _computeHasAcceptedTermsOfService(userAcceptedTos: boolean) {
    return userAcceptedTos || !!window.localStorage[TOS_ACK_LOCAL_STORAGE_KEY];
  },
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
  },
  maybeCloseDrawer() {
    if (this.$.drawerLayout.narrow || this.$.drawerLayout.forceNarrow) {
      this.$.appDrawer.close();
    }
  },
  submitFeedbackTapped() {
    this.$.feedbackDialog.open();
  },
  aboutTapped() {
    this.$.aboutDialog.open();
  },
  signOutTapped() {
    this.fire('SignOutRequested');
  },
  openManualInstallFeedback(prepopulatedMessage: string) {
    this.$.feedbackDialog.open(prepopulatedMessage, true);
  },
  openShareDialog(accessKey: string, s3Url: string) {
    this.$.shareDialog.open(accessKey, s3Url);
  },
  openGetConnectedDialog(inviteUrl: string) {
    const dialog = this.$.getConnectedDialog;
    if (dialog.children.length > 1) {
      return;  // The iframe is already loading.
    }
    // Reset the iframe's state, by replacing it with a newly constructed
    // iframe. Unfortunately the location.reload API does not work in our case due to
    // this Chrome error:
    // "Blocked a frame with origin "outline://web_app" from accessing a cross-origin frame."
    const iframe = document.createElement('iframe');
    iframe.onload = () => {
      dialog.open();
    };
    iframe.src = inviteUrl;
    dialog.insertBefore(iframe, dialog.children[0]);
  },
  closeGetConnectedDialog() {
    const dialog = this.$.getConnectedDialog;
    dialog.close();
    const oldIframe = dialog.children[0];
    dialog.removeChild(oldIframe);
  },
  showMetricsDialogForNewServer() {
    this.$.metricsDialog.showMetricsOptInDialog();
  },
  // Returns a Promise which fulfills with the index of the button clicked.
  showModalDialog(title: string, text: string, buttons: string[]) {
    return this.$.modalDialog.open(title, text, buttons);
  },
  closeModalDialog() {
    return this.$.modalDialog.close();
  },
  showLicensesTapped() {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      this.$.licensesText.innerText = xhr.responseText;
      this.$.licenses.open();
    };
    xhr.onerror = () => {
      console.error('could not load license.txt');
    };
    xhr.open('GET', '/ui_components/licenses/licenses.txt', true);
    xhr.send();
  },
  _computeShouldShowSideBar() {
    const drawerNarrow = this.$.drawerLayout.narrow;
    const drawerOpened = this.$.appDrawer.opened;
    if (drawerOpened && drawerNarrow) {
      this.shouldShowSideBar = false;
    } else {
      this.shouldShowSideBar = drawerNarrow;
    }
  },
  _computeSideBarMarginClass(shouldShowSideBar: boolean) {
    return shouldShowSideBar ? 'side-bar-margin' : '';
  },
  _isServerManaged(server: DisplayServer) {
    return server.isManaged;
  },
  _isServerManual(server: DisplayServer) {
    return !server.isManaged;
  },
  _sortServersByName(a: DisplayServer, b: DisplayServer) {
    const aName = a.name.toUpperCase();
    const bName = b.name.toUpperCase();
    if (aName < bName) {
      return -1;
    } else if (aName > bName) {
      return 1;
    }
    return 0;
  },
  _computeServerClasses(selectedServer: DisplayServer, server: DisplayServer) {
    const serverClasses = [];
    if (this._isServerSelected(selectedServer, server)) {
      serverClasses.push('selected');
    }
    if (!server.isSynced) {
      serverClasses.push('syncing');
    }
    return serverClasses.join(' ');
  },
  _computeServerImage(selectedServer: DisplayServer, server: DisplayServer) {
    if (this._isServerSelected(selectedServer, server)) {
      return 'server-icon-selected.png';
    }
    return 'server-icon.png';
  },
  _isServerSelected(selectedServer: DisplayServer, server: DisplayServer) {
    return !!selectedServer && selectedServer.id === server.id;
  },
  _showServer(event: {model: {server: DisplayServer}}) {
    const server: DisplayServer = event.model.server;
    this.fire('ShowServerRequested', {displayServerId: server.id });
    this.maybeCloseDrawer();
  },
  _computeLanguage(LANGUAGES_AVAILABLE: object, DEFAULT_LANGUAGE: string) {
    return OutlineI18n.getBestMatchingLanguage(
      Object.keys(LANGUAGES_AVAILABLE)) || DEFAULT_LANGUAGE;
  },
  // Wrapper to encode a string in base64. This is necessary to set the server view IDs to
  // the display server IDs, which are URLs, so they can be used with selector methods. The IDs
  // are never decoded.
  _base64Encode(s: string): string {
    return btoa(s).replace(/=/g, '');
  },
});
