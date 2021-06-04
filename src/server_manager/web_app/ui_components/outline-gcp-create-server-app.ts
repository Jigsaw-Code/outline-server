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
import {COMMON_STYLES} from './cloud-install-styles';
import {Location, OutlineRegionPicker} from './outline-region-picker-step';

// TODO: Map region ids to country codes.
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

// GCP mapping of regions to flags
const FLAG_IMAGE_DIR = 'images/flags';
const GCP_FLAG_MAPPING: {[regionId: string]: string} = {
  // 'asia-east1': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'asia-east2': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'asia-northeast1': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'asia-northeast2': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'asia-northeast3': `${FLAG_IMAGE_DIR}/unknown.png`,
  'asia-south1': `${FLAG_IMAGE_DIR}/india.png`,
  'asia-southeast1': `${FLAG_IMAGE_DIR}/singapore.png`,
  // 'asia-southeast2': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'australia-southeast1': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'europe-north1': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'europe-west1': `${FLAG_IMAGE_DIR}/unknown.png`,
  'europe-west2': `${FLAG_IMAGE_DIR}/uk.png`,
  'europe-west3': `${FLAG_IMAGE_DIR}/germany.png`,
  'europe-west4': `${FLAG_IMAGE_DIR}/netherlands.png`,
  // 'europe-west6': `${FLAG_IMAGE_DIR}/unknown.png`,
  // 'europe-central2': `${FLAG_IMAGE_DIR}/unknown.png`,
  'northamerica-northeast1': `${FLAG_IMAGE_DIR}/canada.png`,
  // 'southamerica-east1': `${FLAG_IMAGE_DIR}/unknown.png`,
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
  @internalProperty() private isProjectBeingCreated = false;

  private account: GcpAccount;
  private project: Project;
  private billingAccounts: BillingAccount[] = [];
  private regionPicker: OutlineRegionPicker;
  private billingAccountsRefreshLoop: number = null;

  static get styles() {
    return [
      COMMON_STYLES, css`
      :host {
        --paper-input-container-input-color: var(--medium-gray);
      }
      .container {
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 100%;
        align-items: center;
        padding: 156px 0;
        font-size: 14px;
      }
      .card {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        justify-content: space-between;
        margin: 24px 0;
        background: var(--background-contrast-color);
        box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2);
        border-radius: 2px;
      }
      .section {
        padding: 24px 12px;
        color: var(--light-gray);
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
      .section-content {
        padding: 0 48px;
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
      #projectName {
        width: 250px;
      }
      #billingAccount {
        width: 250px;
      }
      paper-button {
        background: var(--primary-green);
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
    switch (this.currentPage) {
      case 'billingAccountSetup':
        return this.renderBillingAccountSetup();
      case 'projectSetup':
        return this.renderProjectSetup();
      case 'regionPicker':
        return this.renderRegionPicker();
      default: {
      }
    }
  }

  private renderBillingAccountSetup() {
    return html`
      <outline-step-view id="billingAccountSetup" display-action="">
        <span slot="step-title">${this.localize('gcp-billing-title')}</span>
        <span slot="step-description">${this.localize('gcp-billing-description')}</span>
        <span slot="step-action">
          <paper-button id="openBillingPage" @tap="${this.openBillingPage}">
            ${this.localize('gcp-billing-action')}
          </paper-button>
        </span>
        <paper-card class="card">
          <div class="container">
            <img src="images/do_oauth_billing.svg">
            <p>${this.localize('gcp-billing-body')}</p>
            <span slot="step-action">
              <paper-button id="refreshBillingAccounts" @tap="${this.refreshBillingAccounts}">
                ${this.localize('gcp-billing-refresh')}
              </paper-button>
            </span>
          </div>
          <paper-progress indeterminate></paper-progress>
        </paper-card>
      </outline-step-view>`;
  }

  private renderProjectSetup() {
    return html`        
      <outline-step-view id="projectSetup" display-action="">
        <span slot="step-title">Create your Google Cloud Platform project.</span>
        <span slot="step-description">This will create a new project on your GCP account to hold your Outline servers.</span>
        <span slot="step-action">
          ${this.isProjectBeingCreated ?
            // TODO: Support canceling server creation.
            html`<paper-button disabled="true">IN PROGRESS...</paper-button>` :
            html`<paper-button
                id="createServerButton"
                @tap="${this.handleProjectSetupNextTap}"
                ?disabled="${
      !this.isProjectSetupNextEnabled(this.selectedProjectId, this.selectedBillingAccountId)}">
              CREATE PROJECT
            </paper-button>`}
        </span>
          <div class="section">
            <div class="section-header">
              <span class="stepcircle">1</span>
              <div class="instructions">
                Name your new Google Cloud Project
              </div>
            </div>
            <div class="section-content">
              <!-- TODO: Make readonly if project already exists -->
              <paper-input id="projectName" value="${this.selectedProjectId}"
                  label="Project ID" always-float-label="" maxlength="100" @value-changed="${
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
              <paper-dropdown-menu id="billingAccount" no-label-float="" horizontal-align="left">
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
          ${
        this.isProjectBeingCreated ?
        html`<paper-progress indeterminate="" class="slow"></paper-progress>` :
        ''}
      </outline-step-view>`;
  }

  private renderRegionPicker() {
    return html`
      <outline-region-picker-step id="regionPicker" .localize=${this.localize} @RegionSelected="${
        this.onRegionSelected}">  
      </outline-region-picker-step>`;
  }

  async start(account: GcpAccount): Promise<void> {
    this.init();
    this.account = account;

    this.billingAccounts = await this.account.listBillingAccounts();
    const projects = await this.account.listProjects();
    // TODO: We don't support multiple projects atm, but we will want to allow
    //  the user to choose the appropriate one.
    this.project = projects?.[0];
    const isProjectHealthy =
        this.project ? await this.account.isProjectHealthy(this.project.id) : false;
    if (this.project && isProjectHealthy) {
      this.showRegionPicker();
    } else {
      if (!this.billingAccounts || this.billingAccounts.length === 0) {
        this.showBillingAccountSetup();
        // Check every five seconds to see if an account has been added.
        this.billingAccountsRefreshLoop = window.setInterval(() => {
          this.refreshBillingAccounts();
        }, 5000);
      } else {
        this.showProjectSetup(this.project);
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopRefreshingBillingAccounts();
  }

  private init() {
    this.currentPage = '';
    this.selectedProjectId = '';
    this.selectedBillingAccountId = '';
    this.stopRefreshingBillingAccounts();
  }

  private showBillingAccountSetup(): void {
    this.currentPage = 'billingAccountSetup';
  }

  private async refreshBillingAccounts(): Promise<void> {
    this.billingAccounts = await this.account.listBillingAccounts();
    // TODO: listBillingAccounts() can reject, resulting in an uncaught
    // exception here that is shown in the debug console but not reflected
    // in the UI.  We need to something better than failing silently.

    if (this.billingAccounts && this.billingAccounts.length > 0) {
      this.stopRefreshingBillingAccounts();
      this.showProjectSetup();
      window.bringToFront();
    }
  }

  private stopRefreshingBillingAccounts(): void {
    window.clearInterval(this.billingAccountsRefreshLoop);
    this.billingAccountsRefreshLoop = null;
  }

  private openBillingPage(): void {
    window.open("https://console.cloud.google.com/billing");
  }

  private async showProjectSetup(existingProject?: Project): Promise<void> {
    this.project = existingProject ?? null;
    this.selectedProjectId = this.project?.id ?? this.makeProjectName();
    this.selectedBillingAccountId = this.billingAccounts[0].id;
    this.currentPage = 'projectSetup';
  }

  private isProjectSetupNextEnabled(projectId: string, billingAccountId: string): boolean {
    // TODO: Proper validation
    return projectId !== '' && billingAccountId !== '';
  }

  private async handleProjectSetupNextTap(): Promise<void> {
    this.isProjectBeingCreated = true;
    if (!this.project) {
      this.project =
          await this.account.createProject(this.selectedProjectId, this.selectedBillingAccountId);
    } else {
      await this.account.repairProject(this.project.id, this.selectedBillingAccountId);
    }
    this.isProjectBeingCreated = false;

    this.showRegionPicker();
  }

  private async showRegionPicker(): Promise<void> {
    const isProjectHealthy = await this.account.isProjectHealthy(this.project.id);
    if (!isProjectHealthy) {
      return this.showProjectSetup();
    }

    this.currentPage = 'regionPicker';
    const regionMap = await this.account.listLocations(this.project.id);
    const locations = Object.entries(regionMap).map(([regionId, zoneIds]) => {
      return this.createLocationModel(regionId, zoneIds);
    });
    this.regionPicker = this.shadowRoot.querySelector('#regionPicker') as OutlineRegionPicker;
    this.regionPicker.locations = locations;
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
    const name = this.makeServerName();
    const server =
        await this.account.createServer(this.project.id, name, event.detail.selectedRegionId);
    const params = {bubbles: true, composed: true, detail: {server}};
    const serverCreatedEvent = new CustomEvent('GcpServerCreated', params);
    this.dispatchEvent(serverCreatedEvent);
  }

  private createLocationModel(regionId: string, zoneIds: string[]): Location {
    return {
      id: zoneIds.length > 0 ? zoneIds[0] : null,
      name: LOCATION_MAP.get(regionId) ?? regionId,
      flag: GCP_FLAG_MAPPING[regionId] || `${FLAG_IMAGE_DIR}/unknown.png`,
      available: zoneIds.length > 0,
    };
  }

  private makeProjectName(): string {
    return `outline-${Math.random().toString(20).substring(3)}`;
  }

  private makeServerName(): string {
    const now = new Date();
    return `outline-${now.getFullYear()}${now.getMonth()}${now.getDate()}-${now.getUTCHours()}${
        now.getUTCMinutes()}${now.getUTCSeconds()}`;
  }
}
