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

import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as restify from 'restify';

import {FilesystemTextFile} from '../infrastructure/filesystem_text_file';
import * as ip_location from '../infrastructure/ip_location';
import * as json_config from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';

import {LibevShadowsocksServer} from './libev_shadowsocks_server';
import {ManagerStats, ManagerStatsJson} from './manager_metrics';
import {bindService, ShadowsocksManagerService} from './manager_service';
import {createServerAccessKeyRepository} from './server_access_key';
import * as server_config from './server_config';
import {SharedStats, SharedStatsJson} from './shared_metrics';

const DEFAULT_STATE_DIR = '/root/shadowbox/persisted-state';
const MAX_STATS_FILE_AGE_MS = 5000;

interface PersistentStatsJson {
  // Serialized ManagerStats object.
  transferStats?: ManagerStatsJson;
  // Serialized SharedStats object.
  hourlyMetrics?: SharedStatsJson;
}

function main() {
  const verbose = process.env.LOG_LEVEL === 'debug';
  const proxyHostname = process.env.SB_PUBLIC_IP;
  // Default to production metrics, as some old Docker images may not have
  // SB_METRICS_URL properly set.
  const metricsUrl = process.env.SB_METRICS_URL || 'https://metrics-prod.uproxy.org';
  if (!process.env.SB_METRICS_URL) {
    logging.warn('process.env.SB_METRICS_URL not set, using default');
  }

  if (!proxyHostname) {
    logging.error('Need to specify SB_PUBLIC_IP for invite links');
    process.exit(1);
  }

  logging.debug(`=== Config ===`);
  logging.debug(`SB_PUBLIC_IP: ${proxyHostname}`);
  logging.debug(`SB_METRICS_URL: ${metricsUrl}`);
  logging.debug(`==============`);

  const DEFAULT_PORT = 8081;
  const portNumber = Number(process.env.SB_API_PORT || DEFAULT_PORT);
  if (isNaN(portNumber)) {
    logging.error(`Invalid SB_API_PORT: ${process.env.SB_API_PORT}`);
    process.exit(1);
  }

  const serverConfig =
      server_config.readServerConfig(getPersistentFilename('shadowbox_server_config.json'));

  const shadowsocksServer = new LibevShadowsocksServer(proxyHostname, verbose);

  const statsConfig = new json_config.DelayedConfig(
      json_config.loadFileConfig<PersistentStatsJson>(
          getPersistentFilename('shadowbox_stats.json')),
      MAX_STATS_FILE_AGE_MS);
  const managerMetrics =
      new ManagerStats(new json_config.ChildConfig(statsConfig, statsConfig.data().transferStats));
  const sharedMetrics = new SharedStats(
      new json_config.ChildConfig(statsConfig, statsConfig.data().hourlyMetrics), serverConfig,
      metricsUrl, new ip_location.MmdbLocationService());

  logging.info('Starting...');
  const userConfigFilename = getPersistentFilename('shadowbox_config.json');
  createServerAccessKeyRepository(
      proxyHostname, new FilesystemTextFile(userConfigFilename), shadowsocksServer, managerMetrics,
      sharedMetrics)
      .then((accessKeyRepository) => {
        const managerService = new ShadowsocksManagerService(
            process.env.SB_DEFAULT_SERVER_NAME || 'Outline Server', serverConfig,
            accessKeyRepository, managerMetrics);
        const certificateFilename = process.env.SB_CERTIFICATE_FILE;
        const privateKeyFilename = process.env.SB_PRIVATE_KEY_FILE;

        // TODO(bemasc): Remove casts once
        // https://github.com/DefinitelyTyped/DefinitelyTyped/pull/15229 lands
        const apiServer = restify.createServer({
          certificate: fs.readFileSync(certificateFilename),
          key: fs.readFileSync(privateKeyFilename)
        });

        // Pre-routing handlers
        apiServer.pre(restify.CORS());

        // All routes handlers
        const apiPrefix = process.env.SB_API_PREFIX ? `/${process.env.SB_API_PREFIX}` : '';
        apiServer.pre(restify.pre.sanitizePath());
        apiServer.use(restify.jsonp());
        apiServer.use(restify.bodyParser());
        bindService(apiServer, apiPrefix, managerService);

        apiServer.listen(portNumber, () => {
          logging.info(`Manager listening at ${apiServer.url}${apiPrefix}`);
        });
      });
}

function getPersistentFilename(file: string): string {
  const stateDir = process.env.SB_STATE_DIR || DEFAULT_STATE_DIR;
  return path.join(stateDir, file);
}

process.on('unhandledRejection', (error) => {
  logging.error(`unhandledRejection: ${error}`);
});

main();
