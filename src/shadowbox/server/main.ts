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
import * as logging from '../infrastructure/logging';

import {LibevShadowsocksServer} from './libev_shadowsocks_server';
import {createManagedAccessKeyRepository} from './managed_user';
import {ShadowsocksManagerService} from './manager_service';
import * as metrics from './metrics';
import * as server_config from './server_config';

const DEFAULT_STATE_DIR = '/root/shadowbox/persisted-state';

function main() {
  const verbose = process.env.LOG_LEVEL === 'debug';
  const publicAddress = process.env.SB_PUBLIC_IP;
  // Default to production metrics, as some old Docker images may not have
  // SB_METRICS_URL properly set.
  const metricsUrl = process.env.SB_METRICS_URL || 'https://metrics-prod.uproxy.org';
  if (!process.env.SB_METRICS_URL) {
    logging.warn('process.env.SB_METRICS_URL not set, using default');
  }

  if (!publicAddress) {
    logging.error('Need to specify SB_PUBLIC_IP for invite links');
    process.exit(1);
  }

  logging.debug(`=== Config ===`);
  logging.debug(`SB_PUBLIC_IP: ${publicAddress}`);
  logging.debug(`SB_METRICS_URL: ${metricsUrl}`);
  logging.debug(`==============`);

  const DEFAULT_PORT = 8081;
  const portNumber = Number(process.env.SB_API_PORT || DEFAULT_PORT);
  if (isNaN(portNumber)) {
    logging.error(`Invalid SB_API_PORT: ${process.env.SB_API_PORT}`);
    process.exit(1);
  }

  const serverConfigFilename = getPersistentFilename('shadowbox_server_config.json');
  const serverConfig = new server_config.ServerConfig(serverConfigFilename, process.env.SB_DEFAULT_SERVER_NAME);

  const shadowsocksServer = new LibevShadowsocksServer(publicAddress, verbose);

  const statsFilename = getPersistentFilename('shadowbox_stats.json');
  const stats = new metrics.PersistentStats(statsFilename);
  const ipLocationService = new ip_location.MmdbLocationService();
  stats.onLastHourMetricsReady((startDatetime, endDatetime, lastHourUserStats) => {
    if (serverConfig.getMetricsEnabled()) {
      metrics
          .getHourlyServerMetricsReport(
              serverConfig.serverId, startDatetime, endDatetime, lastHourUserStats,
              ipLocationService)
          .then((report) => {
            if (report) {
              metrics.postHourlyServerMetricsReports(report, metricsUrl);
            }
          });
    }
  });

  logging.info('Starting...');
  const userConfigFilename = getPersistentFilename('shadowbox_config.json');
  createManagedAccessKeyRepository(
      new FilesystemTextFile(userConfigFilename),
      shadowsocksServer,
      stats).then((managedAccessKeyRepository) => {
    const managerService = new ShadowsocksManagerService(managedAccessKeyRepository);
    const certificateFilename = process.env.SB_CERTIFICATE_FILE;
    const privateKeyFilename = process.env.SB_PRIVATE_KEY_FILE;

    // TODO(bemasc): Remove casts once https://github.com/DefinitelyTyped/DefinitelyTyped/pull/15229 lands
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
    setApiHandlers(apiServer, apiPrefix, managerService, stats, serverConfig);

    // TODO(fortuna): Bind to localhost or unix socket to avoid external access.
    apiServer.listen(portNumber, () => {
      logging.info(`Manager listening at ${apiServer.url}${apiPrefix}`);
    });
  });
}

function setApiHandlers(
    apiServer: restify.Server,
    apiPrefix: string,
    managerService: ShadowsocksManagerService,
    stats: metrics.PersistentStats,
    serverConfig: server_config.ServerConfig) {
  // Access key service handlers
  apiServer.post(`${apiPrefix}/access-keys`, managerService.createNewAccessKey.bind(managerService));
  apiServer.get(`${apiPrefix}/access-keys`, managerService.listAccessKeys.bind(managerService));
  apiServer.del(`${apiPrefix}/access-keys/:id`, managerService.removeAccessKey.bind(managerService));
  apiServer.put(`${apiPrefix}/access-keys/:id/name`, managerService.renameAccessKey.bind(managerService));

  // Metrics handlers.
  apiServer.get(`${apiPrefix}/metrics/transfer`, (req, res, next) => {
    res.send(stats.get30DayByteTransfer());
    next();
  });
  apiServer.get(`${apiPrefix}/metrics/enabled`, (req, res, next) => {
    res.send({metricsEnabled: serverConfig.getMetricsEnabled()});
    next();
  });
  apiServer.put(`${apiPrefix}/metrics/enabled`, (req, res, next) => {
    if (typeof req.params.metricsEnabled === 'boolean') {
      serverConfig.setMetricsEnabled(req.params.metricsEnabled);
      res.send(204);
    } else {
      res.send(400);
    }
    next();
  });

  // Rename handler.
  apiServer.put(`${apiPrefix}/name`, (req, res, next) => {
    const name = req.params.name;
    if (typeof name !== 'string' || name.length > 100) {
      res.send(400);
      next();
      return;
    }
    serverConfig.setName(name);
    res.send(204);
    next();
  });

  apiServer.get(`${apiPrefix}/server`, (req, res, next) => {
    res.send({
      name: serverConfig.getName(),
      serverId: serverConfig.serverId,
      metricsEnabled: serverConfig.getMetricsEnabled(),
      createdTimestampMs: serverConfig.getCreatedTimestampMs()
    });
    next();
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
