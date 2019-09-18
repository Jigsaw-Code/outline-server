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
import * as http from 'http';
import * as jsyaml from 'js-yaml';
import * as mkdirp from 'mkdirp';
import * as path from 'path';

import * as logging from '../infrastructure/logging';

export interface QueryResultData {
  resultType: 'matrix'|'vector'|'scalar'|'string';
  result: Array < {
    metric: {[labelValue: string]: string};
    value: [number, string];
  }
  > ;
}

// From https://prometheus.io/docs/prometheus/latest/querying/api/
interface QueryResult {
  status: 'success'|'error';
  data: QueryResultData;
  errorType: string;
  error: string;
}

export class PrometheusClient {
  constructor(private address: string) {}

  query(query: string): Promise<QueryResultData> {
    return new Promise<QueryResultData>((fulfill, reject) => {
      const url = `${this.address}/api/v1/query?query=${encodeURIComponent(query)}`;
      http.get(url, (response) => {
            if (response.statusCode < 200 || response.statusCode > 299) {
              reject(new Error(`Got error ${response.statusCode}`));
              response.resume();
              return;
            }
            let body = '';
            response.on('data', (data) => {
              body += data;
            });
            response.on('end', () => {
              const result = JSON.parse(body) as QueryResult;
              if (result.status !== 'success') {
                return reject(new Error(`Error ${result.errorType}: ${result.error}`));
              }
              fulfill(result.data);
            });
          }).on('error', (e) => {
        reject(new Error(`Failed to query prometheus API: ${e}`));
      });
    });
  }
}

export async function runPrometheusScraper(
    args: string[], configFilename: string, configJson: {},
    prometheusEndpoint: string): Promise<child_process.ChildProcess> {
  mkdirp.sync(path.dirname(configFilename));
  const ymlTxt = jsyaml.safeDump(configJson, {'sortKeys': true});
  // Write the file asynchronously to prevent blocking the node thread.
  await new Promise((resolve, reject) => {
    fs.writeFile(configFilename, ymlTxt, 'utf-8', (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
  const commandArguments = ['--config.file', configFilename];
  commandArguments.push(...args);
  const runProcess = child_process.spawn('/root/shadowbox/bin/prometheus', commandArguments);
  runProcess.on('error', (error) => {
    logging.error(`Error spawning prometheus: ${error}`);
  });
  // TODO(fortuna): Add restart logic.
  runProcess.on('exit', (code, signal) => {
    logging.info(`prometheus has exited with error. Code: ${code}, Signal: ${signal}`);
  });
  // TODO(fortuna): Consider saving the output and expose it through the manager service.
  runProcess.stdout.pipe(process.stdout);
  runProcess.stderr.pipe(process.stderr);
  await waitForPrometheusReady(`${prometheusEndpoint}/api/v1/status/flags`);
  return runProcess;
}

async function waitForPrometheusReady(prometheusEndpoint: string) {
  logging.debug('Waiting for Prometheus to be ready...');
  while (!(await isHttpEndpointHealthy(prometheusEndpoint))) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  logging.debug('Prometheus is ready');
}

function isHttpEndpointHealthy(endpoint: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    http.get(endpoint, (response) => {
          resolve(response.statusCode >= 200 && response.statusCode < 300);
        }).on('error', (e) => {
      // Prometheus is not ready yet.
      resolve(false);
    });
  });
}
