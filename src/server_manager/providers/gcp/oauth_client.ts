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

import * as express from "express";
import {Request, Response} from "express";
import {google} from "googleapis";
import {Credentials} from "google-auth-library/build/src/auth/credentials";
import {GaxiosError} from "gaxios";
import {encodeFormData, HttpClient} from "../../infrastructure/http";
import * as open from "open";

const REDIRECT_PORT = 18535;
const REDIRECT_URL = `http://localhost:${REDIRECT_PORT}`;
const OAUTH_CONFIG = {
  // To setup GCP OAuth login:
  // * Create a GCP project for the application.
  // * Enable the Compute Engine API.
  // * Enable the Cloud Resource Manager API.
  // * Add the scopes below to the consent screen.
  // * Create OAuth 2.0 client ID (and secret).
  // * Fill in the missing config values below.
  project_id: "mpmcroy-server-provisioner",
  client_id: "276807089705-mbga5q4kilo17ikc20ttadtdvb4d25gd.apps.googleusercontent.com",
  client_secret: "cBFKMxmcHRWvjXF_GUTjXH8R",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  redirect_uris: [`${REDIRECT_URL}/oauth/callback`],
  scopes: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/compute",
    "https://www.googleapis.com/auth/devstorage.full_control",
  ],
};

export class OAuthCredential {
  constructor(private accessToken?: string, private refreshToken?: string) {
  }

  getAccessToken(): string | undefined {
    return this.accessToken;
  }

  async refresh(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error();
    }
    this.accessToken = await refreshAccessToken(this.refreshToken);
  }

  async revoke(): Promise<void> {
    if (this.accessToken) {
      await revokeToken(this.accessToken);
    }
    if (this.refreshToken) {
      await revokeToken(this.refreshToken);
    }
  }
}

type RefreshAccessTokenResponse = Readonly<{
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}>;

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const authClient = new HttpClient("https://oauth2.googleapis.com/", {
    Host: "oauth2.googleapis.com",
    "Content-Type": "application/x-www-form-urlencoded",
  });

  const data = {
    client_id: OAUTH_CONFIG.client_id,
    client_secret: OAUTH_CONFIG.client_secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  };

  console.log(`formdata: ${encodeFormData(data)}`);
  const refreshAccessTokenResponse = await authClient.post<RefreshAccessTokenResponse>("token", encodeFormData(data));
  return refreshAccessTokenResponse.access_token;
}

export async function revokeToken(token: string) {
  const authClient = new HttpClient("https://oauth2.googleapis.com/", {
    Host: "oauth2.googleapis.com",
    "Content-Type": "application/x-www-form-urlencoded",
  });

  const queryString = `?token=${token}`;
  await authClient.get<void>(`revoke${queryString}`);
}

export async function performOauth(): Promise<Credentials> {
  const oauth2Client = new google.auth.OAuth2(
      OAUTH_CONFIG.client_id,
      OAUTH_CONFIG.client_secret,
      OAUTH_CONFIG.redirect_uris[0]
  );
  const oauthUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: OAUTH_CONFIG.scopes,
  });
  await open(oauthUrl);

  return new Promise<Credentials>((resolve, reject) => {
    const app: express.Application = express();
    app.get("/oauth/callback", (request: Request, response: Response) => {
      if (request.query.error) {
        response.send("User denied access");
        reject();
      } else {
        oauth2Client.getToken(request.query.code as string, (err: GaxiosError | null, token?: Credentials | null) => {
          if (err) {
            response.send("Error");
            reject();
          } else {
            response.send("Success! Please return back to the Outline CLI to continue.");
            resolve(token!);
          }
        });
      }
    });
    app.listen(REDIRECT_PORT);
  });
}
