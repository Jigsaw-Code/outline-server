// Copyright 2018 The Outline Authors
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

import * as https from 'https';
import * as maxmind from 'maxmind';

export interface IpLocationService {
  // Returns the 2-digit country code for the IP address.
  countryForIp(ipAddress: string): Promise<string>;
}

// An IpLocationService that uses the ipinfo.io service.
// See https://ipinfo.io/developers for API.
export class IpInfoIpLocationService implements IpLocationService {
  countryForIp(ipAddress: string): Promise<string> {
    const countryPromise = new Promise<string>((fulfill, reject) => {
      const url = `https://ipinfo.io/${encodeURIComponent(ipAddress)}/country`;
      https.get(url, (response) => {
        if (500 <= response.statusCode && response.statusCode <= 599) {
          reject(new Error(`Got server error ${response.statusCode} from ipinfo.io`));
          response.resume();
          return;
        }
        let body = '';
        response.on('data', (data) => { body += data; });
        response.on('end', () => {
          // ZZ is user-assigned and used by CLDR for "Uknown" regions.
          fulfill(body.trim() || 'ZZ');
        });
      }).on('error', (e) => {
        reject(new Error(`Failed to contact ipinfo.io: ${e}`));
      });
    });
    return countryPromise;
  }
}

// An IpLocationService that uses the freegeoip.net service.
// See https://freegeoip.net/
export class FreegeoIpLocationService implements IpLocationService {
  countryForIp(ipAddress: string): Promise<string> {
    const countryPromise = new Promise<string>((fulfill, reject) => {
      const url = `https://freegeoip.net/json/${encodeURIComponent(ipAddress)}`;
      https.get(url, (response) => {
        if (500 <= response.statusCode && response.statusCode <= 599) {
          reject(new Error(`Got server error ${response.statusCode} from freegeoip.net`));
          response.resume();
          return;
        }
        let body = '';
        response.on('data', (data) => { body += data; });
        response.on('end', () => {
          try {
            const jsonResponse = JSON.parse(body);
            // ZZ is user-assigned and used by CLDR for "Uknown" regions.
            fulfill(jsonResponse.country_code || 'ZZ');
          } catch (e) {
            reject(new Error(`Error loading country from freegeoip.net reponse`));
          }
        });
      }).on('error', (e) => {
        reject(new Error(`Failed to contact freegeoip.net: ${e}`));
      });
    });
    return countryPromise;
  }
}

// An IpLocationService that uses the node-maxmind package.
// The database is downloaded by scripts/update_mmdb.sh.
// The Dockerfile runs this script on boot and configures the system to run it weekly.
export class MmdbLocationService implements IpLocationService {
  private db: Promise<maxmind.Reader>;

  constructor(filename?: string) {
    if (!filename) {
      filename = '/var/lib/libmaxminddb/GeoLite2-Country.mmdb';
    }
    this.db = new Promise<maxmind.Reader>((fulfill, reject) => {
      // TODO: Change type to maxmind.Options once the type definition is updated
      // with these fields.
      const options: {} = {watchForUpdates: true, watchForUpdatesNonPersistent: true};
      maxmind.open(filename, options, (err, lookup) => {
        if (err) {
          reject(err);
        } else {
          fulfill(lookup);
        }
      });
    });
  }

  countryForIp(ipAddress: string): Promise<string> {
    return this.db.then((lookup) => {
      if (!maxmind.validate(ipAddress)) {
        throw new Error('Invalid IP address');
      }
      const result = lookup.get(ipAddress);
      return (result && result.country && result.country.iso_code) || 'ZZ';
    });
  }
}

// An IpLocationService that caches the responses of another IpLocationService.
export class CachedIpLocationService implements IpLocationService {
  // TODO: Make this cache bounded in size. Possibly use lru-cache.
  private countryCache: Map<string, Promise<string>>;

  constructor(private locationService: IpLocationService) {
    this.countryCache = new Map<string, Promise<string>>();
  }

  countryForIp(ipAddress: string): Promise<string> {
    if (this.countryCache.has(ipAddress)) {
      return this.countryCache.get(ipAddress);
    }
    const promise = this.locationService.countryForIp(ipAddress);
    this.countryCache.set(ipAddress, promise);
    return promise;
  }
}
