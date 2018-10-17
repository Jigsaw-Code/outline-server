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
import * as fs from 'fs';
import * as jsyaml from 'js-yaml';
import * as mkdirp from 'mkdirp';
import * as path from 'path';

import * as logging from '../infrastructure/logging';
import {AccessKey, ShadowsocksServer} from '../model/shadowsocks_server';

// Runs outline-ss-server.
export class OutlineShadowsocksServer implements ShadowsocksServer {
  private ssProcess: child_process.ChildProcess;

  // configFilename is the location for the outline-ss-server config.
  constructor(
      private configFilename: string, private verbose: boolean, private metricsLocation: string,
      private ipCountryLocation: string) {}

  private writeConfigFile(keys: AccessKey[]): Promise<void> {
    const keysJson = {keys: [] as AccessKey[]};
    for (const key of keys) {
      keysJson.keys.push(key);
    }
    const ymlTxt = jsyaml.safeDump(keysJson, {'sortKeys': true});
    return new Promise((resolve, reject) => {
      mkdirp.sync(path.dirname(this.configFilename));
      fs.writeFile(this.configFilename, ymlTxt, 'utf-8', (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }

  update(keys: AccessKey[]): Promise<void> {
    return this.writeConfigFile(keys).then(() => {
      if (!this.ssProcess) {
        this.start();
        return Promise.resolve();
      } else {
        this.ssProcess.kill('SIGHUP');
      }
    });
  }

  private start() {
    const commandArguments = ['-config', this.configFilename, '-metrics', this.metricsLocation];
    if (this.ipCountryLocation) {
      commandArguments.push('-ip_country_db', this.ipCountryLocation);
    }
    if (this.verbose) {
      commandArguments.push('-verbose');
    }
    this.ssProcess = child_process.spawn('/root/shadowbox/bin/outline-ss-server', commandArguments);
    this.ssProcess.on('error', (error) => {
      logging.error(`Error spawning outline-ss-server: ${error}`);
    });
    this.ssProcess.on('exit', (code, signal) => {
      logging.info(`outline-ss-server has exited with error. Code: ${code}, Signal: ${signal}`);
      logging.info(`Restarting`);
      this.start();
    });
    // TODO(fortuna): Disable this for production.
    // TODO(fortuna): Consider saving the output and expose it through the manager service.
    this.ssProcess.stdout.pipe(process.stdout);
    this.ssProcess.stderr.pipe(process.stderr);
  }
}
