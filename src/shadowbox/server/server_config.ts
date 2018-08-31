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

import * as logging from '../infrastructure/logging';
import {TextFile} from '../model/text_file';

export class ServerConfig {
  public serverId: string;
  private metricsEnabled = false;
  private name: string;
  private createdTimestampMs: number;  // Created timestamp in UTC milliseconds.

  constructor(private configFile: TextFile, defaultName?: string) {
    // Initialize from filename if possible.
    const configText = this.configFile.readFileSync();
    if (configText) {
      try {
        const savedState = JSON.parse(configText);
        if (savedState.serverId) {
          this.serverId = savedState.serverId;
        }
        if (savedState.metricsEnabled) {
          this.metricsEnabled = savedState.metricsEnabled;
        }
        if (savedState.name) {
          this.name = savedState.name;
        }
        if (savedState.createdTimestampMs) {
          this.createdTimestampMs = savedState.createdTimestampMs;
        }
      } catch (err) {
        logging.error(`Error parsing config ${err}`);
      }
    }

    // Initialize to default values if file missing or not valid.
    let dirty = false;
    if (!this.serverId) {
      this.serverId = uuidv4();
      dirty = true;
    }
    if (!this.name && defaultName) {
      this.name = defaultName;
      dirty = true;
    }
    if (!this.createdTimestampMs) {
      this.createdTimestampMs = Date.now();
      dirty = true;
    }
    if (dirty) {
      this.writeFile();
    }
  }

  private writeFile(): void {
    const state = JSON.stringify({
      serverId: this.serverId,
      metricsEnabled: this.metricsEnabled,
      name: this.name,
      createdTimestampMs: this.createdTimestampMs
    });
    this.configFile.writeFileSync(state);
  }

  public getMetricsEnabled(): boolean {
    return this.metricsEnabled;
  }

  public setMetricsEnabled(newValue: boolean): void {
    if (newValue !== this.metricsEnabled) {
      this.metricsEnabled = newValue;
      this.writeFile();
    }
  }

  public getName(): string {
    return this.name || 'Outline Server';
  }

  public setName(newValue: string): void {
    if (newValue !== this.name) {
      this.name = newValue;
      this.writeFile();
    }
  }

  public getCreatedTimestampMs(): number {
    return this.createdTimestampMs;
  }
}
