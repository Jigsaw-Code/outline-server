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

import {GeoLocation, ZoneMap} from '../model/zone';

/**
 * A server location as displayed to the user.
 * 
 * Server locations are modeled as a country code, plus an optional
 * hierarchy of sub-country locations.  The subdivision IDs are prefixed
 * with "geo-" to form localization message IDs.
 */
export class LocationName {
  constructor(private subdivisionIds: string[], private countryCode: string) { }

  getCountryCode(): string {
    return this.countryCode;
  }

  getCountry(language: string): string {
    // TODO: Remove typecast after https://github.com/microsoft/TypeScript/pull/44022
    // tslint:disable-next-line:no-any
    const displayName = new (Intl as any).DisplayNames([language], {type: 'region'});
    return displayName.of(this.countryCode);
  }

  getSubdivisionIds(): string[] {
    return this.subdivisionIds.map(id => `geo-${id}`);
  }
}

const LOCATION_NAMES = new Map<GeoLocation, LocationName>([
  [GeoLocation.AMSTERDAM, new LocationName(['amsterdam'], 'NL')],
  [GeoLocation.ASHBURN, new LocationName(['ashburn', 'virginia'], 'US')],
  [GeoLocation.BANGALORE, new LocationName(['bangalore'], 'IN')],
  [GeoLocation.CHANGHUA, new LocationName(['changhua'], 'TW')],
  [GeoLocation.COUNCIL_BLUFFS, new LocationName(['council-bluffs', 'iowa'], 'US')],
  [GeoLocation.EEMSHAVEN, new LocationName(['eemshaven'], 'NL')],
  [GeoLocation.FRANKFURT, new LocationName(['frankfurt'], 'DE')],
  [GeoLocation.HAMINA, new LocationName(['hamina'], 'FI')],
  [GeoLocation.HONGKONG, new LocationName([], 'HK')],
  [GeoLocation.JAKARTA, new LocationName(['jakarta'], 'ID')],
  [GeoLocation.JURONG_WEST, new LocationName(['jurong-west'], 'SG')],
  [GeoLocation.LAS_VEGAS, new LocationName(['las-vegas', 'nevada'], 'US')],
  [GeoLocation.LONDON, new LocationName(['london', 'england'], 'GB')],
  [GeoLocation.LOS_ANGELES, new LocationName(['los-angeles', 'california'], 'US')],
  [GeoLocation.MONCKS_CORNER, new LocationName(['moncks-corner', 'south-carolina'], 'US')],
  [GeoLocation.MONTREAL, new LocationName(['montreal', 'quebec'], 'CA')],
  [GeoLocation.MUMBAI, new LocationName(['mumbai'], 'IN')],
  [GeoLocation.NYC, new LocationName(['new-york-city', 'new-york'], 'US')],
  [GeoLocation.OSAKA, new LocationName(['osaka'], 'JP')],
  [GeoLocation.OSASCO, new LocationName(['osasco', 'sao-paulo'], 'BR')],
  [GeoLocation.SALT_LAKE_CITY, new LocationName(['salt-lake-city', 'utah'], 'US')],
  [GeoLocation.SAN_FRANCISCO, new LocationName(['san-francisco', 'california'], 'US')],
  [GeoLocation.SEOUL, new LocationName(['seoul'], 'KR')],
  [GeoLocation.SINGAPORE, new LocationName([], 'SG')],
  [GeoLocation.ST_GHISLAIN, new LocationName(['st-ghislain'], 'BE')],
  [GeoLocation.SYDNEY, new LocationName(['sydney'], 'AU')],
  [GeoLocation.THE_DALLES, new LocationName(['the-dalles', 'oregon'], 'US')],
  [GeoLocation.TOKYO, new LocationName(['tokyo'], 'JP')],
  [GeoLocation.TORONTO, new LocationName(['toronto'], 'CA')],
  [GeoLocation.WARSAW, new LocationName(['warsaw'], 'PL')],
  [GeoLocation.ZURICH, new LocationName(['zurich'], 'CH')],
]);

/** Type for identifying the server location options during selection. */
export interface DisplayLocation {
  /** The Zone ID, or '' if this location has no usable zones. */
  readonly id: string;
  /** The location name, or null if the zone's `GeoLocation` is unknown. */
  readonly name: LocationName;
}

export function makeDisplayLocation(id: string, geoLocation: GeoLocation):
    DisplayLocation {
  return {id, name: LOCATION_NAMES.get(geoLocation)};
}

/**
 * Given a map of all the zones in a cloud provider, this function returns
 * a list containing one representative zone for each GeoLocation.  Available
 * zones are preferred within each location.  Available zones with unknown
 * GeoLocation (e.g. newly added zones) are placed at the end of the array.
 */
export function collectLocations(zoneMap: ZoneMap): DisplayLocation[] {
  // Contains one available zone ID for each GeoLocation, or null if there are
  // no available zones for that GeoLocation.
  const map = new Map<GeoLocation, string>();
  // Contains all available zone IDs with unknown GeoLocation.
  const unmappedIds: string[] = [];
  
  Object.entries(zoneMap).forEach(([id, info]) => {
    if (info.geoLocation) {
      if (info.available) {
        map.set(info.geoLocation, id);     
      } else if (!map.has(info.geoLocation)) {
        map.set(info.geoLocation, '');
      }
    } else if (info.available) {
      unmappedIds.push(id);
    }
  });

  const locations: DisplayLocation[] = [];
  map.forEach((id, geoLocation) => {
    locations.push(makeDisplayLocation(id, geoLocation));
  });
  // Also show any new zones for which we do not yet know locations.
  locations.push(...unmappedIds.map(id => ({id, name: null})));
  return locations;
}

export function getShortName(location: DisplayLocation,
    localize: (id: string) => string, language: string): string {
  if (!location?.name) {
    return location?.id;
  }
  const cityMsgId = location.name.getSubdivisionIds()[0];
  return cityMsgId ? localize(cityMsgId) : location.name.getCountry(language);
}