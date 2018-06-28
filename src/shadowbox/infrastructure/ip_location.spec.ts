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

import * as ip_location from './ip_location';

function testIpLocationService(name: string, service: ip_location.IpLocationService) {
  describe(
      name, () => {
        it('returns ZZ on unknown country', (done) => {
            service.countryForIp('127.0.0.1').then((countryCode) => {
                expect(countryCode).toEqual('ZZ');
                done();
            }).catch((e) => {
                done.fail(e);
            });
        });
        it('returns AU for 1.0.0.1', (done) => {
            service.countryForIp('1.0.0.1').then((countryCode) => {
                expect(countryCode).toEqual('AU');
                done();
            }).catch((e) => {
                done.fail(e);
            });
        });
      });
}

testIpLocationService('IpInfoIpLocationService', new ip_location.IpInfoIpLocationService());
testIpLocationService('FreegeoIpLocationService', new ip_location.FreegeoIpLocationService());
const testDbPath = 'third_party/maxmind/GeoLite2-Country_20180327/GeoLite2-Country.mmdb';
testIpLocationService('MmdbLocationService', new ip_location.MmdbLocationService(testDbPath));
