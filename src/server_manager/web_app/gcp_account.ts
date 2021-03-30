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
import {SCRIPT} from '../install_scripts/gcp_install_script';
import * as gcp from '../model/gcp';
import * as server from '../model/server';

import {GcpServer} from './gcp_server';

/**
 * The Google Cloud Platform account model.
 */
export class GcpAccount implements gcp.Account {
  private static readonly OUTLINE_FIREWALL_NAME = 'outline';
  private static readonly MACHINE_SIZE = 'f1-micro';

  private readonly apiClient: gcp_api.RestApiClient;

  constructor(private id: string, private refreshToken: string) {
    this.apiClient = new gcp_api.RestApiClient(refreshToken);
  }

  getId(): string {
    return this.id;
  }

  /** @see {@link Account#getName}. */
  async getName(): Promise<string> {
    const userInfo = await this.apiClient.getUserInfo();
    return userInfo.email ?? 'unknown';
  }

  /** Returns the refresh token. */
  getRefreshToken(): string {
    return this.refreshToken;
  }

  /** @see {@link Account#listLocations}. */
  async listLocations(projectId: string): Promise<gcp.RegionMap> {
    const listZonesResponse = await this.apiClient.listZones(projectId);
    const zones = listZonesResponse.items ?? [];

    const result: gcp.RegionMap = {};
    zones.map((zone) => {
      if (!(zone.region in result)) {
        result[zone.region] = [];
      }
      // TODO: Check status
      if (zone.status) {
        result[zone.region].push(zone.name);
      }
    });
    return result;
  }

  /** @see {@link Account#createServer}. */
  async createServer(projectId: string, name: string, zoneId: string):
      Promise<server.ManagedServer> {
    const instance = await this.createInstance(projectId, name, zoneId);
    const id = `${this.id}:${instance.id}`;
    return new GcpServer(id, projectId, instance, this.apiClient);
  }

  /** @see {@link Account#listServers}. */
  async listServers(projectId: string): Promise<server.ManagedServer[]> {
    const result: GcpServer[] = [];

    const listZonesResponse = await this.apiClient.listZones(projectId);
    for (const zone of listZonesResponse.items) {
      const listInstancesResponseForZone = await this.apiClient.listInstances(projectId, zone.name);
      const instances = listInstancesResponseForZone.items ?? [];
      instances.forEach((instance) => {
        const id = `${this.id}:${instance.id}`;
        const server = new GcpServer(id, projectId, instance, this.apiClient);
        result.push(server);
      });
    }
    return result;
  }

  private async createInstance(projectId: string, name: string, zoneId: string):
      Promise<gcp_api.Instance> {
    // Configure Outline firewall
    const createFirewallOp =
        await this.apiClient.createFirewall(projectId, GcpAccount.OUTLINE_FIREWALL_NAME);
    await this.apiClient.gceGlobalWait(projectId, createFirewallOp.name);

    // Create VM instance
    const installScript = this.getInstallScript();
    const createInstanceOp = await this.apiClient.createInstance(
        projectId, name, zoneId, GcpAccount.MACHINE_SIZE, installScript);
    const createInstanceWait =
        await this.apiClient.gceZoneWait(projectId, zoneId, createInstanceOp.name);
    return await this.apiClient.getInstance(projectId, createInstanceWait.targetId, zoneId);

    // TODO: Promote ephemeral IP to static IP
    // const staticIpName = `${name}-ip`;
    // const createStaticIpOp = await this.gcpRestApiClient.createStaticIp(staticIpName, regionId,
    // instance.ip_address); await this.gcpRestApiClient.regionWait(regionId,
    // createStaticIpOp.name);
  }

  private getInstallScript(): string {
    return '#!/bin/bash -eu\n' + SCRIPT;
  }
}
