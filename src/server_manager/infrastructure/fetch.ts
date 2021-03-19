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

export class HttpError extends Error {
  constructor(private statusCode: number, message?: string) {
    super(message);
  }

  getStatusCode(): number {
    return this.statusCode;
  }
}

export class HttpClient {
  private readonly customHeaders = new Headers();

  constructor(private readonly baseUrl: string, private headers?: Map<string, string>) {
    // Add trailing slash (if missing)
    this.baseUrl = baseUrl.replace(/\/?$/, '/');
    headers.forEach((value, key) => {
      this.customHeaders.append(key, value);
    });
  }

  setAuthorizationHeader(value: string): void {
    this.customHeaders.set('Authorization', value);
  }

  async get<T>(path: string): Promise<T> {
    return await this.request<T>(path, 'GET', undefined);
  }

  async post<T>(path: string, data?: {}): Promise<T> {
    return await this.request<T>(path, 'POST', data);
  }

  async put<T>(path: string, data?: {}): Promise<T> {
    return await this.request<T>(path, 'PUT', data);
  }

  async delete<T>(path: string): Promise<T> {
    return await this.request<T>(path, 'DELETE', undefined);
  }

  // tslint:disable-next-line:no-any
  private async request<T>(path: string, method: string, data?: any):
      Promise<T> {
    const url = `${this.baseUrl}${path}`;
    console.debug(`Request: ${url}`);
    console.debug(`Headers: ${JSON.stringify(this.headers)}`);
    console.debug(`Body: ${JSON.stringify(data)}`);

    // TODO: More robust handling of data types
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    const response = await fetch(url, {
      method: method.toUpperCase(),
      headers: this.customHeaders,
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
