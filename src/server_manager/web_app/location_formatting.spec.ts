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

import {collectLocations, getShortName, localizeCountry} from './location_formatting';

describe('getShortName', () => {
  it('basic case', () => {
    expect(getShortName({id: 'fake-id', geoId: 'sydney'}, msgId => {
      expect(msgId).toEqual('geo-sydney');
      return 'foo';
    })).toEqual('foo');
  });

  it('city-state is converted to lowercase', () => {
    expect(getShortName({id: 'fake-id', geoId: 'SG'}, msgId => {
      expect(msgId).toEqual('geo-sg');
      return 'foo';
    })).toEqual('foo');
  });

  it('returns the ID when geoId is null', () => {
    expect(getShortName({id: 'fake-id', geoId: null}, msgId => {
      fail();
      return null;
    })).toEqual('fake-id');
  });

  it('returns empty string when the location is null', () => {
    expect(getShortName(null, msgId => {
      fail();
      return null;
    })).toEqual('');
  });
});

describe('localizeCountry', () => {
  // tslint:disable-next-line:no-any
  if (!(Intl as any).DisplayNames) {
    console.log('country localization requires modern Intl features');
    return;
  }

  it('basic case', () => {
    expect(localizeCountry('new-york-city', 'en')).toEqual('United States');
  });
  
  it('other language', () => {
    expect(localizeCountry('new-york-city', 'es')).toEqual('Estados Unidos');
  });

  it('city-state is empty', () => {
    expect(localizeCountry('SG', 'en')).toEqual('');
  });

  it('null is empty', () => {
    expect(localizeCountry(null, 'en')).toEqual('');
  });
});

describe('collectLocations', () => {
  it('empty', () => {
    expect(collectLocations({})).toEqual([]);
  });

  it('one available', () => {
    const displayLocations = collectLocations({
      'zone-id': {geoId: 'sao-paulo', available: true}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toEqual('zone-id');
    expect(displayLocations[0].geoId).toEqual('sao-paulo');
  });

  it('one not available', () => {
    const displayLocations = collectLocations({
      'zone-id': {geoId: 'salt-lake-city', available: false}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toBeNull();
    expect(displayLocations[0].geoId).toEqual('salt-lake-city');
  });

  it('one unrecognized', () => {
    const displayLocations = collectLocations({
      'zone-id': {geoId: null, available: true}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toEqual('zone-id');
    expect(displayLocations[0].geoId).toBeNull();
  });

  it('one of each', () => {
    const displayLocations = collectLocations({
      'unrecognized': {geoId: null, available: true},
      'unavailable': {geoId: 'seoul', available: false},
      'available': {geoId: 'san-francisco', available: true}
    });
    expect(displayLocations.length).toEqual(3);
    expect(displayLocations[0].id).toBeNull();
    expect(displayLocations[0].geoId).toEqual('seoul');
    expect(displayLocations[1].id).toEqual('available');
    expect(displayLocations[1].geoId).toEqual('san-francisco');
    // Unrecognized zones are moved to the end of the list
    expect(displayLocations[2].id).toEqual('unrecognized');
    expect(displayLocations[2].geoId).toBeNull();
  });

  it('available preferred', () => {
    const displayLocations = collectLocations({
      'unavailable': {geoId: 'tokyo', available: false},
      'available': {geoId: 'tokyo', available: true}
    });
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0].id).toEqual('available');
    expect(displayLocations[0].geoId).toEqual('tokyo');
  });
});
