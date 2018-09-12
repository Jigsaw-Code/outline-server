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

import * as uuidv4 from 'uuid/v4';

import * as json_config from '../infrastructure/json_config';

// Serialized format for the server config.
// WARNING: Renaming fields will break backwards-compatibility.
export interface ServerConfigJson {
  serverId: string;
  metricsEnabled: boolean;
  name: string;
  createdTimestampMs: number;
}

export function readServerConfig(filename: string): json_config.JsonConfig<ServerConfigJson> {
  try {
    const config = json_config.loadFileConfig<ServerConfigJson>(filename);
    config.data().serverId = config.data().serverId || uuidv4();
    config.data().createdTimestampMs = config.data().createdTimestampMs || Date.now();
    config.data().metricsEnabled = config.data().metricsEnabled || false;
    config.write();
    return config;
  } catch (error) {
    throw new Error(`Failed to read server config at ${filename}: ${error}`);
  }
}
