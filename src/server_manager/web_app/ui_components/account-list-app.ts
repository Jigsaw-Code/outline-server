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
import '@polymer/paper-icon-button/paper-icon-button.js';
import '@polymer/paper-menu-button/paper-menu-button.js';

import {css, customElement, html, LitElement, property} from 'lit-element';
import {COMMON_STYLES} from "./cloud-install-styles";
import {Account} from "../../model/account";
import {makePublicEvent} from "../../infrastructure/events";

interface DisplayAccount {
  displayName: string;
}

@customElement('account-list-app')
export class AccountListApp extends LitElement {
  @property({type: Function}) localize: Function;
  @property({type: Array}) displayAccounts: DisplayAccount[] = [];

  static get styles() {
    return [COMMON_STYLES, css`
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
    `];
  }

  render() {
    return html`
    ${this.displayAccounts.map(displayAccount => {
      return html`
      <div class="servers-section">
        <div class="servers-header">
          <span>${this.localize('servers-digitalocean')}</span>
          <paper-menu-button horizontal-align="left" class="" close-on-activate="" no-animations="" dynamic-align="" no-overlap="">
            <paper-icon-button icon="more-vert" slot="dropdown-trigger"></paper-icon-button>
            <div class="do-overflow-menu" slot="dropdown-content">
              <h4>${this.localize('digitalocean-disconnect-account')}</h4>
              <div class="account-info"><img src="images/digital_ocean_logo.svg">${displayAccount.displayName}</div>
              <div class="sign-out-button" @tap="${this.onSignOut}">${this.localize('digitalocean-disconnect')}</div>
            </div>
          </paper-menu-button>
        </div>
<!--        <div class="servers-container">-->
<!--          <template is="dom-repeat" items="{{serverList}}" as="server" filter="_isServerManaged" sort="_sortServersByName">-->
<!--            <div class\$="server {{_computeServerClasses(selectedServer, server)}}" data-server\$="[[server]]" on-tap="_showServer">-->
<!--              <img class="server-icon" src\$="images/{{_computeServerImage(selectedServer, server)}}">-->
<!--              <span>{{server.name}}</span>-->
<!--            </div>-->
<!--          </template>-->
<!--        </div>-->
      </div>`;
    })}`;
  }

  updateAccounts(accounts: Account[]) {
    this.displayAccounts = accounts.map(account => account.getData());
  }

  private onSignOut() {
    // TODO: Pass account ID
    const event = makePublicEvent('AccountListApp#OnSignOut');
    this.dispatchEvent(event);
  }
}

@customElement('account-list-sidebar-app')
export class AccountListSidebarApp extends LitElement {
  @property({type: Array}) displayAccounts: DisplayAccount[] = [];

  static get styles() {
    return [COMMON_STYLES, css`
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
    `];
  }

  render() {
    return html`
    ${this.displayAccounts.map(displayAccount => {
      return html`
      <div class="side-bar-section servers-section">
        <img class="provider-icon" src="images/do_white_logo.svg">
<!--        <template is="dom-repeat" items="{{serverList}}" as="server" filter="_isServerManaged" sort="_sortServersByName">-->
<!--          <div class\$="server {{_computeServerClasses(selectedServer, server)}}" data-server\$="[[server]]" on-tap="_showServer">-->
<!--            <img class="server-icon" src\$="images/{{_computeServerImage(selectedServer, server)}}">-->
<!--          </div>-->
<!--        </template>-->
      </div>`;
    })}`;
  }

  updateAccounts(accounts: Account[]) {
    this.displayAccounts = accounts.map(account => {
      return {
        displayName: account.getData().id
      };
    });
  }
}
