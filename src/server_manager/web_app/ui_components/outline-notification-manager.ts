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

import '@polymer/paper-toast/paper-toast.js';
import '@polymer/paper-icon-button/paper-icon-button.js';

import {PaperToastElement} from '@polymer/paper-toast/paper-toast';
import {css, customElement, html, LitElement, property} from 'lit-element';
import {COMMON_STYLES} from './cloud-install-styles';

@customElement('outline-notification-manager')
export class OutlineNotificationManager extends LitElement {
  @property({type: Function}) localize: Function;

  static get styles() {
    return [
      COMMON_STYLES, css`
      paper-toast {
        align-items: center;
        display: flex;
        justify-content: space-between;
        padding: 24px;
        max-width: 450px;
      }
      paper-toast paper-icon-button {
        /* prevents the icon from resizing when there is a long message in the toast */
        flex-shrink: 0;
        padding: 0;
        height: 20px;
        width: 20px;
      }
      `
    ];
  }

  render() {
    return html`
        <paper-toast id="toast">
            <paper-icon-button icon="icons:close" @tap="${this.closeToast}"></paper-icon-button>
        </paper-toast>`;
  }

  showError(messageId: string) {
    this.showToast(this.localize(messageId), Infinity);
  }

  showErrorRaw(message: string) {
    this.showToast(message, Infinity);
  }

  showNotification(messageId: string, durationMs = 3000) {
    this.showToast(this.localize(messageId), durationMs);
  }

  private showToast(message: string, durationSeconds: number) {
    this.closeToast();
    // Defer in order to trigger the toast animation, otherwise the update happens in place.
    setTimeout(() => {
      this.getToast().show({
        text: message,
        durationSeconds,
        noOverlap: true,
      });
    }, 0);
  }

  private closeToast() {
    this.getToast().close();
  }

  private getToast(): PaperToastElement {
    return this.shadowRoot.querySelector('#toast');
  }
}
