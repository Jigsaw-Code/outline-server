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
  describe('freePort', () => {
    it('makes port available', () => {
      const ports = new get_port.PortProvider();
      ports.addReservedPort(8080);
      ports.freePort(8080);
      ports.addReservedPort(8080);
    });
  });
  describe('reserveFirstFreePort', () => {
    it('returns free port', async () => {
      const ports = new get_port.PortProvider();
      const server = await listen();
      expect(await ports.reserveFirstFreePort(server.address().port))
          .toBeGreaterThan(server.address().port);
      server.close();
    });
    it('respects reserved ports', async () => {
      const ports = new get_port.PortProvider();
      ports.addReservedPort(9090);
      ports.addReservedPort(9091);
      expect(await ports.reserveFirstFreePort(9090)).toBeGreaterThan(9091);
    });
  });
});

function listen(): Promise<net.Server> {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.listen({host: 'localhost', port: 0, exclusive: true}, () => {
      resolve(server);
    });
  });
}

describe('getUsedPorts', () => {
  it('returns used port', async () => {
    const server = await listen();
    const serverPort = server.address().port;
    const usedPorts = await get_port.getUsedPorts();
    expect(usedPorts).toContain(serverPort);

    const onceClosed = new Promise((resolve, reject) => {
      server.on('close', () => resolve());
    });
    server.close();
    await onceClosed;
    expect(await get_port.getUsedPorts()).not.toContain(serverPort);
  });
});