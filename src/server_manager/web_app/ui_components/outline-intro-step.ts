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
import './outline-step-view.js';

import {css, customElement, html, LitElement, property} from 'lit-element';
import {COMMON_STYLES} from './cloud-install-styles';
import {makePublicEvent} from "../../infrastructure/dom_events";

@customElement('outline-intro-step')
export class OutlineIntroStep extends LitElement {
  /**
   * Event fired when the DigitalOcean card is tapped.
   *
   * @event ConnectToDigitalOcean
   */
  public static readonly EVENT_DIGITALOCEAN_CARD_TAPPED = 'ConnectToDigitalOcean';
  /**
   * Event fired when the Amazon Web Services (AWS) card is tapped.
   *
   * @event SetUpAwsRequested
   */
  public static readonly EVENT_AWS_CARD_TAPPED = 'SetUpAwsRequested';
  /**
   * Event fired when the Google Cloud Platform (GCP) card is tapped.
   *
   * @event SetUpGcpRequested
   */
  public static readonly EVENT_GCP_CARD_TAPPED = 'SetUpGcpRequested';
  /**
   * Event fired when the generic cloud provider card is tapped.
   *
   * @event SetUpGenericCloudProviderRequested
   */
  public static readonly EVENT_GENERIC_CLOUD_PROVIDER_CARD_TAPPED =
      'SetUpGenericCloudProviderRequested';

  @property({type: Function}) localize: Function;
  @property({type: String}) digitalOceanEmail: string;
  @property({type: String}) gcpAccountName: string;

  static get styles() {
    return [
      COMMON_STYLES, css`
      :host {
        text-align: center;
        --manual-server-green: #00bfa5;
        --aws-orange: #ff9900;
        --gcp-blue: #4285f4;
        --do-blue: #1565c0;
      }
      .container {
        display: flex;
        flex-flow: row wrap;
        padding: 12px 0;
      }
      .card {
        background-color: var(--background-contrast-color);
        display: flex;
        flex-direction: column;
        flex: 1 0 40%;
        justify-content: space-between;
        padding: 16px 24px 12px 24px;
        margin: 12px 12px 0 0;
        height: 320px;
        text-align: left;
        color: var(--medium-gray);
        font-weight: normal;
        border-radius: 2px;
        /* For shadows and hover/click colours. */
        transition: 135ms;
        /* Whole card is clickable. */
        cursor: pointer;
        box-shadow: 0 3px 1px -2px rgba(0, 0, 0, 0.02), 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12);
      }
      /* Card shadows (common to all cards). */
      .card:hover {
        box-shadow: 0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 4px 5px 0 rgba(0, 0, 0, 0.1), 0 1px 10px 0 rgba(0, 0, 0, 0.2);
      }
      .card:active {
        box-shadow: 0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14),
          0 3px 14px 2px rgba(0, 0, 0, 0.12);
      }
      /* DigitalOcean card background colours (gets brighter, inactive -> active). */
      .card#digital-ocean {
        background: var(--do-blue);
      }
      .card#digital-ocean:hover {
        background: rgba(28, 103, 189, 0.92);
      }
      /* Non-DigitalOcean card background colours (get darker, inactive -> active). */
      .card:hover {
        background: rgba(38, 50, 56, 0.16);
      }
      .card .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        color: var(--light-gray);
      }
      .card .card-body {
        flex: 6; /* for spacing */
      }
      .card p {
        margin: 0;
      }
      .card .tag {
        font-weight: 500;
        letter-spacing: 0.05em;
        font-size: 10px;
        text-transform: uppercase;
      }
      .card#digital-ocean .tag,
      .card#digital-ocean .email,
      .card p {
        color: var(--medium-gray);
      }
      .card#manual-server .tag {
        color: var(--manual-server-green);
      }
      .card#aws .tag {
        color: var(--aws-orange);
      }
      .card#gcp .tag {
        color: var(--gcp-blue);
      }
      .card-title {
        font-size: 20px;
        line-height: 32px;
        flex: 2; /* for spacing */
        color: var(--light-gray);
      }
      .card img {
        margin-top: 11px;
      }
      #digital-ocean img {
        height: 22px;
        width: 22px;
      }
      .card .description {
        letter-spacing: 0;
        line-height: 24px;
      }
      .card .description ul {
        margin-top: 0px;
        padding-left: 16px;
      }
      .card .description ul li {
        margin-bottom: 8px;
      }
      .card-footer {
        padding-top: 12px;
        border-top: 1px solid var(--border-color);
      }
      .card-footer paper-button {
        width: 100%;
        height: 100%;
        margin: 0;
        letter-spacing: 0.75px;
        background-color: inherit;
        color: var(--light-gray);
      }
      #digital-ocean .description ul {
        /* NOTE: this URL must be relative to the ui_components sub dir,
           unlike our <img src="..."> attributes */
        list-style-image: url("../images/check_white.svg");
      }
      #manual-server .description ul {
        list-style-image: url("../images/check_green.svg");
      }
      #aws .description ul {
        list-style-image: url("../images/check_orange.svg");
      }
      #gcp .description ul {
        list-style-image: url("../images/check_blue.svg");
      }
      /* Reverse check icon for RTL languages */
      :host(:dir(rtl)) #digital-ocean .description ul {
        list-style-image: url("../images/check_white_rtl.svg");
      }
      :host(:dir(rtl)) #manual-server .description ul {
        list-style-image: url("../images/check_green_rtl.svg");
      }
      :host(:dir(rtl)) #aws .description ul {
        list-style-image: url("../images/check_orange_rtl.svg");
      }
      :host(:dir(rtl)) #gcp .description ul {
        list-style-image: url("../images/check_blue_rtl.svg");
      }`];
  }

  render() {
    let doCardHeaderText;
    let doCardDescription;
    if (this.digitalOceanEmail) {
      doCardHeaderText = html`<div class="email">${this.digitalOceanEmail}</div>`;
      doCardDescription = html`<p>${this.localize('setup-do-create')}</p>`;
    } else {
      doCardHeaderText = html`<div class="tag">${this.localize('setup-recommended')}</div>`;
      doCardDescription = html`<ul>
        <li>${this.localize('setup-do-easiest')}</li>
        <li>${this.localize('setup-do-cost')}</li>
        <li>${this.localize('setup-do-data')}</li>
        <li>${this.localize('setup-do-cancel')}</li>
      </ul>`;
    }

    let gcpCardHeaderText;
    let gcpCardDescription;
    if (this.gcpAccountName) {
      gcpCardHeaderText = html`<div class="email">${this.gcpAccountName}</div>`;
      gcpCardDescription = html`<p>${this.localize('setup-do-create')}</p>`;
    } else {
      gcpCardHeaderText = html`<div class="tag">${this.localize('setup-recommended')}</div>`;
      gcpCardDescription = html`<ul>
        <li>${this.localize('setup-do-easiest')}</li>
      </ul>`;
    }

    return html`
      <outline-step-view>
        <span slot="step-title">${this.localize('setup-title')}</span>
        <span slot="step-description">${this.localize('setup-description')}</span>
  
        <div class="container">
          <div id="digital-ocean" class="card" @tap="${this.connectToDigitalOceanTapped}">
            <div class="card-header">
              ${doCardHeaderText}
              <img src="images/do_white_logo.svg">
            </div>
            <div class="card-title">DigitalOcean</div>
            <div class="card-body">
              <div class="description">
                ${doCardDescription}
              </div>
            </div>
            <div class="card-footer">
              <paper-button class="primary">
                ${this.digitalOceanEmail ? this.localize('setup-create') : this.localize('setup-action')}
              </paper-button>
            </div>
          </div>
  
          <div id="gcp" class="card" @tap="${this.setUpGcpTapped}">
            <div class="card-header">
              <div class="tag">${this.localize('setup-advanced')}</div>
              <img src="images/gcp-logo.svg">
            </div>
            <div class="card-title">Google Cloud Platform</div>
            <div class="card-body">
              <div class="description">
                <ul>
                  <li>${this.localize('setup-step-by-step')}</li>
                  <li>${this.localize('setup-firewall-instructions')}</li>
                  <li>${this.localize('setup-simple-commands')}</li>
                </ul>
              </div>
            </div>
            <div class="card-footer">
              <paper-button @tap="${this.setUpGcpTapped}" class="primary">
                ${this.localize('setup-action')}
              </paper-button>
            </div>
          </div>
  
          <div id="aws" class="card" @tap="${this.setUpAwsTapped}">
            <div class="card-header">
              <div class="tag">${this.localize('setup-advanced')}</div>
              <img src="images/aws-logo.svg">
            </div>
            <div class="card-title">Amazon Lightsail</div>
            <div class="card-body">
              <div class="description">
                <ul>
                  <li>${this.localize('setup-step-by-step')}</li>
                  <li>${this.localize('setup-firewall-instructions')}</li>
                  <li>${this.localize('setup-simple-commands')}</li>
                </ul>
              </div>
            </div>
            <div class="card-footer">
              <paper-button @tap="${this.setUpAwsTapped}" class="primary">
                ${this.localize('setup-action')}
              </paper-button>
            </div>
          </div>
  
          <div id="manual-server" class="card" @tap="${this.setUpGenericCloudProviderTapped}">
            <div class="card-header">
              <div class="tag">${this.localize('setup-advanced')}</div>
              <img src="images/cloud.svg">
            </div>
            <div class="card-title">${this.localize('setup-anywhere')}</div>
            <div class="card-body">
              <div class="description">
                <ul>
                  <li>${this.localize('setup-tested')}</li>
                  <li>${this.localize('setup-simple-commands')}</li>
                </ul>
              </div>
            </div>
            <div class="card-footer">
              <paper-button @tap="${this.setUpGenericCloudProviderTapped}">
                ${this.localize('setup-action')}
              </paper-button>
            </div>
          </div>
        </div>
      </outline-step-view>
    `;
  }

  private connectToDigitalOceanTapped(): void {
    this.dispatchEvent(makePublicEvent(OutlineIntroStep.EVENT_DIGITALOCEAN_CARD_TAPPED));
  }

  private setUpAwsTapped() {
    this.dispatchEvent(makePublicEvent(OutlineIntroStep.EVENT_AWS_CARD_TAPPED));
  }

  private setUpGcpTapped() {
    this.dispatchEvent(makePublicEvent(OutlineIntroStep.EVENT_GCP_CARD_TAPPED));
  }

  private setUpGenericCloudProviderTapped() {
    this.dispatchEvent(makePublicEvent(OutlineIntroStep.EVENT_GENERIC_CLOUD_PROVIDER_CARD_TAPPED));
  }
}
