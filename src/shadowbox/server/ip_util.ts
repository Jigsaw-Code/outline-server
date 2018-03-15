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

import * as ipaddr from 'ipaddr.js';
import * as https from 'https';

// Returns anonymized IP address, by setting the last octet to 0 for ipv4,
// or setting the last 80 bits to 0 for ipv6.
// Throws an exception when passed an invalid IP address.
export function anonymizeIp(ip: string): string {
  const addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv4') {
    // Replace last octet of ipv4 address with a 0.
    addr.octets[3] = 0;
    return addr.toString();
  } else {
    // Replace last 80 bits (5 groups of 4 hex characters) with 0s.
    for (let i = 3; i < 8; ++i) {
      addr.parts[i] = 0;
    }
    return addr.toNormalizedString();
  }
}

export interface IpLocationService { countryForIp(ipAddress: string): Promise<string>; }

export class FreegeoIpLocationService implements IpLocationService {
  countryForIp(ipAddress: string): Promise<string> {
    const countryPromise = new Promise<string>((fulfill, reject) => {
      const options = {host: 'freegeoip.io', path: '/json/' + ipAddress};
      https
          .get(
              options,
              (response) => {
                let body = '';
                response.on('data', (data) => {
                  body += data;
                });
                response.on('end', () => {
                  try {
                    const jsonResponse = JSON.parse(body);
                    if (jsonResponse.country_code) {
                      fulfill(jsonResponse.country_code);
                    } else {
                      // ZZ is user-assigned and used by CLDR for "Uknown" regions.
                      fulfill('ZZ');
                    }
                  } catch (e) {
                    reject(new Error(`Error loading country from reponse: ${e}`));
                  }
                });
              })
          .on('error', (e) => {
            reject(new Error(`Failed to contact location service: ${e}`));
          });
    });
    return countryPromise;
  }
}

export class CachedIpLocationService implements IpLocationService {
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
