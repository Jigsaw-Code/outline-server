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

import * as location from './location';
import {GeoLocation} from '../model/zone';

function makeLocalizer(map: {[key: string]: string}) {
  return (msgId: string) => {
    const ret = map[msgId];
    expect(ret).toBeDefined();
    return ret;
  };
}

describe('DisplayLocation', () => {
  // tslint:disable-next-line:no-any
  if (!(Intl as any).DisplayNames) {
    console.log('location_name requires modern Intl features');
    return;
  }

  it('basic case', () => {
    const nyc = location.makeDisplayLocation('nyc', GeoLocation.NYC);
    expect(nyc.id).toEqual('nyc');
    expect(nyc.name.getCountryCode()).toEqual('US');
    expect(nyc.name.getSubdivisionIds()).toEqual(
        ['geo-new-york-city', 'geo-new-york']);

    const localizer = makeLocalizer({
      'geo-new-york-city': 'New York City'
    });
    
    expect(nyc.name.getCountry('en')).toEqual('United States');
    expect(location.getShortName(nyc, localizer, 'en'))
        .toEqual('New York City');
  });
  
  it('country language', () => {
    const nyc = location.makeDisplayLocation('nyc', GeoLocation.NYC);
    expect(nyc.name.getCountry('es')).toEqual('Estados Unidos');
  });

  it('enum completeness', () => {
    for (const enumValue in Object.values(GeoLocation)) {
      if (typeof enumValue !== 'number') {
        // Typescript enums generate reverse-mapping values that we
        // need to ignore.
        continue;
      }
      const displayLocation = location.makeDisplayLocation(
          'fake-id', enumValue as GeoLocation);
      expect(displayLocation.name).toBeTruthy();
      expect(displayLocation.name.getCountryCode().length).toEqual(2);
      expect(displayLocation.name.getCountry('en').length).toBeGreaterThan(2);
    }
  });
});

describe('collectLocations', () => {
  it('empty', () => {
    expect(location.collectLocations({})).toEqual([]);
  });

  it('one available', () => {
    const displayLocations = location.collectLocations({
      'zone-id': {geoLocation: GeoLocation.OSASCO, available: true}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toEqual('zone-id');
    expect(displayLocations[0].name.getSubdivisionIds()[0]).toEqual('geo-osasco');
  });

  it('one not available', () => {
    const displayLocations = location.collectLocations({
      'zone-id': {geoLocation: GeoLocation.SALT_LAKE_CITY, available: false}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toBeNull();
    expect(displayLocations[0].name.getSubdivisionIds()[0]).toEqual('geo-salt-lake-city');
  });

  it('one unrecognized', () => {
    const displayLocations = location.collectLocations({
      'zone-id': {geoLocation: null, available: true}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toEqual('zone-id');
    expect(displayLocations[0].name).toBeNull();
  });

  it('one of each', () => {
    const displayLocations = location.collectLocations({
      'unrecognized': {geoLocation: null, available: true},
      'unavailable': {geoLocation: GeoLocation.SEOUL, available: false},
      'available': {geoLocation: GeoLocation.SAN_FRANCISCO, available: true}
    });
    expect(displayLocations.length).toEqual(3);
    expect(displayLocations[0].id).toBeNull();
    expect(displayLocations[0].name.getSubdivisionIds()[0]).toEqual('geo-seoul');
    expect(displayLocations[1].id).toEqual('available');
    expect(displayLocations[1].name.getSubdivisionIds()[0]).toEqual('geo-san-francisco');
    // Unrecognized zones are moved to the end of the list
    expect(displayLocations[2].id).toEqual('unrecognized');
    expect(displayLocations[2].name).toBeNull();
  });

  it('available preferred', () => {
    const displayLocations = location.collectLocations({
      'unavailable': {geoLocation: GeoLocation.TOKYO, available: false},
      'available': {geoLocation: GeoLocation.TOKYO, available: true}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toEqual('available');
    expect(displayLocations[0].name.getSubdivisionIds()[0]).toEqual('geo-tokyo');
  });
});
