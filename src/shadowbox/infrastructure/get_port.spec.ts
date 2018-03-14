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

import * as get_port from './get_port';

const USED_PORT_1 = 2001;
const USED_PORT_2 = 2002;
const USED_PORT_3 = 2003;
const UNUSED_PORT_1 = 3000;

describe('getRandomUnusedPort', () => {
  it('Tries until it finds an unused port', (done) => {
    let generateCount = 0;
    function generatePort(): number {
      return [USED_PORT_1, USED_PORT_2, USED_PORT_3, UNUSED_PORT_1][generateCount++];
    }
    // This test replaces the default lsof check for used ports, as lsof may
    // return different used ports on each machine.  To test with the real lsof
    // code:
    // 1. run "lsof -P | grep LISTEN" to see which ports are in use
    // 2. change the USED_PORT_1..3 variables above to use those port numbers,
    //    and be sure that UNUSED_PORT_1 is in fact unused on your machine.
    // 3. remove the "isPortUsed" parameter from this call to getRandomUnusedPort.
    get_port.getRandomUnusedPort(new Set(), generatePort, isPortUsed).then((port) => {
      expect(port).toEqual(UNUSED_PORT_1);
      done();
    });
  });

  it('Rejects if it cannot find an unused port', (done) => {
    get_port
        .getRandomUnusedPort(
            new Set(), get_port.getRandomPortOver1023,
            (port: number) => Promise.resolve(true))  // always return port in use
        .catch(done);
  });

  it('Does not pick from reserved ports', (done) => {
    const RESERVED_PORT = 123;
    const MAX_RETRIES = 1;
    get_port
        .getRandomUnusedPort(
            new Set([RESERVED_PORT]), () => RESERVED_PORT, (port: number) => Promise.resolve(false),
            MAX_RETRIES)
        .catch(done);
  });
});

function isPortUsed(port: number): Promise<boolean> {
  const isUsed = port === USED_PORT_1 || port === USED_PORT_2 || port === USED_PORT_3;
  return Promise.resolve(isUsed);
}
