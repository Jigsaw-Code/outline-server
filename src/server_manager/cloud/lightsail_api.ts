// Copyright 2020 The Outline Authors
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

import {GetCallerIdentityCommand, STSClient} from "@aws-sdk/client-sts-browser";
import {GetCallerIdentityOutput} from "@aws-sdk/client-sts-browser/types/GetCallerIdentityOutput";
import {
  _UnmarshalledInstance,
  AllocateStaticIpCommand,
  AllocateStaticIpOutput,
  AttachStaticIpCommand,
  AttachStaticIpOutput,
  CreateInstancesCommand,
  CreateInstancesOutput,
  DeleteInstanceCommand,
  DeleteInstanceOutput,
  DetachStaticIpCommand,
  DetachStaticIpOutput,
  GetBundlesCommand,
  GetBundlesOutput,
  GetInstanceCommand,
  GetInstanceOutput,
  GetInstancesCommand,
  GetInstancesOutput,
  GetOperationCommand,
  GetOperationOutput,
  GetRegionsCommand,
  GetRegionsOutput,
  LightsailClient,
  OpenInstancePublicPortsCommand,
  OpenInstancePublicPortsOutput,
  ReleaseStaticIpCommand,
  ReleaseStaticIpOutput,
} from "@aws-sdk/client-lightsail-browser";
import {CloudProviderId} from "../model/cloud";
import {SCRIPT} from "../install_scripts/lightsail_install_script";
import {sleep} from "../infrastructure/sleep";

export interface LightsailInstance {
  id: string;
  name: string;
  state?: 'pending'|'running'|'error'|'unknown'|'stopping'|'terminated';
  bundle?: LightsailBundle;
  image?: LightsailImage;
  location: LightsailLocation;
  ip_address?: string;  // TODO: support multiple IPs
  // TODO: support both ipv4 and ipv6
  created_at?: Date;
  labels?: Map<string, string>;
}

export interface LightsailLocation {
  id: string;
  name?: string;
  country?: string;
}

export interface LightsailImage {
  id: string;
  name: string;
}

export interface LightsailBundle {
  id: string;
  name: string;
  ram: number;
  disk: string;
  bandwidth: number;
  price: number;
}

export type CloudProviderServiceFactory = (account: Account) => Promise<CloudProviderService>;

export interface CloudProviderService {
  readonly cloudProvider?: CloudProviderId;  // TODO: Make this abstract.

  createInstance(name: string, bundleId: string, locationId: string): Promise<LightsailInstance>;
  deleteInstance(instanceId: string, locationId: string): Promise<void>;
  getInstance(instanceId: string, locationId: string): Promise<LightsailInstance>;
  listInstances(locationId?: string): Promise<LightsailInstance[]>;
  listLocations(): Promise<LightsailLocation[]>;
}

export class LightsailSdkClient {
  private lightsailClient: LightsailClient;
  private stsClient: STSClient;

  constructor(private accessKeyId: string, private secretAccessKey: string, region = "us-east-1") {
    this.lightsailClient = this.createLightsailClient(region);
    this.stsClient = this.createStsClient(region);
  }

  createInstances(
      names: string[],
      zone: string,
      size: string,
      userData: string,
      label: string,
  ): Promise<CreateInstancesOutput> {
    const command = new CreateInstancesCommand({
      availabilityZone: zone,
      blueprintId: "ubuntu_18_04",
      bundleId: size,
      instanceNames: names,
      tags: [
        {
          key: label,
          value: "true",
        },
      ],
      userData,
    });
    return this.lightsailClient.send(command);
  }

  deleteInstance(instanceId: string): Promise<DeleteInstanceOutput> {
    const command = new DeleteInstanceCommand({
      instanceName: instanceId,
    });
    return this.lightsailClient.send(command);
  }

  getInstance(instanceId: string): Promise<GetInstanceOutput> {
    const command = new GetInstanceCommand({
      instanceName: instanceId,
    });
    return this.lightsailClient.send(command);
  }

  getInstances(): Promise<GetInstancesOutput> {
    const command = new GetInstancesCommand({});
    return this.lightsailClient.send(command);
  }

  openInstancePublicPorts(instanceId: string): Promise<OpenInstancePublicPortsOutput> {
    const command = new OpenInstancePublicPortsCommand({
      instanceName: instanceId,
      portInfo: {
        fromPort: 0,
        toPort: 65535,
        protocol: "all",
      },
    });
    return this.lightsailClient.send(command);
  }

  allocateStaticIp(staticIpName: string): Promise<AllocateStaticIpOutput> {
    const command = new AllocateStaticIpCommand({staticIpName});
    return this.lightsailClient.send(command);
  }

  releaseStaticIp(staticIpName: string): Promise<ReleaseStaticIpOutput> {
    const command = new ReleaseStaticIpCommand({staticIpName});
    return this.lightsailClient.send(command);
  }

  attachStaticIp(instanceId: string, staticIpName: string): Promise<AttachStaticIpOutput> {
    const command = new AttachStaticIpCommand({
      instanceName: instanceId,
      staticIpName,
    });
    return this.lightsailClient.send(command);
  }

  detachStaticIp(staticIpName: string): Promise<DetachStaticIpOutput> {
    const command = new DetachStaticIpCommand({staticIpName});
    return this.lightsailClient.send(command);
  }

  getRegions(): Promise<GetRegionsOutput> {
    const command = new GetRegionsCommand({
      includeAvailabilityZones: true,
    });
    return this.lightsailClient.send(command);
  }

  getBundles(): Promise<GetBundlesOutput> {
    const command = new GetBundlesCommand({
      includeInactive: false,
    });
    return this.lightsailClient.send(command);
  }

  getOperation(operationId: string): Promise<GetOperationOutput> {
    const command = new GetOperationCommand({
      operationId,
    });
    return this.lightsailClient.send(command);
  }

  getCallerIdentity(): Promise<GetCallerIdentityOutput> {
    const command = new GetCallerIdentityCommand({});
    return this.stsClient.send(command);
  }

  private createLightsailClient(region: string) {
    return new LightsailClient({
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      region,
    });
  }

  private createStsClient(region: string): STSClient {
    return new STSClient({
      credentials: {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      },
      region,
    });
  }
}

// TODO: Add lightsailSdkClient responses validation
export class LightsailSdkProviderService implements CloudProviderService {
  readonly cloudProvider = CloudProviderId.Lightsail;

  // List compiled from documentation:
  // https://lightsail.aws.amazon.com/ls/docs/en_us/articles/understanding-regions-and-availability-zones-in-amazon-lightsail
  private regionCountryMap = new Map<string, string>([
    ["us-east-1", "US East (N. Virginia)"],
    ["us-east-2", "US East (Ohio)"],
    ["us-west-2", "US West (Oregon)"],
    ["ap-south-1", "Asia Pacific (Mumbai)"],
    ["ap-northeast-2", "Asia Pacific (Seoul)"],
    ["ap-southeast-1", "Asia Pacific (Singapore)"],
    ["ap-southeast-2", "Asia Pacific (Sydney)"],
    ["ap-northeast-1", "Asia Pacific (Tokyo)"],
    ["ca-central-1", "Canada (Central)"],
    ["eu-central-1", "EU (Frankfurt)"],
    ["eu-west-1", "EU (Ireland)"],
    ["eu-west-2", "EU (London)"],
    ["eu-west-3", "EU (Paris)"],
  ]);

  constructor(private credentials: object) {
  }

  async createInstance(name: string, bundleId: string, locationId: string): Promise<LightsailInstance> {
    const lightsailSdkClient = this.getLightsailSdkClient(locationId);

    // Create instance
    const userData = this.generateInstallScript(name, SCRIPT);
    const zone = `${locationId}a`;  // TODO: Find available zone for region;
    const createInstancesOps = await lightsailSdkClient.createInstances(
        [name],
        zone,
        "micro_2_0",
        userData,
        "outline",
    );
    await this.wait(createInstancesOps.operations![0].id!, locationId);
    const openInstancePublicPortsOps = await lightsailSdkClient.openInstancePublicPorts(name);
    await this.wait(openInstancePublicPortsOps.operation!.id!, locationId);

    // Assign static IP address
    const staticIpName = `${name}-ip`;
    const allocateStaticIpOp = await lightsailSdkClient.allocateStaticIp(staticIpName);
    await this.wait(allocateStaticIpOp.operations![0].id!, locationId);
    const attachStaticIpOp = await lightsailSdkClient.attachStaticIp(name, staticIpName);
    await this.wait(attachStaticIpOp.operations![0].id!, locationId);

    // Wait until instance is ready
    let instance = await this.getInstance(name, locationId);
    while (!instance.labels?.has("apiUrl") || !instance.labels?.has("certSha256")) {
      await sleep(5 * 1000);
      instance = await this.getInstance(name, locationId);
    }
    return instance;
  }

  async deleteInstance(instanceId: string, locationId: string): Promise<void> {
    const lightsailSdkClient = this.getLightsailSdkClient(locationId);

    // Delete static IP address
    const staticIpName = `${instanceId}-ip`;
    const detachStaticIpOp = await lightsailSdkClient.detachStaticIp(staticIpName);
    await this.wait(detachStaticIpOp.operations![0].id!, locationId);
    const releaseStaticIpOp = await lightsailSdkClient.releaseStaticIp(staticIpName);
    await this.wait(releaseStaticIpOp.operations![0].id!, locationId);

    // Delete instance
    await lightsailSdkClient.deleteInstance(instanceId);
  }

  async getInstance(instanceId: string, locationId: string): Promise<LightsailInstance> {
    const instance = await this.getLightsailSdkClient(locationId).getInstance(instanceId);
    return LightsailSdkProviderService.convertToInstance(instance.instance!);
  }

  async listInstances(locationId?: string): Promise<LightsailInstance[]> {
    const regions = await this.getLightsailSdkClient().getRegions();

    const instances: LightsailInstance[] = [];
    for (const region of regions.regions!) {
      const getInstancesResponseForRegion = await this.getLightsailSdkClient(region.name).getInstances();
      const instancesForZone = getInstancesResponseForRegion.instances!.map(LightsailSdkProviderService.convertToInstance);
      instances.push.apply(instances, instancesForZone);
    }
    return instances;
  }

  async listLocations(): Promise<LightsailLocation[]> {
    const regions = await this.getLightsailSdkClient().getRegions();
    return regions.regions!.map((region) => {
      return {
        id: region.name!,
        name: region.displayName!,
        country: this.regionCountryMap.get(region.name!) || "Unknown",
      };
    });
  }

  private async wait(operationId: string, locationId: string): Promise<void> {
    let result: GetOperationOutput | undefined = undefined;
    while (result?.operation?.status !== "Succeeded") {
      await sleep(1000);
      result = await this.getLightsailSdkClient(locationId).getOperation(operationId);
    }
  }

  private getLightsailSdkClient(region?: string): LightsailSdkClient {
    // @ts-ignore
    return new LightsailSdkClient(this.credentials.accessKeyId, this.credentials.secretAccessKey, region);
  }

  private static convertToInstance(instance: _UnmarshalledInstance): LightsailInstance {
    const labels = new Map(instance.tags?.map(tag => [tag.key!, tag.value!]));
    return {
      id: instance.name!,
      name: instance.name!,
      location: {
        id: instance.location!.regionName!,
      },
      labels,
    };
  }

  private generateInstallScript(serverName: string, installScript: string): string {
    // @ts-ignore
    const accessKey = this.credentials.accessKeyId;
    // @ts-ignore
    const secretKey = this.credentials.secretAccessKey;
    return `#!/bin/bash -eu

export SERVER_NAME=${serverName}
export ACCESS_KEY=${accessKey}
export SECRET_KEY=${secretKey}
${installScript}`;
  }
}
