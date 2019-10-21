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

import * as restify from 'restify';
import {makeConfig, SIP002_URI} from 'ShadowsocksConfig/shadowsocks_config';
import {version} from '../package.json';

import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyRepository, DataUsage} from '../model/access_key';
import * as errors from '../model/errors';

import {ManagerMetrics} from './manager_metrics';
import {ServerConfigJson} from './server_config';
import {SharedMetricsPublisher} from './shared_metrics';

// Creates a AccessKey response.
function accessKeyToJson(accessKey: AccessKey) {
  return {
    // The unique identifier of this access key.
    id: accessKey.id,
    // Admin-controlled, editable name for this access key.
    name: accessKey.name,
    // Shadowsocks-specific details and credentials.
    password: accessKey.proxyParams.password,
    port: accessKey.proxyParams.portNumber,
    method: accessKey.proxyParams.encryptionMethod,
    accessUrl: SIP002_URI.stringify(makeConfig({
      host: accessKey.proxyParams.hostname,
      port: accessKey.proxyParams.portNumber,
      method: accessKey.proxyParams.encryptionMethod,
      password: accessKey.proxyParams.password,
      outline: 1,
    })),
    dataLimit: accessKey.dataLimit
  };
}

// Type to reflect that we receive untyped JSON request parameters.
interface RequestParams {
  // Supported parameters:
  //   id: string
  //   name: string
  //   metricsEnabled: boolean
  //   limit: DataUsage
  //   port: number
  //   hours: number
  [param: string]: unknown;
}
// Simplified request and response type interfaces containing only the
// properties we actually use, to make testing easier.
interface RequestType {
  params: RequestParams;
}
interface ResponseType {
  send(code: number, data?: {}): void;
}

enum HttpSuccess {
  OK = 200,
  NO_CONTENT = 204,
}

export function bindService(
    apiServer: restify.Server, apiPrefix: string, service: ShadowsocksManagerService) {
  apiServer.put(`${apiPrefix}/name`, service.renameServer.bind(service));
  apiServer.get(`${apiPrefix}/server`, service.getServer.bind(service));
  apiServer.put(
      `${apiPrefix}/server/port-for-new-access-keys`,
      service.setPortForNewAccessKeys.bind(service));
  apiServer.put(
      `${apiPrefix}/server/data-usage-timeframe`, service.setDataUsageTimeframe.bind(service));

  apiServer.post(`${apiPrefix}/access-keys`, service.createNewAccessKey.bind(service));
  apiServer.get(`${apiPrefix}/access-keys`, service.listAccessKeys.bind(service));

  apiServer.del(`${apiPrefix}/access-keys/:id`, service.removeAccessKey.bind(service));
  apiServer.put(`${apiPrefix}/access-keys/:id/name`, service.renameAccessKey.bind(service));
  apiServer.put(
      `${apiPrefix}/access-keys/:id/data-limit`, service.setAccessKeyDataLimit.bind(service));
  apiServer.del(
      `${apiPrefix}/access-keys/:id/data-limit`, service.removeAccessKeyDataLimit.bind(service));

  apiServer.get(`${apiPrefix}/metrics/transfer`, service.getDataUsage.bind(service));
  apiServer.get(`${apiPrefix}/metrics/enabled`, service.getShareMetrics.bind(service));
  apiServer.put(`${apiPrefix}/metrics/enabled`, service.setShareMetrics.bind(service));
}

function validateAccessKeyId(accessKeyId: unknown): string {
  if (!accessKeyId) {
    throw new restify.MissingParameterError({statusCode: 400}, 'Parameter `id` is missing');
  } else if (typeof accessKeyId !== 'string') {
    throw new restify.InvalidArgumentError(
        {statusCode: 400}, 'Parameter `id` must be of type string');
  }
  return accessKeyId;
}

// The ShadowsocksManagerService manages the access keys that can use the server
// as a proxy using Shadowsocks. It runs an instance of the Shadowsocks server
// for each existing access key, with the port and password assigned for that access key.
export class ShadowsocksManagerService {
  constructor(
      private defaultServerName: string, private serverConfig: JsonConfig<ServerConfigJson>,
      private accessKeys: AccessKeyRepository, private managerMetrics: ManagerMetrics,
      private metricsPublisher: SharedMetricsPublisher) {}

  public renameServer(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`renameServer request ${JSON.stringify(req.params)}`);
    const name = req.params.name;
    if (!name) {
      return next(
          new restify.MissingParameterError({statusCode: 400}, 'Parameter `name` is missing'));
    }
    if (typeof name !== 'string' || name.length > 100) {
      next(new restify.InvalidArgumentError(
          `Requested server name should be a string <= 100 characters long.  Got ${name}`));
      return;
    }
    this.serverConfig.data().name = name;
    this.serverConfig.write();
    res.send(HttpSuccess.NO_CONTENT);
    next();
  }

  public getServer(req: RequestType, res: ResponseType, next: restify.Next): void {
    res.send(HttpSuccess.OK, {
      name: this.serverConfig.data().name || this.defaultServerName,
      serverId: this.serverConfig.data().serverId,
      metricsEnabled: this.serverConfig.data().metricsEnabled || false,
      createdTimestampMs: this.serverConfig.data().createdTimestampMs,
      portForNewAccessKeys: this.serverConfig.data().portForNewAccessKeys,
      dataUsageTimeframe: this.serverConfig.data().dataUsageTimeframe,
      version
    });
    next();
  }

  // Lists all access keys
  public listAccessKeys(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`listAccessKeys request ${JSON.stringify(req.params)}`);
    const response = {accessKeys: []};
    for (const accessKey of this.accessKeys.listAccessKeys()) {
      response.accessKeys.push(accessKeyToJson(accessKey));
    }
    logging.debug(`listAccessKeys response ${response}`);
    res.send(HttpSuccess.OK, response);
    return next();
  }

  // Creates a new access key
  public createNewAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`createNewAccessKey request ${JSON.stringify(req.params)}`);
      this.accessKeys.createNewAccessKey().then((accessKey) => {
        const accessKeyJson = accessKeyToJson(accessKey);
        res.send(201, accessKeyJson);
        return next();
      });
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  // Sets the default ports for new access keys
  public async setPortForNewAccessKeys(req: RequestType, res: ResponseType, next: restify.Next):
      Promise<void> {
    try {
      logging.debug(`setPortForNewAccessKeys request ${JSON.stringify(req.params)}`);
      const port = req.params.port;
      if (!port) {
        return next(
            new restify.MissingParameterError({statusCode: 400}, 'Parameter `port` is missing'));
      } else if (typeof port !== 'number') {
        return next(new restify.InvalidArgumentError(
            {statusCode: 400},
            `Expected a numeric port, instead got ${port} of type ${typeof port}`));
      }
      await this.accessKeys.setPortForNewAccessKeys(port);
      this.serverConfig.data().portForNewAccessKeys = port;
      this.serverConfig.write();
      res.send(HttpSuccess.NO_CONTENT);
      next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.InvalidPortNumber) {
        return next(new restify.InvalidArgumentError({statusCode: 400}, error.message));
      } else if (error instanceof errors.PortUnavailable) {
        return next(new restify.ConflictError(error.message));
      }
      return next(new restify.InternalServerError(error));
    }
  }

  // Removes an existing access key
  public removeAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`removeAccessKey request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      this.accessKeys.removeAccessKey(accessKeyId);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.AccessKeyNotFound) {
        return next(new restify.NotFoundError(error.message));
      } else if (error instanceof restify.HttpError) {
        return next(error);
      }
      return next(new restify.InternalServerError());
    }
  }

  public renameAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`renameAccessKey request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      const name = req.params.name;
      if (!name) {
        return next(
            new restify.MissingParameterError({statusCode: 400}, 'Parameter `name` is missing'));
      } else if (typeof name !== 'string') {
        return next(new restify.InvalidArgumentError(
            {statusCode: 400}, 'Parameter `name` must be of type string'));
      }
      this.accessKeys.renameAccessKey(accessKeyId, name);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.AccessKeyNotFound) {
        return next(new restify.NotFoundError(error.message));
      } else if (error instanceof restify.HttpError) {
        return next(error);
      }
      return next(new restify.InternalServerError());
    }
  }

  public async setAccessKeyDataLimit(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`setAccessKeyDataLimit request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      const limit = req.params.limit as DataUsage;
      if (!limit) {
        return next(
            new restify.MissingParameterError({statusCode: 400}, 'Parameter `limit` is missing'));
      } else if (!Number.isInteger(limit.bytes)) {
        return next(new restify.InvalidArgumentError(
            {statusCode: 400}, 'Parameter `limit.bytes` must be an integer'));
      }
      await this.accessKeys.setAccessKeyDataLimit(accessKeyId, limit);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.InvalidAccessKeyDataLimit) {
        return next(new restify.InvalidArgumentError({statusCode: 400}, error.message));
      } else if (error instanceof errors.AccessKeyNotFound) {
        return next(new restify.NotFoundError(error.message));
      } else if (error instanceof restify.HttpError) {
        return next(error);
      }
      return next(new restify.InternalServerError());
    }
  }

  public async removeAccessKeyDataLimit(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`removeAccessKeyDataLimit request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      await this.accessKeys.removeAccessKeyDataLimit(accessKeyId);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.AccessKeyNotFound) {
        return next(new restify.NotFoundError(error.message));
      } else if (error instanceof restify.HttpError) {
        return next(error);
      }
      return next(new restify.InternalServerError());
    }
  }

  public setDataUsageTimeframe(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`setDataUsageTimeframe request ${JSON.stringify(req.params)}`);
      const hours = req.params.hours;
      if (!hours) {
        return next(
            new restify.MissingParameterError({statusCode: 400}, 'Parameter `hours` is missing'));
      }
      if (typeof hours !== 'number' ||
          !Number.isInteger(hours)) {  // The access key repository will validate the value.
        return next(new restify.InvalidArgumentError(
            {statusCode: 400}, 'Parameter `hours` must be an integer'));
      }
      const dataUsageTimeframe = {hours};
      this.accessKeys.setDataUsageTimeframe(dataUsageTimeframe);
      this.serverConfig.data().dataUsageTimeframe = dataUsageTimeframe;
      this.serverConfig.write();
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.InvalidDataUsageTimeframe) {
        return next(new restify.InvalidArgumentError({statusCode: 400}, error.message));
      }
      return next(new restify.InternalServerError());
    }
  }

  public async getDataUsage(req: RequestType, res: ResponseType, next: restify.Next) {
    // TODO(alalama): use AccessKey.dataUsage to avoid querying Prometheus. Deprecate this call in
    // the manager in favor of `GET /access-keys`.
    try {
      const timeframe = this.serverConfig.data().dataUsageTimeframe;
      res.send(HttpSuccess.OK, await this.managerMetrics.getOutboundByteTransfer(timeframe));
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  public getShareMetrics(req: RequestType, res: ResponseType, next: restify.Next): void {
    res.send(HttpSuccess.OK, {metricsEnabled: this.metricsPublisher.isSharingEnabled()});
    next();
  }

  public setShareMetrics(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`setShareMetrics request ${JSON.stringify(req.params)}`);
    const metricsEnabled = req.params.metricsEnabled;
    if (metricsEnabled === undefined || metricsEnabled === null) {
      return next(new restify.MissingParameterError(
          {statusCode: 400}, 'Parameter `metricsEnabled` is missing'));
    } else if (typeof metricsEnabled !== 'boolean') {
      return next(new restify.InvalidArgumentError(
          {statusCode: 400}, 'Parameter `hours` must be an integer'));
    }
    if (metricsEnabled) {
      this.metricsPublisher.startSharing();
    } else {
      this.metricsPublisher.stopSharing();
    }
    res.send(HttpSuccess.NO_CONTENT);
    next();
  }
}
