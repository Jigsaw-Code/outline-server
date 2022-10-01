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

import * as net from 'net';

import * as get_port from './get_port';

describe('PortProvider', () => {
  describe('addReservedPort', () => {
    it('gets port over 1023', async () => {
      expect(await new get_port.PortProvider().reserveNewPort()).toBeGreaterThan(1023);
    });

    it('fails on double reservation', () => {
      const ports = new get_port.PortProvider();
      ports.addReservedPort(8080);
      expect(() => ports.addReservedPort(8080)).toThrowError();
    });
  });

  describe('reserveFirstFreePort', () => {
    it('returns free port', async () => {
      const ports = new get_port.PortProvider();
      const server = await listen();
      const initialPort = (server.address() as net.AddressInfo).port;
      expect(await ports.reserveFirstFreePort(initialPort)).toBeGreaterThan(initialPort);
      server.close();
    });

    it('respects reserved ports', async () => {
      const ports = new get_port.PortProvider();
      ports.addReservedPort(9090);
      ports.addReservedPort(9091);
      expect(await ports.reserveFirstFreePort(9090)).toBeGreaterThan(9091);
    });
  });

  describe('reserveNewPort', () => {
    it('Returns a port not in use', async (done) => {
      for (let i = 0; i < 1000; ++i) {
        const port = await new get_port.PortProvider().reserveNewPort();
        expect(await get_port.isPortUsed(port)).toBeFalsy();
      }
      done();
    });
  });
});

describe('isPortUsed', () => {
  it('Identifies a port in use', async (done) => {
    const port = 12345;
    const server = new net.Server();
    server.listen(port, async () => {
      expect(await get_port.isPortUsed(port)).toBeTruthy();
      server.close();
      done();
    });
  });
  it('Identifies a port not in use', async (done) => {
    const port = await new get_port.PortProvider().reserveNewPort();
    expect(await get_port.isPortUsed(port)).toBeFalsy();
    done();
  });
});

function listen(): Promise<net.Server> {
  const server = net.createServer();
  return new Promise((resolve, _reject) => {
    server.listen({host: 'localhost', port: 0, exclusive: true}, () => {
      resolve(server);
    });
  });
}
