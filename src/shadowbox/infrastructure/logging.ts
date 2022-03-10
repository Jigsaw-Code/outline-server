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

import * as path from 'path';

interface Callsite {
  getLineNumber(): number;
  getFileName(): string;
}

// Returns the Callsite object of the caller.
// This relies on the V8 stack trace API: https://github.com/v8/v8/wiki/Stack-Trace-API
function getCallsite(): Callsite {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => {
    return stack;
  };
  const error = new Error();
  Error.captureStackTrace(error, getCallsite);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = error.stack as any as Callsite[];
  Error.prepareStackTrace = originalPrepareStackTrace;
  return stack[1];
}

// Possible values for the level prefix.
type LevelPrefix = 'E' | 'W' | 'I' | 'D';

// Formats the log message. Example:
// I2018-08-16T16:46:21.577Z 167288 main.js:86] ...
function makeLogMessage(level: LevelPrefix, callsite: Callsite, message: string): string {
  // This creates a string in the UTC timezone
  // See
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
  const timeStr = new Date().toISOString();
  // TODO(alalama): preserve the source file structure in the webpack build so we can use
  // `callsite.getFileName()`.
  return `${level}${timeStr} ${process.pid} ${path.basename(
    callsite.getFileName() || __filename
  )}:${callsite.getLineNumber()}] ${message}`;
}

export function error(message: string) {
  console.error(makeLogMessage('E', getCallsite(), message));
}

export function warn(message: string) {
  console.warn(makeLogMessage('W', getCallsite(), message));
}

export function info(message: string) {
  console.info(makeLogMessage('I', getCallsite(), message));
}

export function debug(message: string) {
  console.debug(makeLogMessage('D', getCallsite(), message));
}
