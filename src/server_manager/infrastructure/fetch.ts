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

import {HttpError} from './errors';

export class HttpClient {
  static readonly DEFAULT_HEADERS = {
    'Content-type': 'application/json',
    Accept: 'application/json',
  };

  constructor(private readonly baseUrl: string, private headers: {} = HttpClient.DEFAULT_HEADERS) {
    // Add trailing slash (if missing)
    this.baseUrl = baseUrl.replace(/\/?$/, '/');
  }

  async get<T>(path: string, headers?: {}): Promise<T> {
    return await this.request<T>(path, 'GET', undefined, headers);
  }

  async post<T>(path: string, data?: {}, headers?: {}): Promise<T> {
    return await this.request<T>(path, 'POST', data, headers);
  }

  async put<T>(path: string, data?: {}, headers?: {}): Promise<T> {
    return await this.request<T>(path, 'PUT', data, headers);
  }

  async delete<T>(path: string, headers?: {}): Promise<T> {
    return await this.request<T>(path, 'DELETE', undefined, headers);
  }

  // tslint:disable-next-line:no-any
  private async request<T>(path: string, method: string, data?: any, customHeaders?: {}):
      Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      ...this.headers,
      ...customHeaders,
    };

    console.debug(`Request: ${url}`);
    console.debug(`Headers: ${JSON.stringify(headers)}`);
    console.debug(`Body: ${JSON.stringify(data)}`);

    // TODO: More robust handling of data types
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      ...(data && {body: data}),
    });

    console.debug(`Status: ${response.statusText} (${response.status})`);
    if (!response.ok) {
      console.debug(`Text: ${await response.text()}`);
      throw new HttpError(response.status, response.statusText);
    }

    try {
      let result = undefined;
      if (response.status !== 204) {
        result = await response.json();
        console.debug(`Response: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (e) {
      throw new Error('Error parsing response body: ' + JSON.stringify(e));
    }
  }
}

export function encodeFormData(data: object): string {
  return Object.entries(data)
      .map(entry => {
        return encodeURIComponent(entry[0]) + '=' + encodeURIComponent(entry[1]);
      })
      .join('&');
}
