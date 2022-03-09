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

import fetch, {RequestInit, Response} from 'node-fetch';

// Makes an http(s) request, and follows any redirect with the same request
// without changing the request method or body.  This is used because typical
// http(s) clients follow redirects for POST/PUT/DELETE requests by changing the
// method to GET and removing the request body.  The options parameter matches the
// fetch() function.
export async function requestFollowRedirectsWithSameMethodAndBody(
  url: string,
  options: RequestInit
): Promise<Response> {
  // Make a copy of options to modify parameters.
  const manualRedirectOptions = {
    ...options,
    redirect: 'manual' as RequestRedirect,
  };
  let response: Response;
  for (let i = 0; i < 10; i++) {
    response = await fetch(url, manualRedirectOptions);
    if (response.status >= 300 && response.status < 400) {
      url = response.headers.get('location');
    } else {
      break;
    }
  }
  return response;
}
