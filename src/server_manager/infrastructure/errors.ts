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

export class OutlineError extends Error {
  constructor(message?: string) {
    // ref:
    // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-2.html#support-for-newtarget
    super(message); // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = new.target.name;
  }
}

// Error thrown when a shadowbox server cannot be reached (e.g. due to Firewall)
export class UnreachableServerError extends OutlineError {
  constructor(message?: string) {
    super(message);
  }
}

// Error thrown when monitoring an installation that the user canceled.
export class ServerInstallCanceledError extends OutlineError {
  constructor(message?: string) {
    super(message);
  }
}

// Error thrown when server installation failed.
export class ServerInstallFailedError extends OutlineError {
  constructor(message?: string) {
    super(message);
  }
}

// Thrown when a Shadowbox API request fails.
export class ServerApiError extends OutlineError {
  constructor(message: string, public readonly response?: Response) {
    super(message);
  }

  // Returns true if no response was received, i.e. a network error was encountered.
  // Can be used to distinguish between client and server-side issues.
  isNetworkError() {
    return !this.response;
  }
}
