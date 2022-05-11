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

// This file is imported by both the Electron and Renderer process code,
// so it cannot contain any imports that are not available in both
// environments.

// These type definitions are designed to bridge the differences between
// the Fetch API and the Node.JS HTTP API, while also being compatible
// with the Structured Clone algorithm so that they can be passed between
// the Electron and Renderer processes.

export interface HttpRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  body?: string;
}
