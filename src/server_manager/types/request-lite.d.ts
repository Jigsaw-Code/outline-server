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

// TODO(dborkan): request-lite should be the same type as defined in the
// @types/request module.  We should re-use those typings if possible, or just
// use another lightweight request module with it's own @type supplied.
declare module 'request-lite' {
  function request(
      // tslint:disable-next-line:no-any
      url: string, callback: (error: Error, response: any, body: string) => void): void;
  namespace request {}
  export = request;
}
