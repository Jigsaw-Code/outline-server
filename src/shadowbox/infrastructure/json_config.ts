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

import * as file from './file';
import * as logging from './logging';

export interface JsonConfig<T> {
  // Returns a reference (*not* a copy) to the json object backing the config.
  data(): T;
  // Writes the config to the backing storage.
  write();
}

export function loadFileConfig<T>(filename: string): JsonConfig<T> {
  const text = file.readFileIfExists(filename);
  let dataJson = {} as T;
  if (text) {
    dataJson = JSON.parse(text) as T;
  }
  return new FileConfig<T>(filename, dataJson);
}

// FileConfig is a JsonConfig backed by a filesystem file.
export class FileConfig<T> implements JsonConfig<T> {
  constructor(private filename: string, private dataJson: T) {}

  data(): T {
    return this.dataJson;
  }

  write() {
    try {
      file.atomicWriteFileSync(this.filename, JSON.stringify(this.dataJson));
    } catch (error) {
      // TODO: Stop swallowing the exception and handle it in the callers.
      logging.error(`Error writing config ${this.filename} ${error}`);
    }
  }
}

// ChildConfig is a JsonConfig backed by another config.
export class ChildConfig<T> implements JsonConfig<T> {
  constructor(private parentConfig: JsonConfig<{}>, private dataJson: T) {}

  data(): T {
    return this.dataJson;
  }

  write() {
    this.parentConfig.write();
  }
}

// DelayedConfig is a JsonConfig that only writes the data in a periodic time interval.
// Calls to write() will mark the data as "dirty" for the next inverval.
export class DelayedConfig<T> implements JsonConfig<T> {
  private dirty = false;
  constructor(private config: JsonConfig<T>, writePeriodMs: number) {
    // This repeated call will never be cancelled until the execution is terminated.
    setInterval(() => {
      if (!this.dirty) {
        return;
      }
      this.config.write();
      this.dirty = false;
    }, writePeriodMs);
  }

  data(): T {
    return this.config.data();
  }

  write() {
    this.dirty = true;
  }
}

// InMemoryConfig is a JsonConfig backed by an internal member variable. Useful for testing.
export class InMemoryConfig<T> implements JsonConfig<T> {
  // Holds the data JSON as it was when `write()` was called.
  public mostRecentWrite: T;
  constructor(private dataJson: T) {
    this.mostRecentWrite = this.dataJson;
  }

  data(): T {
    return this.dataJson;
  }

  write() {
    this.mostRecentWrite = JSON.parse(JSON.stringify(this.dataJson));
  }
}
