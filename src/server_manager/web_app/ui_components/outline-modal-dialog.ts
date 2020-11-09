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
import '@polymer/polymer/polymer-legacy.js';
import '@polymer/paper-button/paper-button.js';
import './outline-step-view.js';

import {css, customElement, html, LitElement, property} from 'lit-element';
import {COMMON_STYLES} from './cloud-install-styles';
import {PaperDialogElement} from "@polymer/paper-dialog/paper-dialog";

@customElement('outline-modal-dialog')
export class OutlineModalDialog extends LitElement {
  @property({type: Function}) localize: Function;
  @property({type: String}) titleMessageId: string;
  @property({type: String}) textMessageId: string;
  @property({type: Array}) buttonMessageIds: string[];

  private fulfill: (value?: number | PromiseLike<number>) => void;
  private reject: (value?: number | PromiseLike<number>) => void;

  static get styles() {
    return [
      COMMON_STYLES, css`
      :host {
        margin: 0px;
      }
      h3 {
        margin-bottom: 0;
      }
      paper-button {
        color: var(--primary-green);
      }`];
  }

  render() {
    const header = this.titleMessageId ? html`<h3>${this.localize(this.titleMessageId)}</h3>`: '';

    return html`
    <paper-dialog id="dialog" modal="">
      ${header} 
      <div>${this.localize(this.textMessageId)}</div>
      <p class="buttons">
        ${this.buttonMessageIds.map((messageId) => 
          html`<paper-button dialog-dismiss="" @tap="${this.onButtonTapped}">${this.localize(messageId)}</paper-button>`)}
      </p>
    </paper-dialog>`;
  }

  open(titleMessageId: string, textMessageId: string, buttonMessageIds: string[]): Promise<number> {
    this.titleMessageId = titleMessageId;
    this.textMessageId = textMessageId;
    this.buttonMessageIds = buttonMessageIds;

    const dialog = this.shadowRoot.querySelector('#dialog') as PaperDialogElement;
    dialog.open();
    return new Promise((fulfill, reject) => {
      this.fulfill = fulfill;
      this.reject = reject;
    });
  }

  close(): void {
    const dialog = this.shadowRoot.querySelector('#dialog') as PaperDialogElement;
    dialog.close();
  }

  private onButtonTapped(event: Event) {
    if (!this.fulfill) {
      console.error('outline-modal-dialog: this.fulfill not defined');
      return;
    }
    // @ts-ignore
    this.fulfill(event.model.index);
  }
}
