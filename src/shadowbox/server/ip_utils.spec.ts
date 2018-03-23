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
import * as ip_util from './ip_util';

describe('anonymizeIp', () => {
  it('Removes last byte of IPv4', () => {
    expect(ip_util.anonymizeIp('128.128.128.128')).toEqual('128.128.128.0');
  });
  it('Removes last bytes of IPv6', () => {
    expect(ip_util.anonymizeIp('aaaa:aaaa:aaaa:aaaa:aaaa:aaaa:aaaa:aaaa'))
        .toEqual('aaaa:aaaa:aaaa:0:0:0:0:0');
  });
});
