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
import * as jsyaml from 'js-yaml';
import * as mkdirp from 'mkdirp';
import * as path from 'path';

import * as file from '../infrastructure/file';
import * as logging from '../infrastructure/logging';
import {ShadowsocksAccessKey, ShadowsocksServer} from '../model/shadowsocks_server';

// Runs outline-ss-server.
export class OutlineShadowsocksServer implements ShadowsocksServer {
  private ssProcess: child_process.ChildProcess;
  private isCountryMetricsEnabled_ = false;
  private isAsnMetricsEnabled_ = false;
  private isReplayProtectionEnabled = false;

  /**
   * @param binaryFilename The location for the outline-ss-server binary.
   * @param configFilename The location for the outline-ss-server config.
   * @param metricsLocation The location from where to serve the Prometheus data metrics.
   * @param verbose Whether to run the server in verbose mode.
   * @param ipCountryFilename The location of IP-to-country database file.
   * @param ipAsnFilename The location of IP-to-ASN database file.
   */
  constructor(
    private readonly binaryFilename: string,
    private readonly configFilename: string,
    private readonly verbose: boolean,
    private readonly metricsLocation: string,
    private readonly ipCountryFilename?: string,
    private readonly ipAsnFilename?: string
  ) {}

  // Annotates the Prometheus data metrics with countries. This restarts the
  // server if needed.
  get isCountryMetricsEnabled(): boolean {
    return this.isCountryMetricsEnabled_;
  }

  set isCountryMetricsEnabled(enable: boolean) {
    if (enable && !this.ipCountryFilename) {
      throw new Error('Cannot enable country metrics: no country database filename set');
    }
    const valueChanged = this.isAsnMetricsEnabled_ != enable;
    this.isCountryMetricsEnabled_ = enable;
    if (valueChanged && this.ssProcess) {
      this.ssProcess.kill('SIGTERM');
    }
  }

  // Annotates the Prometheus data metrics with autonomous system numbers (ASN).
  // This restarts the server if needed.
  get isAsnMetricsEnabled(): boolean {
    return this.isAsnMetricsEnabled_;
  }

  set isAsnMetricsEnabled(enable: boolean) {
    if (enable && !this.ipAsnFilename) {
      throw new Error('Cannot enable ASN metrics: no ASN database filename set');
    }
    const valueChanged = this.isAsnMetricsEnabled_ != enable;
    this.isAsnMetricsEnabled_ = enable;
    if (valueChanged && this.ssProcess) {
      this.ssProcess.kill('SIGTERM');
    }
  }

  enableReplayProtection(): OutlineShadowsocksServer {
    this.isReplayProtectionEnabled = true;
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
          logging.error(
            `Cipher ${key.cipher} for access key ${key.id} is not supported: use an AEAD cipher instead.`
          );
          continue;
        }

        keysJson.keys.push(key);
      }

      mkdirp.sync(path.dirname(this.configFilename));

      try {
        file.atomicWriteFileSync(this.configFilename, jsyaml.safeDump(keysJson, {sortKeys: true}));
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  private start() {
    const commandArguments = ['-config', this.configFilename, '-metrics', this.metricsLocation];
    if (this.isCountryMetricsEnabled_ && this.ipCountryFilename) {
      commandArguments.push('-ip_country_db', this.ipCountryFilename);
    }
    if (this.isAsnMetricsEnabled_ && this.ipAsnFilename) {
      commandArguments.push('-ip_asn_db', this.ipAsnFilename);
    }
    if (this.verbose) {
      commandArguments.push('-verbose');
    }
    if (this.isReplayProtectionEnabled) {
      commandArguments.push('--replay_history=10000');
    }
    logging.info('======== Starting Outline Shadowsocks Service ========');
    logging.info(`${this.binaryFilename} ${commandArguments.map((a) => `"${a}"`).join(' ')}`);
    this.ssProcess = child_process.spawn(this.binaryFilename, commandArguments);
    this.ssProcess.on('error', (error) => {
      logging.error(`Error spawning outline-ss-server: ${error}`);
    });
    this.ssProcess.on('exit', (code, signal) => {
      logging.info(`outline-ss-server has exited with error. Code: ${code}, Signal: ${signal}`);
      logging.info('Restarting');
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
