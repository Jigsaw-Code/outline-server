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


function makeLogMessage(level: string, message: string): string {
  // This creates a string in the UTC timezone
  // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
  return `${level}:${new Date().toISOString()}] ${message}`;
}

export function error(message: string) {
  console.error(makeLogMessage('E', message));
}

export function warn(message: string) {
  console.warn(makeLogMessage('W', message));
}

export function info(message: string) {
  console.info(makeLogMessage('I', message));
}

export function debug(message: string) {
  console.info(makeLogMessage('D', message));
}
