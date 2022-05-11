// Copyright 2022 The Outline Authors
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

import * as errors from '../infrastructure/errors';
import {HttpRequest, HttpResponse} from '../electron_app/http/types';

async function fetchWrapper(request: HttpRequest): Promise<HttpResponse> {
  const response = await fetch(request.url, request);
  return {
    status: response.status,
    body: await response.text(),
  };
}

// A Fetcher provides the HTTP client functionality for PathApi.
export type Fetcher = typeof fetchWrapper;

/**
 * @param fingerprint A SHA-256 hash of the expected leaf certificate, in binary encoding.
 * @returns An HTTP client that enforces `fingerprint`, if set.
 */
function makeFetcher(fingerprint?: string): Fetcher {
  if (fingerprint) {
    return (request) => fetchWithPin(request, fingerprint);
  }
  return fetchWrapper;
}

/**
 * @param base A valid URL
 * @param fingerprint A SHA-256 hash of the expected leaf certificate, in binary encoding.
 * @returns A fully initialized API client.
 */
export function makePathApiClient(base: string, fingerprint?: string): PathApiClient {
  return new PathApiClient(base, makeFetcher(fingerprint));
}

/**
 * Provides access to an HTTP API of the kind exposed by the Shadowbox server.
 *
 * An API is defined by a `base` URL, under which all endpoints are defined.
 * Request bodies are JSON, HTML-form data, or empty.  Response bodies are
 * JSON or empty.
 *
 * If a fingerprint is set, requests are proxied through Node.JS to enable
 * certificate pinning.
 */
export class PathApiClient {
  /**
   * @param base A valid URL
   * @param fingerprint A SHA-256 hash of the expected leaf certificate, in binary encoding.
   */
  constructor(public readonly base: string, public readonly fetcher: Fetcher) {}

  /**
   * Makes a request relative to the base URL with a JSON body.
   *
   * @param path Relative path (no initial '/')
   * @param method HTTP method
   * @param body JSON-compatible object
   * @returns Response body (JSON or void)
   */
  async requestJson<T>(path: string, method: string, body: object): Promise<T> {
    return this.request(path, method, 'application/json', JSON.stringify(body));
  }

  /**
   * Makes a request relative to the base URL with an HTML-form style body.
   *
   * @param path Relative path (no initial '/')
   * @param method HTTP method
   * @param params Form data to send
   * @returns Response body (JSON or void)
   */
  async requestForm<T>(path: string, method: string, params: Record<string, string>): Promise<T> {
    const body = new URLSearchParams(params);
    return this.request(path, method, 'application/x-www-form-urlencoded', body.toString());
  }

  /**
   * Makes a request relative to the base URL.
   *
   * @param path Relative path (no initial '/')
   * @param method HTTP method
   * @param contentType Content-Type header value
   * @param body Request body
   * @returns Response body (JSON or void)
   */
  async request<T>(path: string, method = 'GET', contentType?: string, body?: string): Promise<T> {
    let base = this.base;
    if (!base.endsWith('/')) {
      base += '/';
    }
    const url = base + path;
    const request: HttpRequest = {url, method};
    if (contentType) {
      request.headers = {'Content-Type': contentType};
    }
    if (body) {
      request.body = body;
    }
    let response: HttpResponse;
    try {
      response = await this.fetcher(request);
    } catch (e) {
      throw new errors.ServerApiError(
        `API request to ${path} failed due to network error: ${e.message}`
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new errors.ServerApiError(
        `API request to ${path} failed with status ${response.status}`,
        response
      );
    }
    if (!response.body) {
      return;
    }
    // Assume JSON and unsafe cast to `T`.
    return JSON.parse(response.body);
  }
}
