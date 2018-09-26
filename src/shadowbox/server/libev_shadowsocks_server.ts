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
import * as dgram from 'dgram';
import * as dns from 'dns';
import * as events from 'events';
import {makeConfig, SIP002_URI} from 'ShadowsocksConfig/shadowsocks_config';

import {IpLocationService} from '../infrastructure/ip_location';
import * as logging from '../infrastructure/logging';
import {ShadowsocksInstance, ShadowsocksServer} from '../model/shadowsocks_server';

import {UsageMetricsRecorder} from './shared_metrics';

// Runs shadowsocks-libev server instances.
export class LibevShadowsocksServer implements ShadowsocksServer {
  private portId = new Map<number, string>();
  private portInboundBytes = new Map<number, number>();

  constructor(
      private publicAddress: string, private metricsSocket: dgram.Socket,
      ipLocation: IpLocationService, usageRecorder: UsageMetricsRecorder,
      private verbose: boolean) {
    metricsSocket.on('message', (buf: Buffer) => {
      let metricsMessage;
      try {
        metricsMessage = parseMetricsMessage(buf);
      } catch (err) {
        logging.error(`Error parsing metrics message ${buf}: ${err.stack}`);
        return;
      }
      let previousTotalInboundBytes = this.portInboundBytes[metricsMessage.portNumber] || 0;
      if (previousTotalInboundBytes > metricsMessage.totalInboundBytes) {
        // totalInboundBytes is a counter that monotonically increases. A drop means
        // ss-server got restarted, so we set the previous value to zero.
        previousTotalInboundBytes = 0;
      }
      const dataDelta = metricsMessage.totalInboundBytes - previousTotalInboundBytes;
      if (dataDelta === 0) {
        return;
      }
      this.portInboundBytes[metricsMessage.portNumber] = metricsMessage.totalInboundBytes;
      getConnectedClientIPAddresses(metricsMessage.portNumber)
          .then((ipAddresses: string[]) => {
            return Promise.all(ipAddresses.map((ipAddress) => {
              return ipLocation.countryForIp(ipAddress);
            }));
          })
          .then((countries: string[]) => {
            usageRecorder.recordBytesTransferred(
                this.portId[metricsMessage.portNumber] || '', dataDelta, countries);
          })
          .catch((err: Error) => {
            logging.error(`Unable to get client IP addresses: ${err.stack}`);
          });
    });
  }

  public startInstance(id: string, portNumber: number, password: string, encryptionMethod):
      Promise<ShadowsocksInstance> {
    logging.info(`Starting server on port ${portNumber}`);
    this.portId[portNumber] = id;

    const metricsAddress = this.metricsSocket.address();
    const commandArguments = [
      '-m', encryptionMethod,  // Encryption method
      '-u',                    // Allow UDP
      '--fast-open',           // Allow TCP fast open
      '-p', portNumber.toString(), '-k', password, '--manager-address',
      `${metricsAddress.address}:${metricsAddress.port}`
    ];
    logging.info('starting ss-server with args: ' + commandArguments.join(' '));
    // Add the system DNS servers.
    // TODO(fortuna): Add dns.getServers to @types/node.
    for (const dnsServer of dns.getServers()) {
      commandArguments.push('-d');
      commandArguments.push(dnsServer);
    }
    if (this.verbose) {
      // Make the Shadowsocks output verbose in debug mode.
      commandArguments.push('-v');
    }
    const childProcess = child_process.spawn('ss-server', commandArguments);

    childProcess.on('error', (error) => {
      logging.error(`Error spawning server on port ${portNumber}: ${error}`);
    });
    // TODO(fortuna): Add restart logic.
    childProcess.on('exit', (code, signal) => {
      logging.info(`Server on port ${portNumber} has exited. Code: ${code}, Signal: ${signal}`);
    });
    // TODO(fortuna): Disable this for production.
    // TODO(fortuna): Consider saving the output and expose it through the manager service.
    childProcess.stdout.pipe(process.stdout);
    childProcess.stderr.pipe(process.stderr);

    // Generate a SIP002 access url.
    const accessUrl = SIP002_URI.stringify(makeConfig({
      host: this.publicAddress,
      port: portNumber,
      method: encryptionMethod,
      password,
      outline: 1,
    }));

    return Promise.resolve(new LibevShadowsocksServerInstance(
        childProcess, portNumber, password, encryptionMethod, accessUrl));
  }
}

class LibevShadowsocksServerInstance implements ShadowsocksInstance {
  constructor(
      private childProcess: child_process.ChildProcess, public portNumber: number, public password,
      public encryptionMethod: string, public accessUrl: string) {}

  public stop() {
    logging.info(`Stopping server on port ${this.portNumber}`);
    this.childProcess.kill();
  }
}

function getConnectedClientIPAddresses(portNumber: number): Promise<string[]> {
  const lsofCommand = `lsof -i tcp:${portNumber} -n -P -Fn ` +
      ' | grep \'\\->\'' +         // only look at connection lines (e.g. skips "p8855" and "f60")
      ' | sed \'s/:\\d*$//g\'' +   // remove p
      ' | sed \'s/n\\S*->//g\'' +  // remove first part of address
      ' | sed \'s/\\[//g\'' +      // remove [] (used by ipv6)
      ' | sed \'s/\\]//g\'' +      // remove ] (used by ipv6)
      ' | sort | uniq';            // remove duplicates
  return execCmd(lsofCommand).then((output: string) => {
    return output.split('\n');
  });
}

function execCmd(cmd: string): Promise<string> {
  return new Promise((fulfill, reject) => {
    child_process.exec(cmd, (error: child_process.ExecError, stdout: string, stderr: string) => {
      if (error) {
        reject(error);
      } else {
        fulfill(stdout.trim());
      }
    });
  });
}

interface MetricsMessage {
  portNumber: number;
  totalInboundBytes: number;
}

function parseMetricsMessage(buf): MetricsMessage {
  const jsonString = buf.toString()
                         .substr('stat: '.length)  // remove leading "stat: "
                         .replace(/\0/g, '');      // remove trailing null terminator
  // statObj is in the form {"port#": totalInboundBytes}, where
  // there is always only 1 port# per JSON object. If there are multiple
  // ss-servers communicating to the same manager, we will get multiple
  // message events.
  const statObj = JSON.parse(jsonString);
  // Object.keys is used here because node doesn't support Object.values.
  const portNumber = parseInt(Object.keys(statObj)[0], 10);
  const totalInboundBytes = statObj[portNumber];
  return {portNumber, totalInboundBytes};
}
