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

import * as gcp_api from '../cloud/gcp_api';
import {sleep} from '../infrastructure/sleep';
import {SCRIPT} from '../install_scripts/gcp_install_script';
import * as gcp from '../model/gcp';
import {BillingAccount, Project} from '../model/gcp';
import * as server from '../model/server';

import {GcpServer} from './gcp_server';
import * as server_install from "./server_install";

/** Returns a unique, RFC1035-style name as required by GCE. */
function makeGcpInstanceName(): string {
  const now = new Date();
  return `outline-${now.getFullYear()}${now.getMonth()}${now.getDate()}-${now.getUTCHours()}${
      now.getUTCMinutes()}${now.getUTCSeconds()}`;
}
  
/**
 * The Google Cloud Platform account model.
 */
export class GcpAccount implements gcp.Account {
  private static readonly OUTLINE_PROJECT_NAME = 'Outline servers';
  private static readonly OUTLINE_FIREWALL_NAME = 'outline';
  private static readonly OUTLINE_FIREWALL_TAG = 'outline';
  private static readonly MACHINE_SIZE = 'f1-micro';
  private static readonly REQUIRED_GCP_SERVICES = ['compute.googleapis.com'];

  private readonly apiClient: gcp_api.RestApiClient;

  constructor(private id: string, private refreshToken: string,
      private shadowboxSettings: server_install.ShadowboxSettings) {
    this.apiClient = new gcp_api.RestApiClient(refreshToken);
  }

  getId(): string {
    return this.id;
  }

  /** @see {@link Account#getName}. */
  async getName(): Promise<string> {
    const userInfo = await this.apiClient.getUserInfo();
    return userInfo?.email;
  }

  /** Returns the refresh token. */
  getRefreshToken(): string {
    return this.refreshToken;
  }

  /** @see {@link Account#createServer}. */
  async createServer(projectId: string, name: string, zone: gcp.Zone):
      Promise<server.ManagedServer> {
    const zoneLocator = {projectId, zoneId: zone.id};
    const instance = await this.createInstance(zoneLocator, name);
    const id = `${this.id}:${instance.id}`;
    return new GcpServer(id, instance, this.apiClient);
  }

  /** @see {@link Account#listServers}. */
  async listServers(projectId: string): Promise<server.ManagedServer[]> {
    const result: GcpServer[] = [];
    const listZonesResponse = await this.apiClient.listZones(projectId);
    const listInstancesPromises = [];
    for (const zone of listZonesResponse.items) {
      const filter = 'labels.outline=true';
      const zoneLocator = {projectId, zoneId: zone.name};
      const listInstancesPromise = this.apiClient.listInstances(zoneLocator, filter);
      listInstancesPromises.push(listInstancesPromise);
    }
    const listInstancesResponses = await Promise.all(listInstancesPromises);
    for (const response of listInstancesResponses) {
      const instances = response.items ?? [];
      instances.forEach((instance) => {
        const id = `${this.id}:${instance.id}`;
        const server = new GcpServer(id, instance, this.apiClient);
        result.push(server);
      });
    }
    return result;
  }

  /** @see {@link Account#listLocations}. */
  async listLocations(projectId: string): Promise<gcp.ZoneOption[]> {
    const listZonesResponse = await this.apiClient.listZones(projectId);
    const zones = listZonesResponse.items ?? [];
    return zones.map(zoneInfo => ({
      cloudLocation: new gcp.Zone(zoneInfo.name),
      available: zoneInfo.status === 'UP'
    }));
  }

  /** @see {@link Account#listProjects}. */
  async listProjects(): Promise<Project[]> {
    const filter = 'labels.outline=true AND lifecycleState=ACTIVE';
    const response = await this.apiClient.listProjects(filter);
    if (response.projects?.length > 0) {
      return response.projects.map(project => {
        return {
          id: project.projectId,
          name: project.name,
        };
      });
    }
    return [];
  }

  /** @see {@link Account#createProject}. */
  async createProject(projectId: string, billingAccountId: string): Promise<Project> {
    // Create GCP project
    const createProjectData = {
      projectId,
      name: GcpAccount.OUTLINE_PROJECT_NAME,
      labels: {
        outline: 'true',
      },
    };
    const createProjectResponse = await this.apiClient.createProject(createProjectData);
    let createProjectOperation = null;
    while (!createProjectOperation?.done) {
      await sleep(2 * 1000);
      createProjectOperation =
          await this.apiClient.resourceManagerOperationGet(createProjectResponse.name);
    }
    if (createProjectOperation.error) {
      // TODO: Throw error. The project wasn't created so we should have nothing to delete.
    }

    await this.configureProject(projectId, billingAccountId);

    return {
      id: projectId,
      name: GcpAccount.OUTLINE_PROJECT_NAME,
    };
  }

  async isProjectHealthy(projectId: string): Promise<boolean> {
    const projectBillingInfo = await this.apiClient.getProjectBillingInfo(projectId);
    if (!projectBillingInfo.billingEnabled) {
      return false;
    }

    const listEnabledServicesResponse = await this.apiClient.listEnabledServices(projectId);
    for (const requiredService of GcpAccount.REQUIRED_GCP_SERVICES) {
      const found = listEnabledServicesResponse.services.find(
          service => service.config.name === requiredService);
      if (!found) {
        return false;
      }
    }

    return true;
  }

  async repairProject(projectId: string, billingAccountId: string): Promise<void> {
    return await this.configureProject(projectId, billingAccountId);
  }

  /** @see {@link Account#listBillingAccounts}. */
  async listOpenBillingAccounts(): Promise<BillingAccount[]> {
    const response = await this.apiClient.listBillingAccounts();
    if (response.billingAccounts?.length > 0) {
      return response.billingAccounts
          .filter(billingAccount => billingAccount.open)
          .map(billingAccount => ({
        id: billingAccount.name.substring(billingAccount.name.lastIndexOf('/') + 1),
        name: billingAccount.displayName,
      }));
    }
    return [];
  }

  private async createFirewallIfNeeded(projectId: string) : Promise<void> {
    // Configure Outline firewall
    const getFirewallResponse =
        await this.apiClient.listFirewalls(projectId, GcpAccount.OUTLINE_FIREWALL_NAME);
    if (!getFirewallResponse?.items || getFirewallResponse?.items?.length === 0) {
      const createFirewallData = {
        name: GcpAccount.OUTLINE_FIREWALL_NAME,
        direction: 'INGRESS',
        priority: 1000,
        targetTags: [GcpAccount.OUTLINE_FIREWALL_TAG],
        allowed: [
          {
            IPProtocol: 'all',
          },
        ],
        sourceRanges: ['0.0.0.0/0'],
      };
      const createFirewallOperation = await this.apiClient.createFirewall(projectId, createFirewallData);
      if (createFirewallOperation.error?.errors) {
        // TODO: Throw error.
      }
    }
  }

  private async createInstance(zoneLocator: gcp_api.ZoneLocator, name: string):
      Promise<gcp_api.Instance> {
    await this.createFirewallIfNeeded(zoneLocator.projectId);

    // Create VM instance
    const instanceName = makeGcpInstanceName();
    const createInstanceData = {
      name: instanceName,
      description: name,  // Show a human-readable name in the GCP console
      machineType: `zones/${zoneLocator.zoneId}/machineTypes/${GcpAccount.MACHINE_SIZE}`,
      disks: [
        {
          boot: true,
          initializeParams: {
            sourceImage: 'projects/ubuntu-os-cloud/global/images/family/ubuntu-1804-lts',
          },
        },
      ],
      networkInterfaces: [
        {
          network: 'global/networks/default',
          // Empty accessConfigs necessary to allocate ephemeral IP
          accessConfigs: [{}],
        },
      ],
      labels: {
        outline: 'true',
      },
      tags: {
        // This must match the firewall target tag.
        items: [GcpAccount.OUTLINE_FIREWALL_TAG],
      },
      metadata: {
        items: [
          {
            key: 'enable-guest-attributes',
            value: 'TRUE',
          },
          {
            key: 'user-data',
            value: this.getInstallScript(name),
          },
        ],
      },
    };
    const createInstanceOperation =
        await this.apiClient.createInstance(zoneLocator, createInstanceData);
    if (createInstanceOperation.error?.errors) {
      // TODO: Throw error.
    }

    const instanceLocator = {instanceId: createInstanceOperation.targetId, ...zoneLocator};
    const instance = await this.apiClient.getInstance(instanceLocator);

    // Promote ephemeral IP to static IP
    const ipAddress = instance.networkInterfaces[0].accessConfigs[0].natIP;
    const createStaticIpData = {
      name: instance.name,
      description: instance.description,
      address: ipAddress,
    };
    const regionId = new gcp.Zone(zoneLocator.zoneId).regionId;
    const createStaticIpOperation = await this.apiClient.createStaticIp(
        {regionId, ...zoneLocator}, createStaticIpData);
    if (createStaticIpOperation.error?.errors) {
      // TODO: Delete VM instance. Throw error.
    }

    return instance;
  }

  private async configureProject(projectId: string, billingAccountId: string): Promise<void> {
    // Link billing account
    const updateProjectBillingInfoData = {
      name: `projects/${projectId}/billingInfo`,
      projectId,
      billingAccountName: `billingAccounts/${billingAccountId}`,
    };
    await this.apiClient.updateProjectBillingInfo(projectId, updateProjectBillingInfoData);

    // Enable APIs
    const enableServicesData = {
      serviceIds: GcpAccount.REQUIRED_GCP_SERVICES,
    };
    const enableServicesResponse =
        await this.apiClient.enableServices(projectId, enableServicesData);
    let enableServicesOperation = null;
    while (!enableServicesOperation?.done) {
      await sleep(2 * 1000);
      enableServicesOperation =
          await this.apiClient.serviceUsageOperationGet(enableServicesResponse.name);
    }
    if (enableServicesResponse.error) {
      // TODO: Throw error.
    }
  }

  private getInstallScript(serverName: string): string {
    return '#!/bin/bash -eu\n' +
        server_install.getShellExportCommands(this.shadowboxSettings, serverName) +
        SCRIPT;
  }
}
