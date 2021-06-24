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

import {CloudLocation, GeoId, DataCenterMap, countryCode, DataCenterId} from '../model/location';

/**
 * Returns the localized place name, or the data center ID if the location is
 * unknown.
 */
export function getShortName(location: CloudLocation,
    localize: (id: string) => string): string {
  if (!location?.geoId) {
    return location?.id ?? '';
  }
  return localize(`geo-${location.geoId.toLowerCase()}`);
}

/**
 * Returns the localized country name, or "" if the country is unknown or
 * unnecessary.
 */
export function localizeCountry(geoId: GeoId, language: string): string {
  if (!geoId) {
    return '';
  }
  const cc = countryCode(geoId);
  if (cc === geoId) {
    // The city and the country are the same (e.g. SG).  Omit the localized country.
    return '';
  }
  // TODO: Remove typecast after https://github.com/microsoft/TypeScript/pull/44022
  // tslint:disable-next-line:no-any
  const displayName = new (Intl as any).DisplayNames([language], {type: 'region'});
  return displayName.of(cc);
}

/**
 * Given a map of all the datacenters in a cloud provider, this function returns
 * a list containing one representative zone for each GeoLocation.  Available
 * zones are preferred within each location.  Available zones with unknown
 * GeoLocation (e.g. newly added zones) are placed at the end of the array.
 */
export function collectLocations(zoneMap: DataCenterMap): CloudLocation[] {
  // Contains one available datacenter ID for each GeoLocation, or null if
  // there are datacenters for that GeoLocation but none are available.
  const map = new Map<GeoId, DataCenterId>();
  // Contains all available datacenter IDs with unknown GeoLocation.
  const unmappedIds: DataCenterId[] = [];
  
  Object.entries(zoneMap).forEach(([id, info]) => {
    if (info.geoId) {
      if (info.available) {
        map.set(info.geoId, id);     
      } else if (!map.has(info.geoId)) {
        map.set(info.geoId, null);
      }
    } else if (info.available) {
      unmappedIds.push(id);
    }
  });

  const locations: CloudLocation[] = [];
  map.forEach((id, geoId) => locations.push({id, geoId}));
  // Also show any new zones for which we do not yet know locations.
  locations.push(...unmappedIds.map(id => ({id, geoId: null})));
  return locations;
}
