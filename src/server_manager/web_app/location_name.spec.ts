import {LOCATION_NAMES} from './location_name';
import {ServerLocation} from '../model/location';

class MockLocalizer {
  constructor(public language: string,
    private map: {[key: string]: string}) {}
  
  localize(msgId: string): string {
    const ret = this.map[msgId];
    expect(ret).toBeDefined();
    return ret;
  }
}

describe('LOCATION_NAMES', () => {
  // tslint:disable-next-line:no-any
  if (!(Intl as any).DisplayNames || !(Intl as any).ListFormat) {
    console.log('location_name requires modern Intl features');
    return;
  }

  it('basic case', () => {
    const nyc = LOCATION_NAMES.get(ServerLocation.NYC);
    expect(nyc).toBeDefined();

    expect(nyc.getCountryCode()).toEqual('US');

    const localizer = new MockLocalizer('en', {
      'geo-new-york-city': 'New York City',
      'geo-new-york': 'New York'
    });
    
    expect(nyc.getCountry(localizer.language)).toEqual('United States');
    expect(nyc.getFirstName(localizer)).toEqual('New York City');
    expect(nyc.getFullName(localizer))
        .toEqual('New York City, New York, United States');
  });
  
  it('country language', () => {
    const nyc = LOCATION_NAMES.get(ServerLocation.NYC);
    expect(nyc.getCountry('es')).toEqual('Estados Unidos');
  });

  it('enum completeness', () => {
    for (const location in Object.values(ServerLocation)) {
      if (typeof location !== 'number') {
        continue;
      }
      const name = LOCATION_NAMES.get(location as ServerLocation);
      expect(name).toBeDefined();
      expect(name.getCountryCode().length).toEqual(2);
      expect(name.getCountry('en').length).toBeGreaterThan(2);
    }
  });
});
