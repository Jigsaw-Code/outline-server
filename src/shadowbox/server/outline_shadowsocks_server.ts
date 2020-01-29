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
import {ShadowsocksAccessKey, ShadowsocksServer} from '../model/shadowsocks_server';

// Runs outline-ss-server.
export class OutlineShadowsocksServer implements ShadowsocksServer {
  private ssProcess: child_process.ChildProcess;
  private ipCountryFilename = '';

  // configFilename is the location for the outline-ss-server config.
  constructor(
      private readonly configFilename: string, private readonly verbose: boolean,
      private readonly metricsLocation: string) {}

  // Annotates the Prometheus data metrics with countries.
  // ipCountryFilename is the location of the ip-country.mmdb IP-to-country database file.
  enableCountryMetrics(ipCountryFilename: string): OutlineShadowsocksServer {
    this.ipCountryFilename = ipCountryFilename;
    return this;
  }

  // Promise is resolved after the outline-ss-config config is updated and the SIGHUP sent.
  // Keys may not be active yet.
  // TODO(fortuna): Make promise resolve when keys are ready.
  update(keys: ShadowsocksAccessKey[]): Promise<void> {
    return this.writeConfigFile(keys).then(() => {
      if (!this.ssProcess) {
        this.start();
        return Promise.resolve();
      } else {
        this.ssProcess.kill('SIGHUP');
      }
    });
  }

  private writeConfigFile(keys: ShadowsocksAccessKey[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const keysJson = {keys: [] as ShadowsocksAccessKey[]};
      for (const key of keys) {
        if (!isAeadCipher(key.cipher)) {
          logging.error(`Cipher ${key.cipher} for access key ${
              key.id} is not supported: use an AEAD cipher instead.`);
          continue;
        }
        keysJson.keys.push(key);
      }
      const ymlTxt = jsyaml.safeDump(keysJson, {'sortKeys': true});
      mkdirp.sync(path.dirname(this.configFilename));
      fs.writeFile(this.configFilename, ymlTxt, 'utf-8', (err) => {
        if (err) {
          reject(err);
        }
        resolve();
      });
    });
  }

  private start() {
    const commandArguments = ['-config', this.configFilename, '-metrics', this.metricsLocation];
    if (this.ipCountryFilename) {
      commandArguments.push('-ip_country_db', this.ipCountryFilename);
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
    // This exposes the outline-ss-server output on the docker logs.
    // TODO(fortuna): Consider saving the output and expose it through the manager service.
    this.ssProcess.stdout.pipe(process.stdout);
    this.ssProcess.stderr.pipe(process.stderr);
  }
}

// List of AEAD ciphers can be found at https://shadowsocks.org/en/spec/AEAD-Ciphers.html
function isAeadCipher(cipherAlias: string) {
  cipherAlias = cipherAlias.toLowerCase();
  return cipherAlias.endsWith('gcm') || cipherAlias.endsWith('poly1305');
}