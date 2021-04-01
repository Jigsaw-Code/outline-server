// Copyright 2021 The Outline Authors
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

import '@polymer/paper-dropdown-menu/paper-dropdown-menu.js';
import '@polymer/paper-listbox/paper-listbox.js';
import '@polymer/paper-input/paper-input.js';
import '@polymer/paper-item/paper-item.js';
import './outline-region-picker-step';

import {css, customElement, html, internalProperty, LitElement, property} from 'lit-element';

import {BillingAccount, Project} from '../../model/gcp';
import {GcpAccount} from '../gcp_account';
import {COMMON_STYLES} from '../ui_components/cloud-install-styles';
import {Location, OutlineRegionPicker} from '../ui_components/outline-region-picker-step';

/** @see https://cloud.google.com/compute/docs/regions-zones */
const LOCATION_MAP = new Map<string, string>([
  ['asia-east1', 'Changhua County, Taiwan'],
  ['asia-east2', 'Hong Kong'],
  ['asia-northeast1', 'Tokyo, Japan'],
  ['asia-northeast2', 'Osaka, Japan'],
  ['asia-northeast3', 'Seoul, South Korea'],
  ['asia-south1', 'Mumbai, India'],
  ['asia-southeast1', 'Jurong West, Singapore'],
  ['asia-southeast2', 'Jakarta, Indonesia'],
  ['australia-southeast1', 'Sydney, Australia'],
  ['europe-north1', 'Hamina, Finland'],
  ['europe-west1', 'St. Ghislain, Belgium'],
  ['europe-west2', 'London, England, UK'],
  ['europe-west3', 'Frankfurt, Germany'],
  ['europe-west4', 'Eemshaven, Netherlands'],
  ['europe-west6', 'Zürich, Switzerland'],
  ['europe-central2', 'Warsaw, Poland, Europe'],
  ['northamerica-northeast1', 'Montréal, Québec, Canada'],
  ['southamerica-east1', 'Osasco (São Paulo), Brazil'],
  ['us-central1', 'Council Bluffs, Iowa, USA'],
  ['us-east1', 'Moncks Corner, South Carolina, USA'],
  ['us-east4', 'Ashburn, Northern Virginia, USA'],
  ['us-west1', 'The Dalles, Oregon, USA'],
  ['us-west2', 'Los Angeles, California, USA'],
  ['us-west3', 'Salt Lake City, Utah, USA'],
  ['us-west4', 'Las Vegas, Nevada, USA'],
]);

// DigitalOcean mapping of regions to flags
const FLAG_IMAGE_DIR = 'images/flags';
const GCP_FLAG_MAPPING: {[cityId: string]: string} = {
  'asia-east1': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-east2': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-northeast1': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-northeast2': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-northeast3': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-south1': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-southeast1': `${FLAG_IMAGE_DIR}/us.png`,
  'asia-southeast2': `${FLAG_IMAGE_DIR}/us.png`,
  'australia-southeast1': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-north1': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-west1': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-west2': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-west3': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-west4': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-west6': `${FLAG_IMAGE_DIR}/us.png`,
  'europe-central2': `${FLAG_IMAGE_DIR}/us.png`,
  'northamerica-northeast1': `${FLAG_IMAGE_DIR}/us.png`,
  'southamerica-east1': `${FLAG_IMAGE_DIR}/us.png`,
  'us-central1': `${FLAG_IMAGE_DIR}/us.png`,
  'us-east1': `${FLAG_IMAGE_DIR}/us.png`,
  'us-east4': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west1': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west2': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west3': `${FLAG_IMAGE_DIR}/us.png`,
  'us-west4': `${FLAG_IMAGE_DIR}/us.png`,
};

// TODO: Handle network and authentication errors

@customElement('outline-gcp-create-server-app')
export class GcpCreateServerApp extends LitElement {
  @property({type: Function}) localize: Function;
  @internalProperty() private currentPage = '';
  @internalProperty() private selectedProjectId = '';
  @internalProperty() private selectedBillingAccountId = '';

  private account: GcpAccount;
  private project: Project;
  private billingAccounts: BillingAccount[] = [];
  private regionPicker: OutlineRegionPicker;

  static get styles() {
    return [
      COMMON_STYLES, css`
      .container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;
        align-items: center;
        padding: 132px 0;
        font-size: 14px;
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        margin: 24px 0;
        padding: 24px;
        background: var(--background-contrast-color);
        box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2);
        border-radius: 2px;
      }
      .section {
        padding: 24px 12px;
        background: var(--background-contrast-color);
        border-radius: 2px;
      }
      .section:not(:first-child) {
        margin-top: 8px;
      }
      .section-header {
        padding: 0 6px 0;
        display: flex;
      }
      .instructions {
        font-size: 16px;
        line-height: 26px;
        margin-left: 16px;
        flex: 2;
      }
      .stepcircle {
        height: 26px;
        width: 26px;
        font-size: 14px;
        border-radius: 50%;
        float: left;
        vertical-align: middle;
        color: #000;
        background-color: #fff;
        margin: auto;
        text-align: center;
        line-height: 26px;
      }
      @media (min-width: 1025px) {
        paper-card {
          /* Set min with for the paper-card to grow responsively. */
          min-width: 600px;
        }
      }
      .card p {
        color: var(--light-gray);
        width: 100%;
        text-align: center;
      }
      paper-button {
        color: var(--light-gray);
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 2px;
      }
      paper-button[disabled] {
        color: var(--medium-gray);
        background: transparent;
      }`
    ];
  }

  render() {
    return html`
      <iron-pages id="pages" attr-for-selected="id" .selected="${this.currentPage}">
        <outline-step-view id="billingAccountSetup" display-action="">
          <span slot="step-title">Activate your Google Cloud Platform account.</span>
          <span slot="step-description">Enter your billing information on Google Cloud Platform.</span>
          <span slot="step-action">
            <paper-button id="createServerButton" @tap="${this.handleBillingVerificationNextTap}">
              NEXT
            </paper-button>
          </span>
          <paper-card class="card">
            <div class="container">
              <img src="images/do_oauth_billing.svg">
              <p>Enter you billing information on Google Cloud Platform</p>
              <!-- TODO: Add call to action -->
            </div>
          </paper-card>  
        </outline-step-view>
        
        <outline-step-view id="projectSetup" display-action="">
          <span slot="step-title">Create your Google Cloud Platform project.</span>
          <span slot="step-description">This will create a new project on your GCP account to hold your Outline servers.</span>
          <span slot="step-action">
            <paper-button 
                id="createServerButton" 
                @tap="${this.handleProjectSetupNextTap}" 
                ?disabled="${
        !this.isProjectSetupNextEnabled(this.selectedProjectId, this.selectedBillingAccountId)}">
              CREATE PROJECT
            </paper-button>
          </span>
            <div class="section">
              <div class="section-header">
                <span class="stepcircle">1</span>
                <div class="instructions">
                  Name your new Google Cloud Project
                </div>
              </div>
              <div class="section-content">
                <paper-input value="${
        this.selectedProjectId}" label="Project ID" always-float-label="" maxlength="100" @value-changed="${
        this.onProjectIdChanged}"></paper-input>
              </div>
            </div>
            
            <div class="section">
              <div class="section-header">
                <span class="stepcircle">2</span>
                <div class="instructions">
                  Choose your preferred billing method for this project
                </div>
              </div>
              <div class="section-content">
                <paper-dropdown-menu no-label-float="">
                  <paper-listbox slot="dropdown-content" selected="${
        this.selectedBillingAccountId}" attr-for-selected="name" @selected-changed="${
        this.onBillingAccountSelected}">
                  ${this.billingAccounts.map(billingAccount => {
      return html`<paper-item name="${billingAccount.id}">${billingAccount.name}</paper-item>`;
    })}
                  </paper-listbox>
                </paper-dropdown-menu>
              </div>
            </div>
        </outline-step-view>

        <outline-region-picker-step id="regionPicker" .localize=${
        this.localize} @region-selected="${this.onRegionSelected}">  
        </outline-region-picker-step>
      </iron-pages>`;
  }

  private async handleBillingVerificationNextTap(): Promise<void> {
    this.billingAccounts = await this.account.listBillingAccounts();
    if (!this.billingAccounts || this.billingAccounts.length === 0) {
      // TODO: Show error
    } else {
      this.showProjectSetup();
    }
  }

  private isProjectSetupNextEnabled(projectId: string, billingAccountId: string): boolean {
    // TODO: Proper validation
    return projectId !== '' && billingAccountId !== '';
  }

  private async handleProjectSetupNextTap(): Promise<void> {
    this.project =
        await this.account.createProject(this.selectedProjectId, this.selectedBillingAccountId);
    this.showRegionPicker();
  }

  private showBillingAccountSetup(): void {
    this.currentPage = 'billingAccountSetup';
  }

  private showProjectSetup(): void {
    this.currentPage = 'projectSetup';
  }

  private async showRegionPicker(): Promise<void> {
    this.currentPage = 'regionPicker';
    const regionMap = await this.account.listLocations(this.project.id);
    const locations = Object.entries(regionMap).map(([regionId, zoneIds]) => {
      return this.createLocationModel(regionId, zoneIds);
    });
    this.regionPicker.locations = locations;
  }

  async start(account: GcpAccount): Promise<void> {
    this.init();
    this.account = account;

    const projects = await this.account.listProjects();
    if (projects && projects.length > 0) {
      this.project = projects[0];
      this.showRegionPicker();
    } else {
      this.billingAccounts = await this.account.listBillingAccounts();
      if (!this.billingAccounts || this.billingAccounts.length === 0) {
        this.showBillingAccountSetup();
      } else {
        this.showProjectSetup();
      }
    }
  }

  private init() {
    this.currentPage = '';
    this.selectedProjectId = '';
    this.selectedBillingAccountId = '';
    this.regionPicker = this.shadowRoot.querySelector('#regionPicker') as OutlineRegionPicker;
    this.regionPicker.reset();
  }

  private onProjectIdChanged(event: CustomEvent) {
    this.selectedProjectId = event.detail.value;
  }
  private onBillingAccountSelected(event: CustomEvent) {
    this.selectedBillingAccountId = event.detail.value;
  }

  private async onRegionSelected(event: CustomEvent) {
    event.stopPropagation();

    this.regionPicker.isServerBeingCreated = true;
    // TODO: Make unique server name
    const server =
        await this.account.createServer(this.project.id, 'outline', event.detail.selectedRegionId);
    const params = {bubbles: true, composed: true, detail: {server}};
    const serverCreatedEvent = new CustomEvent('gcp-server-created', params);
    this.dispatchEvent(serverCreatedEvent);
  }

  private createLocationModel(regionId: string, zoneIds: string[]): Location {
    return {
      id: zoneIds.length > 0 ? zoneIds[0] : null,
      name: LOCATION_MAP.get(regionId),
      flag: GCP_FLAG_MAPPING[regionId] || '',
      available: zoneIds.length > 0,
    };
  }
}
