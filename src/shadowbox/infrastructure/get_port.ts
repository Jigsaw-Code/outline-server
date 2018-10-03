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

function isPortUsedLsof(port: number): Promise<boolean> {
  return new Promise((fulfill, reject) => {
    const cmd = `lsof -P -i:${port} | grep LISTEN`;
    child_process.exec(cmd, (error: child_process.ExecError, stdout: string, stderr: string) => {
      if (error && error.code === 1) {
        // lsof will return error code 1 if nothing is found.
        fulfill(false);
      } else if (stdout.trim() || stderr.trim()) {
        // Anything written to stdout or stderr indicates that this port
        // is in use.
        fulfill(true);
      } else {
        fulfill(false);
      }
    });
  });
}
