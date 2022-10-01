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

// Definitions missing from @types/node.

// Reference: https://nodejs.org/api/dns.html
declare module 'dns' {
  export function getServers(): string[];
}

// https://nodejs.org/dist/latest-v8.x/docs/api/child_process.html#child_process_child_process_exec_command_options_callback
declare module 'child_process' {
  export interface ExecError {
    code: number;
  }
  export function exec(
    command: string,
    callback?: (error: ExecError | undefined, stdout: string, stderr: string) => void
  ): ChildProcess;
}
