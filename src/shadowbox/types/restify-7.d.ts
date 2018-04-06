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

// Definitions for restify 7

declare module 'restify' {
  import * as errors from 'restify-errors';

  type Next = (error?: errors.HttpError) => void;
  type Handler = (req, res, next: Next) => void;

  // Reference: http://restify.com/docs/server-api/#createserver
  function createServer(options: {
    certificate: string | Buffer,
    key: string | Buffer,
  }): Server;

  // Reference: hhttp://restify.com/docs/server-api/#server
  interface Server {
    url: string;

    del(route: string, handler: Handler);
    get(route: string, handler: Handler);
    listen(port: number, callback: Function);
    listen(port: number, host?: string, callback?: Function);
    post(route: string, handler: Handler);
    pre(Handler);
    put(route: string, handler: Handler);
    use(Handler);
  }
  export function createServer(): Server;

  // Reference: http://restify.com/docs/plugins-api
  namespace plugins {
    function bodyParser(): Handler;
    function jsonp(): Handler;
    function sanitizePath(): Handler;
  }
}

declare module 'restify-cors-middleware' {
  import * as restify from 'restify';

  interface CorsMiddleware {
    preflight: restify.Handler;
    actual: restify.Handler;
  }

  function create(options?: object): CorsMiddleware;

  export = create;
}