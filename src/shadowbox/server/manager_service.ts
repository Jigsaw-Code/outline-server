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

import * as crypto from 'crypto';
import * as ipRegex from 'ip-regex';
import * as restify from 'restify';
import * as restifyErrors from 'restify-errors';
import {makeConfig, SIP002_URI} from 'outline-shadowsocksconfig';

import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyRepository, DataLimit} from '../model/access_key';
import * as errors from '../model/errors';
import {version} from '../package.json';

import {ManagerMetrics} from './manager_metrics';
import {ServerConfigJson} from './server_config';
import {SharedMetricsPublisher} from './shared_metrics';

// Creates a AccessKey response.
function accessKeyToApiJson(accessKey: AccessKey) {
  return {
    // The unique identifier of this access key.
    id: accessKey.id,
    // Admin-controlled, editable name for this access key.
    name: accessKey.name,
    // Shadowsocks-specific details and credentials.
    password: accessKey.proxyParams.password,
    port: accessKey.proxyParams.portNumber,
    method: accessKey.proxyParams.encryptionMethod,
    dataLimit: accessKey.dataLimit,
    accessUrl: SIP002_URI.stringify(
      makeConfig({
        host: accessKey.proxyParams.hostname,
        port: accessKey.proxyParams.portNumber,
        method: accessKey.proxyParams.encryptionMethod,
        password: accessKey.proxyParams.password,
        outline: 1,
      })
    ),
  };
}

// Type to reflect that we receive untyped JSON request parameters.
interface RequestParams {
  // Supported parameters:
  //   id: string
  //   name: string
  //   metricsEnabled: boolean
  //   limit: DataLimit
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

// Similar to String.startsWith(), but constant-time.
function timingSafeStartsWith(input: string, prefix: string): boolean {
  const prefixBuf = Buffer.from(prefix);
  const inputBuf = Buffer.from(input);
  const L = Math.min(inputBuf.length, prefixBuf.length);
  const inputOverlap = inputBuf.slice(0, L);
  const prefixOverlap = prefixBuf.slice(0, L);
  const match = crypto.timingSafeEqual(inputOverlap, prefixOverlap);
  return inputBuf.length >= prefixBuf.length && match;
}

// Returns a pre-routing hook that injects a 404 if the request does not
// start with `apiPrefix`.  This filter runs in constant time.
function prefixFilter(apiPrefix: string): restify.RequestHandler {
  return (req: restify.Request, res: restify.Response, next: restify.Next) => {
    if (timingSafeStartsWith(req.path(), apiPrefix)) {
      return next();
    }
    // This error matches the router's default 404 response.
    next(new restifyErrors.ResourceNotFoundError('%s does not exist', req.path()));
  };
}

export function bindService(
  apiServer: restify.Server,
  apiPrefix: string,
  service: ShadowsocksManagerService
) {
  // Reject unauthorized requests in constant time before they reach the routing step.
  apiServer.pre(prefixFilter(apiPrefix));

  apiServer.put(`${apiPrefix}/name`, service.renameServer.bind(service));
  apiServer.get(`${apiPrefix}/server`, service.getServer.bind(service));
  apiServer.put(
    `${apiPrefix}/server/access-key-data-limit`,
    service.setDefaultDataLimit.bind(service)
  );
  apiServer.del(
    `${apiPrefix}/server/access-key-data-limit`,
    service.removeDefaultDataLimit.bind(service)
  );
  apiServer.put(
    `${apiPrefix}/server/hostname-for-access-keys`,
    service.setHostnameForAccessKeys.bind(service)
  );
  apiServer.put(
    `${apiPrefix}/server/port-for-new-access-keys`,
    service.setPortForNewAccessKeys.bind(service)
  );

  apiServer.post(`${apiPrefix}/access-keys`, service.createNewAccessKey.bind(service));
  apiServer.get(`${apiPrefix}/access-keys`, service.listAccessKeys.bind(service));

  apiServer.del(`${apiPrefix}/access-keys/:id`, service.removeAccessKey.bind(service));
  apiServer.put(`${apiPrefix}/access-keys/:id/name`, service.renameAccessKey.bind(service));
  apiServer.put(
    `${apiPrefix}/access-keys/:id/data-limit`,
    service.setAccessKeyDataLimit.bind(service)
  );
  apiServer.del(
    `${apiPrefix}/access-keys/:id/data-limit`,
    service.removeAccessKeyDataLimit.bind(service)
  );

  apiServer.get(`${apiPrefix}/metrics/transfer`, service.getDataUsage.bind(service));
  apiServer.get(`${apiPrefix}/metrics/enabled`, service.getShareMetrics.bind(service));
  apiServer.put(`${apiPrefix}/metrics/enabled`, service.setShareMetrics.bind(service));

  // Redirect former experimental APIs
  apiServer.put(
    `${apiPrefix}/experimental/access-key-data-limit`,
    redirect(`${apiPrefix}/server/access-key-data-limit`)
  );
  apiServer.del(
    `${apiPrefix}/experimental/access-key-data-limit`,
    redirect(`${apiPrefix}/server/access-key-data-limit`)
  );
}

// Returns a request handler that redirects a bound request path to `url` with HTTP status code 308.
function redirect(url: string): restify.RequestHandlerType {
  return (req: restify.Request, res: restify.Response, next: restify.Next) => {
    logging.debug(`Redirecting ${req.url} => ${url}`);
    res.redirect(308, url, next);
  };
}

function validateAccessKeyId(accessKeyId: unknown): string {
  if (!accessKeyId) {
    throw new restifyErrors.MissingParameterError({statusCode: 400}, 'Parameter `id` is missing');
  } else if (typeof accessKeyId !== 'string') {
    throw new restifyErrors.InvalidArgumentError(
      {statusCode: 400},
      'Parameter `id` must be of type string'
    );
  }
  return accessKeyId;
}

function validateDataLimit(limit: unknown): DataLimit {
  if (!limit) {
    throw new restifyErrors.MissingParameterError({statusCode: 400}, 'Missing `limit` parameter');
  }
  const bytes = (limit as DataLimit).bytes;
  if (!(Number.isInteger(bytes) && bytes >= 0)) {
    throw new restifyErrors.InvalidArgumentError(
      {statusCode: 400},
      '`limit.bytes` must be an non-negative integer'
    );
  }
  return limit as DataLimit;
}

// The ShadowsocksManagerService manages the access keys that can use the server
// as a proxy using Shadowsocks. It runs an instance of the Shadowsocks server
// for each existing access key, with the port and password assigned for that access key.
export class ShadowsocksManagerService {
  constructor(
    private defaultServerName: string,
    private serverConfig: JsonConfig<ServerConfigJson>,
    private accessKeys: AccessKeyRepository,
    private managerMetrics: ManagerMetrics,
    private metricsPublisher: SharedMetricsPublisher
  ) {}

  public renameServer(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`renameServer request ${JSON.stringify(req.params)}`);
    const name = req.params.name;
    if (!name) {
      return next(
        new restifyErrors.MissingParameterError({statusCode: 400}, 'Parameter `name` is missing')
      );
    }
    if (typeof name !== 'string' || name.length > 100) {
      next(
        new restifyErrors.InvalidArgumentError(
          `Requested server name should be a string <= 100 characters long.  Got ${name}`
        )
      );
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
      version,
      accessKeyDataLimit: this.serverConfig.data().accessKeyDataLimit,
      portForNewAccessKeys: this.serverConfig.data().portForNewAccessKeys,
      hostnameForAccessKeys: this.serverConfig.data().hostname,
    });
    next();
  }

  // Changes the server's hostname.  Hostname must be a valid domain or IP address
  public setHostnameForAccessKeys(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`changeHostname request: ${JSON.stringify(req.params)}`);

    const hostname = req.params.hostname;
    if (typeof hostname === 'undefined') {
      return next(
        new restifyErrors.MissingParameterError({statusCode: 400}, 'hostname must be provided')
      );
    }
    if (typeof hostname !== 'string') {
      return next(
        new restifyErrors.InvalidArgumentError(
          {statusCode: 400},
          `Expected hostname to be a string, instead got ${hostname} of type ${typeof hostname}`
        )
      );
    }
    // Hostnames can have any number of segments of alphanumeric characters and hyphens, separated
    // by periods. No segment may start or end with a hyphen.
    const hostnameRegex =
      /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$/;
    if (!hostnameRegex.test(hostname) && !ipRegex({includeBoundaries: true}).test(hostname)) {
      return next(
        new restifyErrors.InvalidArgumentError(
          {statusCode: 400},
          `Hostname ${hostname} isn't a valid hostname or IP address`
        )
      );
    }

    this.serverConfig.data().hostname = hostname;
    this.serverConfig.write();
    this.accessKeys.setHostname(hostname);
    res.send(HttpSuccess.NO_CONTENT);
    next();
  }

  // Lists all access keys
  public listAccessKeys(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`listAccessKeys request ${JSON.stringify(req.params)}`);
    const response = {accessKeys: []};
    for (const accessKey of this.accessKeys.listAccessKeys()) {
      response.accessKeys.push(accessKeyToApiJson(accessKey));
    }
    logging.debug(`listAccessKeys response ${JSON.stringify(response)}`);
    res.send(HttpSuccess.OK, response);
    return next();
  }

  // Creates a new access key
  public createNewAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`createNewAccessKey request ${JSON.stringify(req.params)}`);
      this.accessKeys.createNewAccessKey().then((accessKey) => {
        const accessKeyJson = accessKeyToApiJson(accessKey);
        res.send(201, accessKeyJson);
        logging.debug(`createNewAccessKey response ${JSON.stringify(accessKeyJson)}`);
        return next();
      });
    } catch (error) {
      logging.error(error);
      return next(new restifyErrors.InternalServerError());
    }
  }

  // Sets the default ports for new access keys
  public async setPortForNewAccessKeys(
    req: RequestType,
    res: ResponseType,
    next: restify.Next
  ): Promise<void> {
    try {
      logging.debug(`setPortForNewAccessKeys request ${JSON.stringify(req.params)}`);
      const port = req.params.port;
      if (!port) {
        return next(
          new restifyErrors.MissingParameterError({statusCode: 400}, 'Parameter `port` is missing')
        );
      } else if (typeof port !== 'number') {
        return next(
          new restifyErrors.InvalidArgumentError(
            {statusCode: 400},
            `Expected a numeric port, instead got ${port} of type ${typeof port}`
          )
        );
      }
      await this.accessKeys.setPortForNewAccessKeys(port);
      this.serverConfig.data().portForNewAccessKeys = port;
      this.serverConfig.write();
      res.send(HttpSuccess.NO_CONTENT);
      next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.InvalidPortNumber) {
        return next(new restifyErrors.InvalidArgumentError({statusCode: 400}, error.message));
      } else if (error instanceof errors.PortUnavailable) {
        return next(new restifyErrors.ConflictError(error.message));
      }
      return next(new restifyErrors.InternalServerError(error));
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
        return next(new restifyErrors.NotFoundError(error.message));
      } else if (error instanceof restifyErrors.HttpError) {
        return next(error);
      }
      return next(new restifyErrors.InternalServerError());
    }
  }

  public renameAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`renameAccessKey request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      const name = req.params.name;
      if (!name) {
        return next(
          new restifyErrors.MissingParameterError({statusCode: 400}, 'Parameter `name` is missing')
        );
      } else if (typeof name !== 'string') {
        return next(
          new restifyErrors.InvalidArgumentError(
            {statusCode: 400},
            'Parameter `name` must be of type string'
          )
        );
      }
      this.accessKeys.renameAccessKey(accessKeyId, name);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.AccessKeyNotFound) {
        return next(new restifyErrors.NotFoundError(error.message));
      } else if (error instanceof restifyErrors.HttpError) {
        return next(error);
      }
      return next(new restifyErrors.InternalServerError());
    }
  }

  public async setAccessKeyDataLimit(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`setAccessKeyDataLimit request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      const limit = validateDataLimit(req.params.limit);
      // Enforcement is done asynchronously in the proxy server.  This is transparent to the manager
      // so this doesn't introduce any race conditions between the server and UI.
      this.accessKeys.setAccessKeyDataLimit(accessKeyId, limit);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.AccessKeyNotFound) {
        return next(new restifyErrors.NotFoundError(error.message));
      }
      return next(error);
    }
  }

  public async removeAccessKeyDataLimit(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`removeAccessKeyDataLimit request ${JSON.stringify(req.params)}`);
      const accessKeyId = validateAccessKeyId(req.params.id);
      // Enforcement is done asynchronously in the proxy server.  This is transparent to the manager
      // so this doesn't introduce any race conditions between the server and UI.
      this.accessKeys.removeAccessKeyDataLimit(accessKeyId);
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (error instanceof errors.AccessKeyNotFound) {
        return next(new restifyErrors.NotFoundError(error.message));
      }
      return next(error);
    }
  }

  public async setDefaultDataLimit(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`setDefaultDataLimit request ${JSON.stringify(req.params)}`);
      const limit = validateDataLimit(req.params.limit);
      // Enforcement is done asynchronously in the proxy server.  This is transparent to the manager
      // so this doesn't introduce any race conditions between the server and UI.
      this.accessKeys.setDefaultDataLimit(limit);
      this.serverConfig.data().accessKeyDataLimit = limit;
      this.serverConfig.write();
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      if (
        error instanceof restifyErrors.InvalidArgumentError ||
        error instanceof restifyErrors.MissingParameterError
      ) {
        return next(error);
      }
      return next(new restifyErrors.InternalServerError());
    }
  }

  public async removeDefaultDataLimit(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`removeDefaultDataLimit request ${JSON.stringify(req.params)}`);
      // Enforcement is done asynchronously in the proxy server.  This is transparent to the manager
      // so this doesn't introduce any race conditions between the server and UI.
      this.accessKeys.removeDefaultDataLimit();
      delete this.serverConfig.data().accessKeyDataLimit;
      this.serverConfig.write();
      res.send(HttpSuccess.NO_CONTENT);
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restifyErrors.InternalServerError());
    }
  }

  public async getDataUsage(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`getDataUsage request ${JSON.stringify(req.params)}`);
      const response = await this.managerMetrics.getOutboundByteTransfer({hours: 30 * 24});
      res.send(HttpSuccess.OK, response);
      logging.debug(`getDataUsage response ${JSON.stringify(response)}`);
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restifyErrors.InternalServerError());
    }
  }

  public getShareMetrics(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`getShareMetrics request ${JSON.stringify(req.params)}`);
    const response = {metricsEnabled: this.metricsPublisher.isSharingEnabled()};
    res.send(HttpSuccess.OK, response);
    logging.debug(`getShareMetrics response: ${JSON.stringify(response)}`);
    next();
  }

  public setShareMetrics(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`setShareMetrics request ${JSON.stringify(req.params)}`);
    const metricsEnabled = req.params.metricsEnabled;
    if (metricsEnabled === undefined || metricsEnabled === null) {
      return next(
        new restifyErrors.MissingParameterError(
          {statusCode: 400},
          'Parameter `metricsEnabled` is missing'
        )
      );
    } else if (typeof metricsEnabled !== 'boolean') {
      return next(
        new restifyErrors.InvalidArgumentError(
          {statusCode: 400},
          'Parameter `hours` must be an integer'
        )
      );
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
