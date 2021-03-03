// Copyright 2021 The Outline Authors
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

import * as electron from 'electron';
import * as express from 'express';
import {Credentials, OAuth2Client} from 'google-auth-library';
import * as http from "http";
import {AddressInfo} from "net";

const REDIRECT_PORT = 18535;
const REDIRECT_PATH = '/gcp/oauth/callback';

const OAUTH_CONFIG = {
  // To setup GCP OAuth login:
  // * Create a GCP project for the application.
  // * Enable the Compute Engine API.
  // * Enable the Cloud Resource Manager API.
  // * Add the scopes below to the consent screen.
  // * Create OAuth 2.0 client ID (and secret).
  // * Fill in the missing config values below.
  project_id: 'mpmcroy-server-provisioner',
  client_id: '276807089705-e6sk8e96a2kbuilgnehfaag75ab2aom3.apps.googleusercontent.com',
  client_secret: null as string,
  scopes: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/compute',
    'https://www.googleapis.com/auth/devstorage.full_control',
  ],
};

export function createOAuthClient(port = REDIRECT_PORT, path = REDIRECT_PATH): OAuth2Client {
  const redirectUrl = `http://localhost:${port}${path}`;
  return new OAuth2Client(
      OAUTH_CONFIG.client_id,
      OAUTH_CONFIG.client_secret,
      redirectUrl,
  );
}

export function generateOAuthUrl(client: OAuth2Client): string {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: OAUTH_CONFIG.scopes,
  });
}

export function responseHtml(messageHtml: string): string {
  return `<html><script>window.close()</script><body>${messageHtml} You can close this window.</body></html>`;
}

export async function getUserId(credentials: Credentials): Promise<string> {
  const loginTicket = await createOAuthClient().verifyIdToken({
    idToken: credentials.id_token,
  });
  console.log(loginTicket);
  return loginTicket.getUserId();
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(credentials);
  return (await oauth2Client.refreshAccessToken()).credentials;
}

export async function revokeCredentials(credentials: Credentials): Promise<void> {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(credentials);
  await oauth2Client.revokeCredentials();
}

export function registerOAuthCallbackHandler(
    app: express.Application, server: http.Server, oAuthClient: OAuth2Client,
    promiseResolve: (value: unknown) => void, promiseReject: (reason?: unknown) => void): void {
  app.get(REDIRECT_PATH, async (request: express.Request, response: express.Response) => {
    if (request.query.error) {
      response.send(responseHtml('Authentication failed'));
      promiseReject();
    } else {
      try {
        const tokenResponse = await oAuthClient.getToken(request.query.code as string);
        if (tokenResponse.res.status / 100 === 2) {
          response.send(responseHtml('Authentication successful.'));
          promiseResolve(tokenResponse.tokens.refresh_token!);
        } else {
          response.send(responseHtml('Authentication failed'));
          promiseReject();
        }
      } catch (error) {
        response.send(responseHtml('Authentication failed'));
        promiseReject();
      }
    }
    server.close();
  });
}

export function runOauth(): OauthSession {
  // Start web server to handle OAuth callback
  const app = express();
  const server = app.listen();
  const port = (server.address() as AddressInfo).port;

  // Open browser to OAuth URL
  const oAuthClient = createOAuthClient(port);
  const oAuthUrl = generateOAuthUrl(oAuthClient);
  electron.shell.openExternal(oAuthUrl);

  const { promise: tokenPromise, promiseResolve, promiseReject } = customPromise<string>();
  registerOAuthCallbackHandler(app, server, oAuthClient, promiseResolve, promiseReject);

  return {
    result: tokenPromise,
    isCancelled() {
      return false;
    },
    cancel() {
      console.log('Session cancelled');
      // isCancelled = true;
      server.close();
      promiseReject(new Error('Authentication cancelled'));
    }
  };
}

function customPromise<T>() {
  let promiseResolve: (value: unknown) => void = null;
  let promiseReject: (reason?: unknown) => void = null;
  const promise = new Promise<T>((resolve, reject) => {
    promiseResolve = resolve;
    promiseReject = reject;
  });
  return { promise, promiseResolve, promiseReject };
}