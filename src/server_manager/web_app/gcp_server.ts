import {ShadowboxServer} from "./shadowbox_server";
import * as server from "../model/server";
import {DataAmount, ManagedServerHost, MonetaryCost} from "../model/server";
import {GcpRestApiProviderService} from "./gcp_app/services/rest_api_client";
import {Instance} from "./gcp_app/services/cloud";

export class GcpServer extends ShadowboxServer implements server.ManagedServer {
  private readonly gcpHost: GcpHost;

  constructor(private instance: Instance, private gcpProviderService: GcpRestApiProviderService) {
    super();
    this.gcpHost = new GcpHost(instance, gcpProviderService);
  }

  getHost(): ManagedServerHost {
    return this.gcpHost;
  }

  isInstallCompleted(): boolean {
    return true;
  }

  async waitOnInstall(resetTimeout: boolean): Promise<void> {
    await this.gcpProviderService.getInstance(this.instance.id, this.instance.location.id);
  }
}

class GcpHost implements server.ManagedServerHost {
  constructor(private instance: Instance, private gcpProviderService: GcpRestApiProviderService) {}

  async delete(): Promise<void> {
    return this.gcpProviderService.deleteInstance(this.instance.id, this.instance.location.id);
  }

  getHostId(): string {
    return this.instance.id;
  }

  getMonthlyCost(): MonetaryCost {
    return undefined;
  }

  getMonthlyOutboundTransferLimit(): DataAmount {
    return undefined;
  }

  getRegionId(): string {
    return this.instance.location.id;
  }
}