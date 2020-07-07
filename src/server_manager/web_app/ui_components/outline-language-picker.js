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
import '@polymer/paper-dropdown-menu/paper-dropdown-menu.js';
import '@polymer/paper-listbox/paper-listbox.js';
import '@polymer/paper-item/paper-item.js';
import '@polymer/iron-icon/iron-icon.js';
import '@polymer/iron-icons/iron-icons.js';
import './cloud-install-styles.js';

import {html, PolymerElement} from '@polymer/polymer';

export class OutlineLanguagePicker extends PolymerElement {
  static get template() {
    return html`
    <style include="cloud-install-styles"></style>
    <style>
      paper-dropdown-menu {
        --paper-input-container-input: {
          color: var(--medium-gray);
          font-size: 14px;
        };
      }
      .language-item {
        display: flex;
        cursor: pointer;
        font-size: 16px;
        padding-left: 24px;
        --paper-item-selected: {
          color: var(--primary-green);
          font-weight: normal;
        }
      }
      .language-name {
        flex-grow: 1;
      }
    </style>
    <paper-dropdown-menu no-label-float="" vertical-align="bottom">
      <paper-listbox slot="dropdown-content" selected="{{selectedLanguage}}" attr-for-selected="value" on-selected-changed="_languageChanged">
        <template is="dom-repeat" items="{{languages}}" as="lang">
          <paper-item class="language-item" value="{{lang.id}}">
            <span class="language-name">{{lang.name}}</span>
            <iron-icon icon="check" hidden$="{{_shouldHideCheckmark(selectedLanguage, lang.id)}}"></iron-icon>
          </paper-item>
        </template>
      </paper-listbox>
    </paper-dropdown-menu>`;
  }

  static get is() {
    return 'outline-language-picker';
  }

  static get properties() {
    return {
      selectedLanguage: {type: String},
      // An array of {id, name, dir} language objects.
      languages: {type: Array, readonly: true},
    };
  }

  constructor() {
    super();
    this.selectedLanguage = '';
    /** @type {Array<{id: string, name: string, dir: "rtl"|"ltr"}>} */
    this.languages = [];
  }

  _shouldHideCheckmark(language, languageCode) {
    return language !== languageCode;
  }

  _languageChanged(event) {
    const languageCode = event.detail.value;
    const languageDir = this.languages.find((lang) => {return lang.id === languageCode}).dir;

    const params = {bubbles: true, composed: true, detail: {languageCode, languageDir}};
    const customEvent = new CustomEvent('SetLanguageRequested', params);
    this.dispatchEvent(customEvent);
  }
}

customElements.define(OutlineLanguagePicker.is, OutlineLanguagePicker);
