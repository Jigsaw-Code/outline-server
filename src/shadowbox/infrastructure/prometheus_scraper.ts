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

export async function startPrometheus(
    prometheusConfigFilename: string, prometheusEndpoint: string,
    prometheusTsdbFilename: string, prometheusLocation: string,
    configJson: {}, verbose: boolean) {
  await writePrometheusConfigToDisk(prometheusConfigFilename, configJson);
  const processArgs = [
    '--config.file', prometheusConfigFilename, '--storage.tsdb.retention', '31d',
    '--storage.tsdb.path', prometheusTsdbFilename, '--web.listen-address',
    prometheusLocation, '--log.level', verbose ? 'debug' : 'info'
  ];
  await spawnPrometheusSubprocess(processArgs, prometheusEndpoint);
}

async function writePrometheusConfigToDisk(configFilename: string, configJson: {}) {
  await mkdirp.sync(path.dirname(configFilename));
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
}

async function spawnPrometheusSubprocess(
    processArgs: string[], prometheusEndpoint: string): Promise<child_process.ChildProcess> {
  logging.info('Starting Prometheus...');
  const runProcess = child_process.spawn('/root/shadowbox/bin/prometheus', processArgs);
  runProcess.on('error', (error) => {
    logging.error(`Error spawning Prometheus: ${error}`);
  });
  runProcess.on('exit', (code, signal) => {
    logging.info(`Prometheus has exited with error. Code: ${code}, Signal: ${signal}`);
    logging.info('Restarting Prometheus...');
    spawnPrometheusSubprocess(processArgs, prometheusEndpoint);
  });
  // TODO(fortuna): Consider saving the output and expose it through the manager service.
  runProcess.stdout.pipe(process.stdout);
  runProcess.stderr.pipe(process.stderr);
  await waitForPrometheusReady(`${prometheusEndpoint}/api/v1/status/flags`);
  return runProcess;
}

async function waitForPrometheusReady(prometheusEndpoint: string) {
  logging.info('Waiting for Prometheus to be ready...');
  while (!(await isHttpEndpointHealthy(prometheusEndpoint))) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  logging.info('Prometheus is ready!');
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
