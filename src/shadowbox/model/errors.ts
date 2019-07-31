// Copyright 2019 The Outline Authors
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

class ShadowboxError extends Error {
  constructor(message: string) {
    super(message);
    // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidPortNumber extends ShadowboxError {
  // Since this is the error when a non-numeric value is passed to `port`, it takes type `any`.
  // tslint:disable-next-line: no-any
  constructor(public port: any) {
    super(`Outline needs an integer port number between 1 and 65535.  Instead got ${port}.`);
  }
}

export class PortInUse extends ShadowboxError {
  constructor(public port: number) {
    super(`Attempted to start an Outline server on port ${port}, which is already in use.`);
  }
}
