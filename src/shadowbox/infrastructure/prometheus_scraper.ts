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

/**
 * Represents a Unix timestamp in seconds.
 * @typedef {number} Timestamp
 */
type Timestamp = number;

/**
 * Represents a Prometheus metric's labels.
 * Each key in the object is a label name, and the corresponding value is the label's value.
 *
 * @typedef {Object<string, string>} PrometheusMetric
 */
export type PrometheusMetric = {[labelValue: string]: string};

/**
 * Represents a Prometheus value, which is a tuple of a timestamp and a string value.
 * @typedef {[Timestamp, string]} PrometheusValue
 */
export type PrometheusValue = [Timestamp, string];

/**
 * Represents a Prometheus result, which can be a time series (values) or a single value.
 * @typedef {Object} PrometheusResult
 * @property {Object.<string, string>} metric - Labels associated with the metric.
 * @property {Array<PrometheusValue>} [values] - Time series data (for range queries).
 * @property {PrometheusValue} [value] - Single value (for instant queries).
 */
export type PrometheusResult = {
  metric: PrometheusMetric;
  values?: PrometheusValue[];
  value?: PrometheusValue;
};

/**
 * Represents the data part of a Prometheus query result.
 * @interface QueryResultData
 */
export interface QueryResultData {
  resultType: 'matrix' | 'vector' | 'scalar' | 'string';
  result: PrometheusResult[];
}

/**
 * Represents the full JSON response from a Prometheus query.  This interface
 * is based on the Prometheus API documentation:
 * https://prometheus.io/docs/prometheus/latest/querying/api/
 * @interface QueryResult
 */
interface QueryResult {
  status: 'success' | 'error';
  data: QueryResultData;
  errorType: string;
  error: string;
}

/**
 * Interface for a Prometheus client.
 * @interface PrometheusClient
 */
export interface PrometheusClient {
  /**
   * Performs an instant query against the Prometheus API.
   * @function query
   * @param {string} query - The PromQL query string.
   * @returns {Promise<QueryResultData>} A Promise that resolves to the query result data.
   */
  query(query: string): Promise<QueryResultData>;

  /**
   * Performs a range query against the Prometheus API.
   * @function queryRange
   * @param {string} query - The PromQL query string.
   * @param {Date} start - The start time for the query range.
   * @param {Date} end - The end time for the query range.
   * @param {string} step - The step size for the query range (e.g., "1m", "5m").  This controls the resolution of the returned data.
   * @returns {Promise<QueryResultData>} A Promise that resolves to the query result data.
   */
  queryRange(query: string, start: Date, end: Date, step: string): Promise<QueryResultData>;
}

export class ApiPrometheusClient implements PrometheusClient {
  constructor(private address: string) {}

  query(query: string): Promise<QueryResultData> {
    return new Promise<QueryResultData>((fulfill, reject) => {
      const url = `${this.address}/api/v1/query?query=${encodeURIComponent(query)}`;
      http
        .get(url, (response) => {
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
        })
        .on('error', (e) => {
          reject(new Error(`Failed to query prometheus API: ${e}`));
        });
    });
  }

  queryRange(query: string, start: Date, end: Date, step: string): Promise<QueryResultData> {
    return new Promise<QueryResultData>((fulfill, reject) => {
      const url = `${this.address}/api/v1/query_range?query=${encodeURIComponent(
        query
      )}&start=${start.toISOString()}&end=${end.toISOString()}&step=${step}`;
      http
        .get(url, (response) => {
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
              console.log(result);
              return reject(new Error(`Error ${result.errorType}: ${result.error}`));
            }
            fulfill(result.data);
          });
        })
        .on('error', (e) => {
          reject(new Error(`Failed to query prometheus API: ${e}`));
        });
    });
  }
}

export async function startPrometheus(
  binaryFilename: string,
  configFilename: string,
  configJson: {},
  processArgs: string[],
  endpoint: string
) {
  await writePrometheusConfigToDisk(configFilename, configJson);
  await spawnPrometheusSubprocess(binaryFilename, processArgs, endpoint);
}

async function writePrometheusConfigToDisk(configFilename: string, configJson: {}) {
  await mkdirp.sync(path.dirname(configFilename));
  const ymlTxt = jsyaml.safeDump(configJson, {sortKeys: true});
  // Write the file asynchronously to prevent blocking the node thread.
  await new Promise<void>((resolve, reject) => {
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
  binaryFilename: string,
  processArgs: string[],
  prometheusEndpoint: string
): Promise<child_process.ChildProcess> {
  logging.info('======== Starting Prometheus ========');
  logging.info(`${binaryFilename} ${processArgs.map((a) => `"${a}"`).join(' ')}`);
  const runProcess = child_process.spawn(binaryFilename, processArgs);
  runProcess.on('error', (error) => {
    logging.error(`Error spawning Prometheus: ${error}`);
  });
  runProcess.on('exit', (code, signal) => {
    logging.error(`Prometheus has exited with error. Code: ${code}, Signal: ${signal}`);
    logging.error('Restarting Prometheus...');
    spawnPrometheusSubprocess(binaryFilename, processArgs, prometheusEndpoint);
  });
  // TODO(fortuna): Consider saving the output and expose it through the manager service.
  runProcess.stdout.pipe(process.stdout);
  runProcess.stderr.pipe(process.stderr);
  await waitForPrometheusReady(`${prometheusEndpoint}/api/v1/status/flags`);
  logging.info('Prometheus is ready!');
  return runProcess;
}

async function waitForPrometheusReady(prometheusEndpoint: string) {
  while (!(await isHttpEndpointHealthy(prometheusEndpoint))) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function isHttpEndpointHealthy(endpoint: string): Promise<boolean> {
  return new Promise((resolve, _) => {
    http
      .get(endpoint, (response) => {
        resolve(response.statusCode >= 200 && response.statusCode < 300);
      })
      .on('error', () => {
        // Prometheus is not ready yet.
        resolve(false);
      });
  });
}
