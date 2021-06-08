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

import {ServerLocation} from '../model/location';

// import '@formatjs/intl-displaynames/polyfill'
// import '@formatjs/intl-listformat/polyfill'

interface Localizer {
  // Language or locale code.
  readonly language: string;

  // Defined in AppLocalizeBehaviorMixin.
  localize(msgId: string, ...params: string[]): string;
}

/**
 * A server location as displayed to the user.
 * 
 * Server locations are modeled as a country code, plus an optional
 * hierarchy of sub-country locations.  The subdivision IDs are prefixed
 * with "geo-" to form localization message IDs.
 */
class LocationName {
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

  private static wrap(localizer: Localizer): (id: string) => string {
    return id => localizer.localize(`geo-${id}`);
  }

  getFirstName(localizer: Localizer): string {
    if (this.subdivisionIds) {
      return LocationName.wrap(localizer)(this.subdivisionIds[0]);
    }
    return this.getCountry(localizer.language);
  }

  getFullName(localizer: Localizer): string {
    const localized = this.subdivisionIds.map(LocationName.wrap(localizer));
    localized.push(this.getCountry(localizer.language));

    return localized.join(getSeparator(localizer.language));
  }
}

function getSeparator(language: string): string {
  // Intl.ListFormat provides locale-sensitive list formatting.
  // Unfortunately, all of the supported list types result in lists like
  // "a, b, d _and_ d" in some languages, making it unsuitable for
  // geographic locations.  Instead of using it directly, we process a
  // test list in order to extract the separator, and then apply it
  // directly.
  // tslint:disable-next-line:no-any
  const formatter = new (Intl as any).ListFormat(language,  {style: 'long', type: 'conjunction'});
  const parts = formatter.formatToParts(['a', 'b', 'c']);
  return parts[1].value;
}

export const LOCATION_NAMES = new Map<ServerLocation, LocationName>([
  [ServerLocation.AMSTERDAM, new LocationName(['amsterdam'], 'NL')],
  [ServerLocation.ASHBURN, new LocationName(['ashburn', 'virginia'], 'US')],
  [ServerLocation.BANGALORE, new LocationName(['bangalore'], 'IN')],
  [ServerLocation.CHANGHUA, new LocationName(['changhua'], 'TW')],
  [ServerLocation.COUNCIL_BLUFFS, new LocationName(['council-bluffs', 'iowa'], 'US')],
  [ServerLocation.EEMSHAVEN, new LocationName(['eemshaven'], 'NL')],
  [ServerLocation.FRANKFURT, new LocationName(['frankfurt'], 'DE')],
  [ServerLocation.HAMINA, new LocationName(['hamina'], 'FI')],
  [ServerLocation.HONGKONG, new LocationName([], 'HK')],
  [ServerLocation.JAKARTA, new LocationName(['jakarta'], 'ID')],
  [ServerLocation.JURONG_WEST, new LocationName(['jurong-west'], 'SG')],
  [ServerLocation.LAS_VEGAS, new LocationName(['las-vegas', 'nevada'], 'US')],
  [ServerLocation.LONDON, new LocationName(['london', 'england'], 'GB')],
  [ServerLocation.LOS_ANGELES, new LocationName(['los-angeles', 'california'], 'US')],
  [ServerLocation.MONCKS_CORNER, new LocationName(['moncks-corner', 'south-carolina'], 'US')],
  [ServerLocation.MONTREAL, new LocationName(['montreal', 'quebec'], 'CA')],
  [ServerLocation.MUMBAI, new LocationName(['mumbai'], 'IN')],
  [ServerLocation.NYC, new LocationName(['new-york-city', 'new-york'], 'US')],
  [ServerLocation.OSAKA, new LocationName(['osaka'], 'JP')],
  [ServerLocation.OSASCO, new LocationName(['osasco', 'sao-paulo'], 'BR')],
  [ServerLocation.SALT_LAKE_CITY, new LocationName(['salt-lake-city', 'utah'], 'US')],
  [ServerLocation.SAN_FRANCISCO, new LocationName(['san-francisco', 'california'], 'US')],
  [ServerLocation.SEOUL, new LocationName(['seoul'], 'KR')],
  [ServerLocation.SINGAPORE, new LocationName([], 'SG')],
  [ServerLocation.ST_GHISLAIN, new LocationName(['st-ghislain'], 'BE')],
  [ServerLocation.SYDNEY, new LocationName(['sydney'], 'AU')],
  [ServerLocation.THE_DALLES, new LocationName(['the-dalles', 'oregon'], 'US')],
  [ServerLocation.TOKYO, new LocationName(['tokyo'], 'JP')],
  [ServerLocation.TORONTO, new LocationName(['toronto'], 'CA')],
  [ServerLocation.WARSAW, new LocationName(['warsaw'], 'PL')],
  [ServerLocation.ZURICH, new LocationName(['zurich'], 'CH')],
]);

