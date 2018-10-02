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

import {RealClock} from '../infrastructure/clock';
import {FilesystemTextFile} from '../infrastructure/filesystem_text_file';
import * as ip_location from '../infrastructure/ip_location';
import * as json_config from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {AccessKeyId} from '../model/access_key';

import {ManagerMetrics, ManagerMetricsJson} from './manager_metrics';
import {bindService, ShadowsocksManagerService} from './manager_service';
import {AccessKeyConfigJson, createServerAccessKeyRepository} from './server_access_key';
import * as server_config from './server_config';
import {InMemoryUsageMetrics, OutlineSharedMetricsPublisher, RestMetricsCollectorClient, SharedMetricsPublisher, UsageMetricsWriter} from './shared_metrics';

const DEFAULT_STATE_DIR = '/root/shadowbox/persisted-state';
const MAX_STATS_FILE_AGE_MS = 5000;

// Serialized format for the metrics file.
// WARNING: Renaming fields will break backwards-compatibility.
interface MetricsConfigJson {
  // Serialized ManagerStats object.
  transferStats?: ManagerMetricsJson;
  // DEPRECATED: hourlyMetrics. Hourly stats live in memory only now.
}

function readMetricsConfig(filename: string): json_config.JsonConfig<MetricsConfigJson> {
  try {
    const metricsConfig = json_config.loadFileConfig<MetricsConfigJson>(filename);
    // Make sure we have non-empty sub-configs.
    metricsConfig.data().transferStats =
        metricsConfig.data().transferStats || {} as ManagerMetricsJson;
    return new json_config.DelayedConfig(metricsConfig, MAX_STATS_FILE_AGE_MS);
  } catch (error) {
    throw new Error(`Failed to read metrics config at ${filename}: ${error}`);
  }
}

class MultiMetricsWriter implements UsageMetricsWriter {
  constructor(private managerMetrics: ManagerMetrics, private sharedMetrics: UsageMetricsWriter) {}

  writeBytesTransferred(accessKeyId: AccessKeyId, numBytes: number, countries: string[]) {
    this.managerMetrics.writeBytesTransferred(accessKeyId, numBytes);
    this.sharedMetrics.writeBytesTransferred(accessKeyId, numBytes, countries);
  }
}

async function main() {
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
  const metricsConfig = readMetricsConfig(getPersistentFilename('shadowbox_stats.json'));
  const managerMetrics = new ManagerMetrics(
      new RealClock(),
      new json_config.ChildConfig(metricsConfig, metricsConfig.data().transferStats));

  logging.info('Starting...');
  const accessKeyConfig = json_config.loadFileConfig<AccessKeyConfigJson>(
      getPersistentFilename('shadowbox_config.json'));
  const ipLocation =
      new ip_location.MmdbLocationService('/var/lib/libmaxminddb/GeoLite2-Country.mmdb');
  const usageMetrics = new InMemoryUsageMetrics();
  const metricsWriter = new MultiMetricsWriter(managerMetrics, usageMetrics);
  const accessKeyRepository = await createServerAccessKeyRepository(
      proxyHostname, accessKeyConfig, ipLocation, metricsWriter, verbose);

  const toMetricsId = (id: AccessKeyId) => {
    return accessKeyRepository.getMetricsId(id);
  };
  const metricsCollector = new RestMetricsCollectorClient(metricsUrl);
  const metricsPublisher: SharedMetricsPublisher = new OutlineSharedMetricsPublisher(
      new RealClock(), serverConfig, usageMetrics, toMetricsId, metricsCollector);
  const managerService = new ShadowsocksManagerService(
      process.env.SB_DEFAULT_SERVER_NAME || 'Outline Server', serverConfig, accessKeyRepository,
      managerMetrics, metricsPublisher);

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
}

function getPersistentFilename(file: string): string {
  const stateDir = process.env.SB_STATE_DIR || DEFAULT_STATE_DIR;
  return path.join(stateDir, file);
}

process.on('unhandledRejection', (error: Error) => {
  logging.error(`unhandledRejection: ${error.stack}`);
});

main().catch((error) => {
  logging.error(error.stack);
  process.exit(1);
});
