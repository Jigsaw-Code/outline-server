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
import '@polymer/paper-dialog/paper-dialog';

import '@polymer/paper-dialog-scrollable/paper-dialog-scrollable';
import {Polymer} from '@polymer/polymer/lib/legacy/polymer-fn';
import {html} from '@polymer/polymer/lib/utils/html-tag';
import * as clipboard from 'clipboard-polyfill';

export interface OutlineShareDialog extends Element {
  open(accessKey: string, s3url: string): void;
}

// TODO(alalama): add a language selector. This should be a separate instance of
// Polymer.AppLocalizeBehavior so the app language is not changed. Consider refactoring l10n into a
// separate Polymer behavior.
Polymer({
  _template: html`
    <style include="cloud-install-styles"></style>
    <style>
      :host {
        margin: 0px;
      }
      a {
        color: #009485;
      }
      #dialog {
        display: flex;
        flex-flow: column nowrap;
        width: 100%;
        padding: 24px;
      }
      #dialog-header {
        text-align: left;
        margin: 0 0 18px 0;
        padding: 0;
      }
      #dialog-header h3 {
        font-size: 18px;
        color: rgba(0, 0, 0, 0.87);
        opacity: 0.87;
        line-height: 24px;
        padding: 0;
      }
      #dialog-header p {
        font-size: 14px;
        color: rgba(0, 0, 0, 0.54);
        line-height: 20px;
        max-width: 85%;
        margin: 0;
      }
      #selectableText {
        height: 144px;
        overflow: auto;
        background-color: #eceff1;
        border-radius: 2px;
        margin: 0;
        padding: 18px;
        font-size: 12px;
        line-height: 18px;
      }
      #selectableText p {
        color: black;
        padding: 0;
        margin-top: 0;
        margin-bottom: 14px;
      }
      #selectableText a {
        text-decoration: underline;
        color: #009485;
        font-weight: 500;
        border: none;
      }
      #copyText {
        text-align: center;
        color: rgba(0, 0, 0, 0.54);
        margin: 0;
      }
      #button-row {
        margin: 24px 0;
        padding: 0;
        letter-spacing: 0.62px;
      }
      #copyButton {
        color: #f1f2f3;
        background-color: #263238;
      }
      #doneButton {
        color: #009485;
        right: 0;
        position: absolute;
      }
    </style>
    <paper-dialog id="dialog" modal="">
      <div id="dialog-header">
        <h3>[[localize('share-title')]]</h3>
        <p
          inner-h-t-m-l="[[localize('share-description', 'openLink', '<a href=https://securityplanner.org/#/all-recommendations>', 'closeLink', '</a>')]]"
        ></p>
      </div>
      <div contenteditable="" id="selectableText" style="-webkit-text-size-adjust: 100%;">
        <p>[[localize('share-invite')]]</p>

        <p><a href$="{{s3Url}}">{{s3Url}}</a></p>
        <p>-----</p>
        <p>[[localize('share-invite-trouble')]]</p>
        <ol>
          <li>
            [[localize('share-invite-copy-access-key')]]
            <a href="{{accessKey}}">{{accessKey}}</a>
          </li>
          <li>
            [[localize('share-invite-instructions')]]
            <a
              href="https://github.com/Jigsaw-Code/outline-client/blob/master/docs/invitation_instructions.md"
              >https://github.com/Jigsaw-Code/outline-client/blob/master/docs/invitation_instructions.md</a
            >
          </li>
        </ol>
      </div>
      <div id="button-row">
        <paper-button id="copyButton" on-tap="copyClicked"
          >[[localize('share-invite-copy')]]</paper-button
        >
        <paper-button id="doneButton" dialog-confirm="">[[localize('done')]]</paper-button>
      </div>
      <div id="copyText" hidden="">[[localize('share-invite-copied')]]</div>
    </paper-dialog>
  `,

  is: 'outline-share-dialog',

  properties: {
    localize: {type: Function},
  },

  open(accessKey: string, s3Url: string) {
    this.accessKey = accessKey;
    this.s3Url = s3Url;
    this.$.copyText.setAttribute('hidden', true);
    this.$.dialog.open();
  },

  copyClicked() {
    const dt = new clipboard.DT();
    dt.setData('text/plain', this.$.selectableText.innerText);
    dt.setData('text/html', this.$.selectableText.innerHTML);
    clipboard.write(dt);
    this.$.copyText.removeAttribute('hidden');
  },
});
