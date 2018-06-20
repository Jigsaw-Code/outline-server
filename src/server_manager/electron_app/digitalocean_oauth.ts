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

import * as bodyParser from 'body-parser';
import * as crypto from 'crypto';
import * as electron from 'electron';
import * as express from 'express';
import * as http from 'http';
import * as path from 'path';


const CLIENT_ID = 'f744f93b192f6b5280129db478897111984181f45b3d42afd7a159c786899825';
const REDIRECT_URI = 'https://fortuna.users.x20web.corp.google.com/jigsaw/outline/post_oauth.html';

function randomValueHex(len: number): string {
  return crypto.randomBytes(Math.ceil(len / 2))
      .toString('hex')  // convert to hexadecimal format
      .slice(0, len);   // return required number of characters
}

// Runs the DigitalOcean oauth flow and returns the access token.
// See https://developers.digitalocean.com/documentation/oauth/ for the API.
export function runOauth(): Promise<string> {
  const secret = randomValueHex(16);

  const app = express();
  const server = http.createServer(app);

  return new Promise((resolve, reject) => {
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      next();
    });

    app.post('/', bodyParser.json({type: '*/*'}), (request, response) => {
      server.close(() => {
        console.log('Server closed');
      });

      const requestSecret = request.query.secret;
      if (requestSecret !== secret) {
        response.sendStatus(400);
        reject(new Error(`Expected secret ${secret}. Got ${requestSecret}`));
        return;
      }
      response.send('OAuth successful');
      const accessToken = request.body.access_token;
      if (accessToken) {
        resolve(accessToken);
      } else {
        reject(new Error('No access_token on OAuth response'));
      }
    });

    server.listen(0, 'localhost', () => {
      const address = server.address();
      console.log(`OAuth target listening on ${address.address}:${address.port}`);

      const targetUrl = `http://localhost:${encodeURIComponent(address.port.toString())}?secret=${
          encodeURIComponent(secret)}`;
      const oauthUrl = `https://cloud.digitalocean.com/v1/oauth/authorize?client_id=${
          encodeURIComponent(CLIENT_ID)}&response_type=token&scope=read%20write&redirect_uri=${
          encodeURIComponent(REDIRECT_URI)}&state=${encodeURIComponent(targetUrl)}`;
      console.log(`Opening OAuth URL ${oauthUrl}`);
      electron.shell.openExternal(oauthUrl);
    });

    server.on('error', (error) => {
      reject(error);
    });
  });
}