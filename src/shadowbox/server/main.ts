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
import * as http from 'http';
import * as path from 'path';
import * as process from 'process';
import * as prometheus from 'prom-client';
import * as restify from 'restify';

import {RealClock} from '../infrastructure/clock';
import {PortProvider} from '../infrastructure/get_port';
import * as ip_location from '../infrastructure/ip_location';
import * as json_config from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {PrometheusClient, runPrometheusScraper} from '../infrastructure/prometheus_scraper';
import {RolloutTracker} from '../infrastructure/rollout';
import {AccessKeyId} from '../model/access_key';

import {createLibevShadowsocksServer} from './libev_shadowsocks_server';
import {LegacyManagerMetrics, LegacyManagerMetricsJson, ManagerMetrics, PrometheusManagerMetrics} from './manager_metrics';
import {bindService, ShadowsocksManagerService} from './manager_service';
import {AccessKeyConfigJson, ServerAccessKeyRepository} from './server_access_key';
import * as server_config from './server_config';
import {createPrometheusUsageMetricsWriter, InMemoryUsageMetrics, OutlineSharedMetricsPublisher, PrometheusUsageMetrics, RestMetricsCollectorClient, SharedMetricsPublisher, UsageMetrics, UsageMetricsWriter} from './shared_metrics';

const DEFAULT_STATE_DIR = '/root/shadowbox/persisted-state';
const MAX_STATS_FILE_AGE_MS = 5000;

// Serialized format for the metrics file.
// WARNING: Renaming fields will break backwards-compatibility.
interface MetricsConfigJson {
  // Serialized ManagerStats object.
  transferStats?: LegacyManagerMetricsJson;
  // DEPRECATED: hourlyMetrics. Hourly stats live in memory only now.
}

function readMetricsConfig(filename: string): json_config.JsonConfig<MetricsConfigJson> {
  try {
    const metricsConfig = json_config.loadFileConfig<MetricsConfigJson>(filename);
    // Make sure we have non-empty sub-configs.
    metricsConfig.data().transferStats =
        metricsConfig.data().transferStats || {} as LegacyManagerMetricsJson;
    return new json_config.DelayedConfig(metricsConfig, MAX_STATS_FILE_AGE_MS);
  } catch (error) {
    throw new Error(`Failed to read metrics config at ${filename}: ${error}`);
  }
}

class MultiMetricsWriter implements UsageMetricsWriter {
  constructor(
      private managerMetrics: LegacyManagerMetrics, private sharedMetrics: UsageMetricsWriter) {}

  writeBytesTransferred(accessKeyId: AccessKeyId, numBytes: number, countries: string[]) {
    this.managerMetrics.writeBytesTransferred(accessKeyId, numBytes);
    this.sharedMetrics.writeBytesTransferred(accessKeyId, numBytes, countries);
  }
}

async function exportPrometheusMetrics(registry: prometheus.Registry): Promise<string> {
  const localMetricsServer = await new Promise<http.Server>((resolve, _) => {
    const server = http.createServer((_, res) => {
      res.write(registry.metrics());
      res.end();
    });
    server.on('listening', () => {
      resolve(server);
    });
    server.listen({port: 0, host: 'localhost', exclusive: true});
  });
  return `localhost:${localMetricsServer.address().port}`;
}

function reserveAccessKeyPorts(
    keyConfig: json_config.JsonConfig<AccessKeyConfigJson>, portProvider: PortProvider) {
  for (const accessKeyJson of keyConfig.data().accessKeys || []) {
    portProvider.addReservedPort(accessKeyJson.port);
  }
}

function createLegacyManagerMetrics(configFilename: string): LegacyManagerMetrics {
  const metricsConfig = readMetricsConfig(configFilename);
  return new LegacyManagerMetrics(
      new RealClock(),
      new json_config.ChildConfig(metricsConfig, metricsConfig.data().transferStats));
}

async function main() {
  const verbose = process.env.LOG_LEVEL === 'debug';
  const portProvider = new PortProvider();
  const accessKeyConfig = json_config.loadFileConfig<AccessKeyConfigJson>(
      getPersistentFilename('shadowbox_config.json'));
  reserveAccessKeyPorts(accessKeyConfig, portProvider);

  prometheus.collectDefaultMetrics({register: prometheus.register});
  const nodeMetricsLocation = await exportPrometheusMetrics(prometheus.register);
  logging.debug(`Node metrics is at ${nodeMetricsLocation}`);

  const proxyHostname = process.env.SB_PUBLIC_IP;
  // Default to production metrics, as some old Docker images may not have
  // SB_METRICS_URL properly set.
  const metricsCollectorUrl = process.env.SB_METRICS_URL || 'https://metrics-prod.uproxy.org';
  if (!process.env.SB_METRICS_URL) {
    logging.warn('process.env.SB_METRICS_URL not set, using default');
  }

  if (!proxyHostname) {
    logging.error('Need to specify SB_PUBLIC_IP for invite links');
    process.exit(1);
  }

  logging.debug(`=== Config ===`);
  logging.debug(`SB_PUBLIC_IP: ${proxyHostname}`);
  logging.debug(`SB_METRICS_URL: ${metricsCollectorUrl}`);
  logging.debug(`==============`);

  const DEFAULT_PORT = 8081;
  const portNumber = Number(process.env.SB_API_PORT || DEFAULT_PORT);
  if (isNaN(portNumber)) {
    logging.error(`Invalid SB_API_PORT: ${process.env.SB_API_PORT}`);
    process.exit(1);
  }
  portProvider.addReservedPort(portNumber);

  const serverConfig =
      server_config.readServerConfig(getPersistentFilename('shadowbox_server_config.json'));

  logging.info('Starting...');
  const ipLocation =
      new ip_location.MmdbLocationService('/var/lib/libmaxminddb/GeoLite2-Country.mmdb');

  const legacyManagerMetrics =
      createLegacyManagerMetrics(getPersistentFilename('shadowbox_stats.json'));
  let managerMetrics: ManagerMetrics;
  let metricsWriter: UsageMetricsWriter;
  let metricsReader: UsageMetrics;
  const rollouts = new RolloutTracker(serverConfig.data().serverId);
  if (rollouts.isRolloutEnabled('prometheus', 0)) {
    const prometheusLocation = 'localhost:9090';
    portProvider.addReservedPort(9090);
    runPrometheusScraper(
        [
          '--storage.tsdb.retention', '31d', '--storage.tsdb.path',
          getPersistentFilename('prometheus/data'), '--web.listen-address', prometheusLocation,
          '--log.level', verbose ? 'debug' : 'info'
        ],
        getPersistentFilename('prometheus/config.yml'), {
          global: {
            scrape_interval: '15s',
          },
          scrape_configs: [
            {job_name: 'prometheus', static_configs: [{targets: [prometheusLocation]}]},
            {job_name: 'outline-server-main', static_configs: [{targets: [nodeMetricsLocation]}]}
          ]
        });
    const prometheusClient = new PrometheusClient(`http://${prometheusLocation}`);
    managerMetrics = new PrometheusManagerMetrics(prometheusClient, legacyManagerMetrics);
    metricsWriter = createPrometheusUsageMetricsWriter(prometheus.register);
    metricsReader = new PrometheusUsageMetrics(prometheusClient);
  } else {
    managerMetrics = legacyManagerMetrics;
    const usageMetrics = new InMemoryUsageMetrics();
    metricsWriter = new MultiMetricsWriter(legacyManagerMetrics, usageMetrics);
    metricsReader = usageMetrics;
  }

  const shadowsocksServer = await createLibevShadowsocksServer(
      proxyHostname, await portProvider.reserveNewPort(), ipLocation, metricsWriter, verbose);
  const accessKeyRepository = new ServerAccessKeyRepository(
      portProvider, proxyHostname, accessKeyConfig, shadowsocksServer);

  const toMetricsId = (id: AccessKeyId) => {
    return accessKeyRepository.getMetricsId(id);
  };
  const metricsCollector = new RestMetricsCollectorClient(metricsCollectorUrl);
  const metricsPublisher: SharedMetricsPublisher = new OutlineSharedMetricsPublisher(
      new RealClock(), serverConfig, metricsReader, toMetricsId, metricsCollector);
  const managerService = new ShadowsocksManagerService(
      process.env.SB_DEFAULT_SERVER_NAME || 'Outline Server', serverConfig, accessKeyRepository,
      managerMetrics, metricsPublisher);

  const certificateFilename = process.env.SB_CERTIFICATE_FILE;
  const privateKeyFilename = process.env.SB_PRIVATE_KEY_FILE;
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
