import {CloudProvider} from "../model/cloud";

export interface Instance {
  id: string;
  name: string;
  state?: "pending" | "running" | "error" | "unknown" | "stopping" | "terminated";
  bundle?: Bundle;
  image?: Image;
  location: Location;
  ip_address?: string; // TODO: support multiple IPs
  // TODO: support both ipv4 and ipv6
  created_at?: Date;
  labels?: Map<string, string>;
}

export interface Location {
  id: string;
  name?: string;
  country?: string;
}

export interface Image {
  id: string;
  name: string;
}

export interface Bundle {
  id: string;
  name: string;
  ram: number;
  disk: string;
  bandwidth: number;
  price: number;
}

export type CloudProviderServiceFactory = (account: Account) => Promise<CloudProviderService>;

export interface CloudProviderService {
  readonly cloudProvider?: CloudProvider; // TODO: Make this abstract.

  createInstance(name: string, bundleId: string, locationId: string): Promise<Instance>;
  deleteInstance(instanceId: string, locationId: string): Promise<void>;
  getInstance(instanceId: string, locationId: string): Promise<Instance>;
  listInstances(locationId?: string): Promise<Instance[]>;
  listLocations(): Promise<Location[]>;
}
