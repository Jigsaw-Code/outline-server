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

// Cache country lookups per IP address.
const countryCache = new Map<string, Promise<string>>();

export function lookupCountry(ipAddress: string) : Promise<string> {
  if (countryCache.has(ipAddress)) {
    // Return cached promise to prevent duplicate lookups.
    return countryCache.get(ipAddress);
  }

  const promise = new Promise<string>((fulfill, reject) => {
    const options = {host: 'freegeoip.io', path: '/json/' + ipAddress};
    https.get(options, (response) => {
      let body = '';
      response.on('data', (data) => {
        body += data;
      });
      response.on('end', () => {
        try {
          fulfill(JSON.parse(body).country_code);
        } catch (err) {
          console.error('Error loading country: ', err);
          reject(err);
        }
      });
    });
  });

  // Prevent multiple lookups of the same country.
  countryCache.set(ipAddress, promise);

  return promise;
}
