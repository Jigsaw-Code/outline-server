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

import * as location from '../model/location';
import {filterOptions, getShortName, localizeCountry} from './location_formatting';

describe('getShortName', () => {
  it('basic case', () => {
    expect(getShortName({id: 'fake-id', location: location.SYDNEY}, msgId => {
      expect(msgId).toEqual('geo-sydney');
      return 'foo';
    })).toEqual('foo');
  });

  it('city-state is converted to lowercase', () => {
    expect(getShortName({id: 'fake-id', location: location.SINGAPORE}, msgId => {
      expect(msgId).toEqual('geo-sg');
      return 'foo';
    })).toEqual('foo');
  });

  it('returns the ID when geoId is null', () => {
    expect(getShortName({id: 'fake-id', location: null}, msgId => {
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
    expect(localizeCountry(location.NEW_YORK_CITY, 'en')).toEqual('United States');
  });
  
  it('other language', () => {
    expect(localizeCountry(location.NEW_YORK_CITY, 'es')).toEqual('Estados Unidos');
  });

  it('city-state is empty', () => {
    expect(localizeCountry(location.SINGAPORE, 'en')).toEqual('');
  });

  it('null is empty', () => {
    expect(localizeCountry(null, 'en')).toEqual('');
  });
});

describe('filterOptions', () => {
  it('empty', () => {
    expect(filterOptions([])).toEqual([]);
  });

  it('one available', () => {
    const option = {
      cloudLocation: {id: 'zone-id', location: location.SAO_PAULO},
      available: true
    };
    const displayOptions = filterOptions([option]);
    expect(displayOptions.length).toEqual(1);
    expect(displayOptions[0]).toEqual(option);
  });

  it('one not available', () => {
    const option = {
      cloudLocation: {id: 'zone-id', location: location.SALT_LAKE_CITY},
      available: false
    };
    const displayLocations = filterOptions([option]);
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0]).toEqual(option);
  });

  it('one unrecognized', () => {
    const option: location.CloudLocationOption = {
      cloudLocation: {id: 'zone-id', location: null},
      available: true
    };
    const displayLocations = filterOptions([option]);
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0]).toEqual(option);
  });

  it('one unrecognized and unavailable', () => {
    const option : location.CloudLocationOption = {
      cloudLocation: {id: 'zone-id', location: null},
      available: false
    };
    const displayLocations = filterOptions([option]);
    expect(displayLocations.length).toEqual(0);
  });

  it('one of each', () => {
    const available = {
      cloudLocation: {id: 'available', location: location.SAN_FRANCISCO},
      available: true
    };
    const unavailable = {
      cloudLocation: {id: 'unavailable', location: location.SEOUL},
      available: false
    };
    const unrecognized : location.CloudLocationOption = {
      cloudLocation: {id: 'unrecognized', location: null},
      available: true
    };
    const unrecognizedAndUnavailable : location.CloudLocationOption = {
      cloudLocation: {id: 'unrecognized-and-unavailable', location: null},
      available: false
    };

    const displayLocations = filterOptions([
      unrecognized,
      unavailable,
      unrecognizedAndUnavailable,
      available
    ]);
    expect(displayLocations.length).toEqual(3);
    expect(displayLocations[0]).toEqual(available);
    expect(displayLocations[1]).toEqual(unavailable);
    expect(displayLocations[2]).toEqual(unrecognized);
  });

  it('available preferred', () => {
    const available = {
      cloudLocation: {id: 'available', location: location.TOKYO},
      available: true
    };
    const unavailable = {
      cloudLocation: {id: 'unavailable', location: location.TOKYO},
      available: false
    };
    const displayLocations = filterOptions([unavailable, available]);
    expect(displayLocations.length).toEqual(1);
    expect(displayLocations[0]).toEqual(available);
  });
});
