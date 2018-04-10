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

// Missing fields from typings.
interface IPv4 extends ipaddr.IPv4 {
  octets: number[];
}

interface IPv6 extends ipaddr.IPv6 {
  parts: number[];
}

// Returns anonymized IP address, by setting the last octet to 0 for ipv4,
// or setting the last 80 bits to 0 for ipv6.
// Throws an exception when passed an invalid IP address.
export function anonymizeIp(ip: string): string {
  const addr = ipaddr.parse(ip);
  if (addr.kind() === 'ipv4') {
    // Replace last octet of ipv4 address with a 0.
    (addr as IPv4).octets[3] = 0;
    return addr.toString();
  } else {
    // Replace last 80 bits (5 groups of 4 hex characters) with 0s.
    for (let i = 3; i < 8; ++i) {
      (addr as IPv6).parts[i] = 0;
    }
    return addr.toNormalizedString();
  }
}