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
import '@polymer/paper-dialog/paper-dialog.js';

import {css, customElement, html, LitElement, property} from 'lit-element';
import {COMMON_STYLES} from "./cloud-install-styles";
import {PaperDialogElement} from "@polymer/paper-dialog/paper-dialog";

@customElement('outline-about-dialog')
export class OutlineAboutDialog extends LitElement {
  @property({type: Function}) localize: Function;
  @property({type: String}) outlineVersion: string;

  static get styles() {
    return [
      COMMON_STYLES, css`
      #dialog {
        width: 80%;
        text-align: center;
      }

      #outlineLogo {
        height: 100px;
        margin-top: 20px;
      }

      #version {
        font-weight: bold;
      }

      p {
        margin: 20px 0 0 0;
        text-align: left;
      }

      #version {
        margin: 0;
        text-align: center;
      }

      a {
        color: #00ac9b;
      }

      #licenses {
        min-width: 90%;
      }

      #licenses code {
        font-size: 0.7em;
      }`
    ];
  }

  render() {
    return html`
      <paper-dialog id="dialog" modal="">
        <div>
          <img id="outlineLogo" src="images/manager-about-logo2x.png">
        </div>
        <p id="version" .innerHTML="${this.localize('about-version', 'version', this.outlineVersion)}"></p>
        <p .innerHTML="${this.localize('about-outline', 'jigsawUrl', 'https://jigsaw.google.com', 'shadowsocksUrl', 'https://shadowsocks.org', 'gitHubUrl', 'https://github.com/jigsaw-Code/?q=outline', 'redditUrl', 'https://www.reddit.com/r/outlinevpn', 'mediumUrl', 'https://medium.com/jigsaw')}">
          &gt;
        </p>
        <p>
          <a href="https://jigsaw.google.com/">
            <img src="images/jigsaw-logo.svg">
          </a>
        </p>
        <div class="buttons">
          <paper-button dialog-dismiss="" autofocus="">${this.localize('close')}</paper-button>
        </div>
      </paper-dialog>`;
  }

  open() {
    const dialog = this.shadowRoot.getElementById('dialog') as PaperDialogElement;
    dialog.open();
  }
}
