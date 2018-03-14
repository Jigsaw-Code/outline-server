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

import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {HourlyServerMetricsReport, isValidServerReport, postServerReport} from './post_server_report';

// Accepts hourly connection metrics and inserts them into BigQuery.
// Request body should contain an HourlyServerMetricsReport.
exports.reportHourlyConnectionMetrics = (req: express.Request, res: express.Response) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }
  if (!isValidServerReport(req.body)) {
    res.status(400).send('Invalid request');
    return;
  }

  const serverReport: HourlyServerMetricsReport = {
    serverId: req.body.serverId,
    startUtcMs: req.body.startUtcMs,
    endUtcMs: req.body.endUtcMs,
    userReports: req.body.userReports
  };
  postServerReport(config.datasetName, config.tableName, serverReport).then(() => {
    res.status(200).send('OK');
  }).catch((err: Error) => {
    res.status(500).send('Error: ' + err);
  });
};

interface Config {
  datasetName: string;
  tableName: string;
}

function loadConfig(): Config {
  const configText = fs.readFileSync(path.join(__dirname, 'config.json'), {encoding: 'utf8'});
  return JSON.parse(configText);
}

const config = loadConfig();
