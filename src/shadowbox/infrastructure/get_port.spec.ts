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
      const reservedPort = await ports.reserveFirstFreePort(initialPort);
      await closeServer(server);
      expect(reservedPort).toBeGreaterThan(initialPort);
    });

    it('respects reserved ports', async () => {
      const ports = new get_port.PortProvider();
      ports.addReservedPort(9090);
      ports.addReservedPort(9091);
      expect(await ports.reserveFirstFreePort(9090)).toBeGreaterThan(9091);
    });
  });

  describe('reserveNewPort', () => {
    it('Returns a port not in use', async () => {
      // We run 100 times to try to trigger possible race conditions.
      for (let i = 0; i < 100; ++i) {
        const port = await new get_port.PortProvider().reserveNewPort();
        expect(await get_port.isPortUsed(port)).toBeFalsy();
      }
    });
  });
});

describe('isPortUsed', () => {
  it('Identifies a port in use on IPV4', async () => {
    const port = 12345;
    const server = new net.Server();
    const isPortUsed = await new Promise((resolve) => {
      server.listen(port, '127.0.0.1', () => {
        resolve(get_port.isPortUsed(port));
      });
    });
    await closeServer(server);
    expect(isPortUsed).toBeTruthy();
  });
  it('Identifies a port in use on IPV6', async () => {
    const port = 12345;
    const server = new net.Server();
    const isPortUsed = await new Promise((resolve) => {
      server.listen(port, '::1', () => {
        resolve(get_port.isPortUsed(port));
      });
    });
    await closeServer(server);
    expect(isPortUsed).toBeTruthy();
  });
  it('Identifies a port not in use', async () => {
    const port = await new get_port.PortProvider().reserveNewPort();
    expect(await get_port.isPortUsed(port)).toBeFalsy();
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

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
  });
}
