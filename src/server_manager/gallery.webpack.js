// Copyright 2020 The Outline Authors
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

// Webpack config to run the Outline Manager on the browser.

const path = require('path');
const {makeConfig} = require('./base.webpack.js');
const {OAuth2Client} = require('google-auth-library');

const DEV_SERVER_PORT = 18535;

module.exports = makeConfig({
  main: path.resolve(__dirname, './web_app/gallery_app/main.ts'),
  target: 'web',
  defaultMode: 'development',
  template: path.resolve(__dirname, './web_app/gallery_app/index.html'),
  devServer: {
    overlay: true,
    port: DEV_SERVER_PORT,
    setup: async function (app, server) {
      const oAuthClient = createOAuthClient(DEV_SERVER_PORT);
      app.get('/gcp/oauth', async (request, response) => {
        const oAuthUrl = generateOAuthUrl(oAuthClient);
        response.redirect(oAuthUrl);
      });
      await registerOAuthCallbackHandler(app, oAuthClient);
    },
  },
});

const REDIRECT_PORT = 18535;
const REDIRECT_PATH = '/gcp/oauth/callback';
const OAUTH_CONFIG = {
  project_id: 'mpmcroy-server-provisioner',
  client_id: '276807089705-e6sk8e96a2kbuilgnehfaag75ab2aom3.apps.googleusercontent.com',
  scopes: [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/compute',
    'https://www.googleapis.com/auth/devstorage.full_control',
  ],
};

function createOAuthClient(port = REDIRECT_PORT) {
  const redirectPath = '/gcp/oauth/callback';
  const redirectUrl = `http://localhost:${port}${redirectPath}`;
  return new OAuth2Client(
      OAUTH_CONFIG.client_id,
      null,
      redirectUrl,
  );
}

function generateOAuthUrl(client) {
  return client.generateAuthUrl({
    access_type: "offline",
    scope: OAUTH_CONFIG.scopes,
  });
}

function responseHtml(messageHtml) {
  return `<html><script></script><body>${messageHtml} You can close this window.</body></html>`;
}

function registerOAuthCallbackHandler(app, oAuthClient) {
  return new Promise((resolve, reject) => {
    app.get(REDIRECT_PATH, async (request, response) => {
      if (request.query.error) {
        response.send(responseHtml('Authentication failed'));
        reject();
      } else {
        try {
          const tokenResponse = await oAuthClient.getToken(request.query.code);
          if (tokenResponse.res.status / 100 === 2) {
            response.send(responseHtml('Authentication successful.'));
            console.log('token', tokenResponse.tokens.refresh_token);
            resolve(tokenResponse.tokens.refresh_token);
          } else {
            response.send(responseHtml('Authentication failed'));
            reject();
          }
        } catch (error) {
          response.send(responseHtml('Authentication failed'));
          reject();
        }
      }
    });
  });
}
