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
 * Each element identifies a location as displayed in the Outline
 * user interface.  To minimize confusion, Outline attempts to
 * present each location in a manner consistent with the cloud
 * provider's own interface and documentation.  When cloud providers
 * present a location in similar fashion, they may share an element
 * (e.g. FRANKFURT for GCP and DO), but if they present a similar
 * location in different terms, they will need to be represented
 * separately (e.g. SINGAPORE for DO, JURONG_WEST for GCP).
 */
export enum GeoLocation {
  AMSTERDAM = 1, // Ensure all locations are truthy.
  ASHBURN,
  BANGALORE,
  COUNCIL_BLUFFS,
  CHANGHUA,
  EEMSHAVEN,
  FRANKFURT,
  HAMINA,
  HONGKONG,
  JAKARTA,
  JURONG_WEST,
  LAS_VEGAS,
  LONDON,
  LOS_ANGELES,
  MONCKS_CORNER,
  MONTREAL,
  MUMBAI,
  NYC,
  SAN_FRANCISCO,
  SINGAPORE,
  OSAKA,
  OSASCO,
  SALT_LAKE_CITY,
  SEOUL,
  ST_GHISLAIN,
  SYDNEY,
  THE_DALLES,
  TOKYO,
  TORONTO,
  WARSAW,
  ZURICH,
}

/** Describes a DigitalOcean "region" or a GCP "zone". */
export interface ZoneInfo {
  readonly geoLocation: GeoLocation;
  readonly available: boolean;
}

export interface Zone {
  readonly id: string;
  readonly info: ZoneInfo
}

export type ZoneMap = {[id: string]: ZoneInfo};
