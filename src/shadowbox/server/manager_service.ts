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

import * as logging from '../infrastructure/logging';
import { AccessKey, AccessKeyRepository } from '../model/access_key';

// Creates a AccessKey response.
function accessKeyToJson(accessKey: AccessKey) {
  return {
    // The unique identifier of this access key.
    id: accessKey.id,
    // Admin-controlled, editable name for this access key.
    name: accessKey.name,
    // Shadowsocks-specific details and credentials.
    password: accessKey.shadowsocksInstance.password,
    port: accessKey.shadowsocksInstance.portNumber,
    method: accessKey.shadowsocksInstance.encryptionMethod,
    accessUrl: accessKey.shadowsocksInstance.accessUrl,
  };
}

// Simplified request and response type interfaces containing only the
// properties we actually use, to make testing easier.
interface RequestParams {
  id?: string;
  name?: string;
}
interface RequestType {
  params: RequestParams;
}
interface ResponseType {
  send(code: number, data?: {}): void;
}

// The ShadowsocksManagerService manages the access keys that can use the server
// as a proxy using Shadowsocks. It runs an instance of the Shadowsocks server
// for each existing access key, with the port and password assigned for that access key.
export class ShadowsocksManagerService {
  constructor(private accessKeys: AccessKeyRepository) {}

  // Lists all access keys
  public listAccessKeys(req: RequestType, res: ResponseType, next: restify.Next): void {
    logging.debug(`listAccessKeys request ${req.params}`);
    const response = {accessKeys: [], users: []};
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
      logging.debug(`createNewAccessKey request ${req.params}`);
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
      logging.debug(`removeAccessKey request ${req.params}`);
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
      logging.debug(`renameAccessKey request ${req.params}`);
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
}
