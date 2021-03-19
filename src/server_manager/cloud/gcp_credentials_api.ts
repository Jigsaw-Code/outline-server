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

// TODO: Share the same OAuth config between electron app and renderer.
// Keep this in sync with {@link gcp_oauth.ts#OAUTH_CONFIG}
import {UserInfo} from './gcp_api';

const GCP_OAUTH_CLIENT_ID =
    '946220775492-osi1dm2rhhpo4upm6qqfv9fiivv1qu6c.apps.googleusercontent.com';

type RefreshAccessTokenResponse = Readonly<{
  access_token: string; expires_in: number,
}>;

/**
 * Refreshes a GCP access token.
 *
 * @see https://developers.google.com/identity/protocols/oauth2/native-app#offline
 */
import {encodeFormData, HttpClient} from '../infrastructure/fetch';

export async function refreshGcpAccessToken(refreshToken: string): Promise<string> {
  const oAuthClient = new HttpClient('https://oauth2.googleapis.com/', {
    Host: 'oauth2.googleapis.com',
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  const data = {
    client_id: GCP_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };
  const encodedData = encodeFormData(data);
  const response = await oAuthClient.post<RefreshAccessTokenResponse>('token', encodedData);
  return response.access_token;
}

/**
 * Revokes a token.
 *
 * @see https://developers.google.com/identity/protocols/oauth2/native-app
 *
 * @param token - A refresh token or access token
 */
async function revokeGcpToken(token: string): Promise<void> {
  const authClient = new HttpClient('https://oauth2.googleapis.com/', {
    Host: 'oauth2.googleapis.com',
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  await authClient.get<void>(`revoke?token=${token}`);
}


/**
 * Gets the OpenID Connect profile information.
 *
 * For a list of the supported Google OpenID claims
 * @see https://accounts.google.com/.well-known/openid-configuration.
 *
 * The OpenID standard, including the "userinfo" response and core claims, is
 * defined in the links below:
 * @see https://openid.net/specs/openid-connect-core-1_0.html#UserInfoResponse
 * @see https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
 *
 * @param accessToken - An active access token with "email" scope
 */
export async function getUserInfo(accessToken: string): Promise<UserInfo> {
  const openIdConnectClient = new HttpClient('https://openidconnect.googleapis.com/v1/');
  return openIdConnectClient.get(`userinfo?access_token=${accessToken}`);
}
