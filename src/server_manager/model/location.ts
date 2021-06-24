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

/**
 * Unified server location model for all cloud providers.
 * 
 * Keys are GeoIds, identifying the location.  Values are ISO country codes.
 * 
 * Each key identifies a location as displayed in the Outline
 * user interface.  To minimize confusion, Outline attempts to
 * present each location in a manner consistent with the cloud
 * provider's own interface and documentation.  When cloud providers
 * present a location in similar fashion, they may share an element
 * (e.g. 'frankfurt' for GCP and DO), but if they present a similar
 * location in different terms, they will need to be represented
 * separately (e.g. 'SG' for DO, 'jurong-west' for GCP).
 * 
 * When the key and value are equal, this indicates that they are redundant.
 */
const geoLocations = {
  'amsterdam': 'NL',
  'northern-virginia': 'US',
  'bangalore': 'IN',
  'iowa': 'US',
  'changhua-county': 'TW',
  'eemshaven': 'NL',
  'frankfurt': 'DE',
  'hamina': 'FI',
  'HK': 'HK',
  'jakarta': 'ID',
  'jurong-west': 'SG',
  'las-vegas': 'US',
  'london': 'UK',
  'los-angeles': 'US',
  'oregon': 'US',
  'montreal': 'CA',
  'mumbai': 'IN',
  'new-york-city': 'US',
  'san-francisco': 'US',
  'SG': 'SG',
  'osaka': 'JP',
  'sao-paulo': 'BR',
  'salt-lake-city': 'US',
  'seoul': 'KR',
  'st-ghislain': 'BE',
  'sydney': 'AU',
  'south-carolina': 'US',
  'tokyo': 'JP',
  'toronto': 'CA',
  'warsaw': 'PL',
  'zurich': 'CH'
} as const;

export type GeoId = keyof typeof geoLocations;
export type CountryCode = typeof geoLocations[GeoId];

export function countryCode(geoId: GeoId): CountryCode {
  return geoLocations[geoId];
}

/** Describes a DigitalOcean "region" or a GCP "zone". */
export interface DataCenterInfo {
  readonly geoId: GeoId;
  readonly available: boolean;
}

/** Unified type alias for DO RegionId and GCP ZoneId. */
export type DataCenterId = string;

/** Map from DataCenterIds to info about that data center. */
export type DataCenterMap = {[id: string]: DataCenterInfo};

export interface CloudLocation {
  /**
   * The cloud-specific ID used for this location, or null to represent
   * a GeoId that lacks a usable datacenter.
   */
  readonly id: DataCenterId;

  /**
   * The physical location of this datacenter, or null if its location is
   * unknown.
   */
  readonly geoId: GeoId;
}
