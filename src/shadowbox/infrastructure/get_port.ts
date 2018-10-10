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

import * as child_process from 'child_process';

const MAX_PORT = 65535;
const MIN_PORT = 1024;

export class PortProvider {
  private reservedPorts = new Set<number>();

  constructor() {}

  addReservedPort(port: number) {
    if (this.reservedPorts.has(port)) {
      throw new Error(`Port ${port} is already reserved`);
    }
    this.reservedPorts.add(port);
  }

  // Returns the first free port equal or after initialPort
  async reserveFirstFreePort(initialPort: number): Promise<number> {
    const usedPorts = await getUsedPorts();
    for (let port = initialPort; port < 65536; port++) {
      if (!usedPorts.has(port) && !this.reservedPorts.has(port)) {
        this.reservedPorts.add(port);
        return port;
      }
    }
    throw new Error('port not found');
  }

  async reserveNewPort(): Promise<number> {
    // TODO: consider using a set of available ports, so we don't randomly
    // try the same port multiple times.
    while (true) {
      const port = getRandomPortOver1023();
      if (this.reservedPorts.has(port)) {
        continue;
      }
      if (await isPortUsedLsof(port)) {
        continue;
      }
      this.reservedPorts.add(port);
      return port;
    }
  }

  freePort(port: number) {
    this.reservedPorts.delete(port);
  }
}

function getRandomPortOver1023() {
  return Math.floor(Math.random() * (MAX_PORT + 1 - MIN_PORT) + MIN_PORT);
}

// Returns the first free port equal or after initialPort
async function getFirstFreePort(initialPort: number): Promise<number> {
  const usedPorts = await getUsedPorts();
  for (let port = initialPort; port < 65536; port++) {
    if (!usedPorts.has(port)) {
      return port;
    }
  }
  throw new Error('port not found');
}

// Returns the list of ports used by either TCP or UDP.
export function getUsedPorts(): Promise<Set<number>> {
  return new Promise((resolve, reject) => {
    child_process.exec('lsof -P -i -F n', (error, stdout, stderr) => {
      const tcpPorts = new Set<number>();
      if (error) {
        if (error.code === 1) {
          // Empty list case
          return resolve(tcpPorts);
        }
        return reject(error);
      }
      for (const line of stdout.split(/\r?\n/)) {
        if (line.length === 0 || line[0] !== 'n') {
          continue;
        }
        const parts = line.split(':');
        if (parts.length !== 2) {
          continue;
        }
        const port = parseInt(parts[1], 10);
        if (port) {
          tcpPorts.add(port);
        }
      }
      resolve(tcpPorts);
    });
  });
}

function isPortUsedLsof(port: number): Promise<boolean> {
  return getUsedPorts().then((usedPorts) => {
    for (const usedPort of usedPorts) {
      if (usedPort === port) {
        return true;
      }
    }
    return false;
  });
}
