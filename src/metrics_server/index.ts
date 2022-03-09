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

import {BigQuery} from '@google-cloud/bigquery';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

import * as connections from './connection_metrics';
import * as features from './feature_metrics';

interface Config {
  datasetName: string;
  connectionMetricsTableName: string;
  featureMetricsTableName: string;
}

function loadConfig(): Config {
  const configText = fs.readFileSync(path.join(__dirname, 'config.json'), {encoding: 'utf8'});
  return JSON.parse(configText);
}

const PORT = Number(process.env.PORT) || 8080;
const config = loadConfig();

const bigqueryDataset = new BigQuery({projectId: 'uproxysite'}).dataset(config.datasetName);
const connectionsTable = new connections.BigQueryConnectionsTable(
  bigqueryDataset.table(config.connectionMetricsTableName)
);
const featuresTable = new features.BigQueryFeaturesTable(
  bigqueryDataset.table(config.featureMetricsTableName)
);

const app = express();
// Parse the request body for content-type 'application/json'.
app.use(express.json());

// Accepts hourly connection metrics and inserts them into BigQuery.
// Request body should contain an HourlyServerMetricsReport.
app.post('/connections', async (req: express.Request, res: express.Response<string>) => {
  try {
    if (!connections.isValidConnectionMetricsReport(req.body)) {
      res.status(400).send('Invalid request');
      return;
    }
    await connections.postConnectionMetrics(connectionsTable, req.body);
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send(`Error: ${err}`);
  }
});

// Accepts daily feature metrics and inserts them into BigQuery.
// Request body should contain a `DailyFeatureMetricsReport`.
app.post('/features', async (req: express.Request, res: express.Response<string>) => {
  try {
    if (!features.isValidFeatureMetricsReport(req.body)) {
      res.status(400).send('Invalid request');
      return;
    }
    await features.postFeatureMetrics(featuresTable, req.body);
    res.status(200).send('OK');
  } catch (err) {
    res.status(500).send(`Error: ${err}`);
  }
});

app.listen(PORT, () => {
  console.log(`Metrics server listening on port ${PORT}`);
});
