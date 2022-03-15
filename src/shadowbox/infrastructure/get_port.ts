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

const MAX_PORT = 65535;
const MIN_PORT = 1024;

export class PortProvider {
  private reservedPorts = new Set<number>();

  addReservedPort(port: number) {
    if (this.reservedPorts.has(port)) {
      throw new Error(`Port ${port} is already reserved`);
    }
    this.reservedPorts.add(port);
  }

  // Returns the first free port equal or after initialPort
  async reserveFirstFreePort(initialPort: number): Promise<number> {
    for (let port = initialPort; port < 65536; port++) {
      if (!this.reservedPorts.has(port) && !(await isPortUsed(port))) {
        this.reservedPorts.add(port);
        return port;
      }
    }
    throw new Error('port not found');
  }

  async reserveNewPort(): Promise<number> {
    // TODO: consider using a set of available ports, so we don't randomly
    // try the same port multiple times.
    for (;;) {
      const port = getRandomPortOver1023();
      if (this.reservedPorts.has(port)) {
        continue;
      }
      if (await isPortUsed(port)) {
        continue;
      }
      this.reservedPorts.add(port);
      return port;
    }
  }
}

function getRandomPortOver1023() {
  return Math.floor(Math.random() * (MAX_PORT + 1 - MIN_PORT) + MIN_PORT);
}

interface ServerError extends Error {
  code: string;
}

export function isPortUsed(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let isUsed = false;
    const server = new net.Server();
    server.on('error', (error: ServerError) => {
      if (error.code === 'EADDRINUSE') {
        isUsed = true;
      } else {
        reject(error);
      }
      server.close();
    });
    server.listen({host: 'localhost', port, exclusive: true}, () => {
      isUsed = false;
      server.close();
    });
    server.on('close', () => {
      resolve(isUsed);
    });
  });
}
