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

import {JsonConfig} from '../infrastructure/json_config';
import * as logging from '../infrastructure/logging';
import {AccessKey, AccessKeyQuota, AccessKeyRepository} from '../model/access_key';

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
    quota: accessKey.quota,
    isOverQuota: accessKey.isOverQuota || false
  };
}

// Simplified request and response type interfaces containing only the
// properties we actually use, to make testing easier.
interface RequestParams {
  id?: string;
  name?: string;
  metricsEnabled?: boolean;
  quota?: AccessKeyQuota;
}
interface RequestType {
  params: RequestParams;
}
interface ResponseType {
  send(code: number, data?: {}): void;
}

export function bindService(
    apiServer: restify.Server, apiPrefix: string, service: ShadowsocksManagerService) {
  apiServer.put(`${apiPrefix}/name`, service.renameServer.bind(service));
  apiServer.get(`${apiPrefix}/server`, service.getServer.bind(service));

  apiServer.post(`${apiPrefix}/access-keys`, service.createNewAccessKey.bind(service));
  apiServer.get(`${apiPrefix}/access-keys`, service.listAccessKeys.bind(service));
  apiServer.del(`${apiPrefix}/access-keys/:id`, service.removeAccessKey.bind(service));
  apiServer.put(`${apiPrefix}/access-keys/:id/name`, service.renameAccessKey.bind(service));
  apiServer.put(`${apiPrefix}/access-keys/:id/quota`, service.setAccessKeyQuota.bind(service));
  apiServer.del(`${apiPrefix}/access-keys/:id/quota`, service.removeAccessKeyQuota.bind(service));

  apiServer.get(`${apiPrefix}/metrics/transfer`, service.getDataUsage.bind(service));
  apiServer.get(`${apiPrefix}/metrics/enabled`, service.getShareMetrics.bind(service));
  apiServer.put(`${apiPrefix}/metrics/enabled`, service.setShareMetrics.bind(service));
}

interface SetShareMetricsParams {
  metricsEnabled: boolean;
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
    const name = req.params.name;
    if (typeof name !== 'string' || name.length > 100) {
      res.send(400);
      next();
      return;
    }
    this.serverConfig.data().name = name;
    this.serverConfig.write();
    res.send(204);
    next();
  }

  public getServer(req: RequestType, res: ResponseType, next: restify.Next): void {
    res.send(200, {
      name: this.serverConfig.data().name || this.defaultServerName,
      serverId: this.serverConfig.data().serverId,
      metricsEnabled: this.serverConfig.data().metricsEnabled || false,
      createdTimestampMs: this.serverConfig.data().createdTimestampMs,
      portForNewAccessKeys: this.serverConfig.data().portForNewAccessKeys
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
    res.send(200, response);
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

  // Removes an existing access key
  public removeAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`removeAccessKey request ${JSON.stringify(req.params)}`);
      const accessKeyId = req.params.id;
      if (!this.accessKeys.removeAccessKey(accessKeyId)) {
        return next(new restify.NotFoundError(`No access key found with id ${accessKeyId}`));
      }
      res.send(204);
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  public renameAccessKey(req: RequestType, res: ResponseType, next: restify.Next): void {
    try {
      logging.debug(`renameAccessKey request ${JSON.stringify(req.params)}`);
      const accessKeyId = req.params.id;
      if (!this.accessKeys.renameAccessKey(accessKeyId, req.params.name)) {
        return next(new restify.NotFoundError(`No access key found with id ${accessKeyId}`));
      }
      res.send(204);
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  public async setAccessKeyQuota(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`setAccessKeyQuota request ${JSON.stringify(req.params)}`);
      const accessKeyId = req.params.id;
      const quota = req.params.quota;
      if (!quota || !quota.quotaBytes || !quota.windowHours) {
        return next(new restify.InvalidArgumentError(
            'Must provide a quota value with "quotaBytes" and "windowHours"'));
      }
      if (quota.quotaBytes < 0 || quota.windowHours < 0) {
        return next(new restify.InvalidArgumentError('Must provide positive quota values'));
      }
      const success = await this.accessKeys.setAccessKeyQuota(accessKeyId, quota);
      if (!success) {
        return next(new restify.NotFoundError(`No access key found with id ${accessKeyId}`));
      }
      res.send(204);
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  public async removeAccessKeyQuota(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      logging.debug(`removeAccessKeyQuota request ${JSON.stringify(req.params)}`);
      const accessKeyId = req.params.id;
      const success = await this.accessKeys.removeAccessKeyQuota(accessKeyId);
      if (!success) {
        return next(new restify.NotFoundError(`No access key found with id ${accessKeyId}`));
      }
      res.send(204);
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  public async getDataUsage(req: RequestType, res: ResponseType, next: restify.Next) {
    try {
      res.send(200, await this.managerMetrics.get30DayByteTransfer());
      return next();
    } catch (error) {
      logging.error(error);
      return next(new restify.InternalServerError());
    }
  }

  public getShareMetrics(req: RequestType, res: ResponseType, next: restify.Next): void {
    res.send(200, {metricsEnabled: this.metricsPublisher.isSharingEnabled()});
    next();
  }

  public setShareMetrics(req: RequestType, res: ResponseType, next: restify.Next): void {
    const params = req.params as SetShareMetricsParams;
    if (typeof params.metricsEnabled === 'boolean') {
      if (params.metricsEnabled) {
        this.metricsPublisher.startSharing();
      } else {
        this.metricsPublisher.stopSharing();
      }
      res.send(204);
    } else {
      res.send(400);
    }
    next();
  }
}
