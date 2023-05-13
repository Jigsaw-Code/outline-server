// Copyright 2020 The Outline Authors
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
// Import the required modules.

import {BigQuery} from '@google-cloud/bigquery';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Import the connection and feature metrics modules.
import * as connections from './connection_metrics';
import * as features from './feature_metrics';

// Define a configuration interface.
interface Config {
  datasetName: string;
  connectionMetricsTableName: string;
  featureMetricsTableName: string;
}

// Load the configuration file.
function loadConfig(): Config {
  const configText = fs.readFileSync(path.join(__dirname, 'config.json'), {encoding: 'utf8'});
  return JSON.parse(configText);
}

// Define the port number.
const PORT = Number(process.env.PORT) || 8080;

// Load the configuration.
const config = loadConfig();

// Create a BigQuery client.
const bigquery = new BigQuery({projectId: 'uproxysite'});

// Create a dataset.
const dataset = bigquery.dataset(config.datasetName);

// Create connection and feature metrics tables.
const connectionsTable = dataset.table(config.connectionMetricsTableName);
const featuresTable = dataset.table(config.featureMetricsTableName);

// Create an Express app.
const app = express();

// Parse the request body for content-type 'application/json'.
app.use(express.json());

// Accepts hourly connection metrics and inserts them into BigQuery.
// Request body should contain an HourlyServerMetricsReport.
app.post('/connections', async (req: express.Request, res: express.Response<string>) => {
  // Validate the request body.
  if (!connections.isValidConnectionMetricsReport(req.body)) {
    res.status(400).send('Invalid request');
    return;
  }

  // Insert the metrics into BigQuery.
  await connections.postConnectionMetrics(connectionsTable, req.body);

  // Send a success response.
  res.status(200).send('OK');
});

// Accepts daily feature metrics and inserts them into BigQuery.
// Request body should contain a `DailyFeatureMetricsReport`.
app.post('/features', async (req: express.Request, res: express.Response<string>) => {
  // Validate the request body.
  if (!features.isValidFeatureMetricsReport(req.body)) {
    res.status(400).send('Invalid request');
    return;
  }

  // Insert the metrics into BigQuery.
  await features.postFeatureMetrics(featuresTable, req.body);

  // Send a success response.
  res.status(200).send('OK');
});

// Listen on the specified port.
app.listen(PORT, () => {
  console.log(`Metrics server listening on port ${PORT}`);
});
