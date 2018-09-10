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

import * as fs from 'fs';

import * as file_read from './file_read';
import * as logging from './logging';

export interface JsonConfig<T> {
  data(): T;
  write();
}

export function loadFileConfig<T>(filename: string): JsonConfig<T> {
  const text = file_read.readFileIfExists(filename);
  let dataJson = {} as T;
  if (text) {
    try {
      dataJson = JSON.parse(text) as T;
    } catch (error) {
      logging.error(`Failed to parse config ${filename}: ${error}`);
    }
  }
  return new FileConfig<T>(filename, dataJson);
}


export class FileConfig<T> implements JsonConfig<T> {
  constructor(private filename: string, private dataJson: T) {}

  data(): T {
    return this.dataJson;
  }

  write() {
    // Write to temporary file, then move that temporary file to the
    // persistent location, to avoid accidentally breaking the stats file.
    // Use *Sync calls for atomic operations, to guard against corrupting
    // these files.
    const tempFilename = `${this.filename}.${Date.now()}`;
    try {
      fs.writeFileSync(tempFilename, JSON.stringify(this.dataJson), {encoding: 'utf8'});
      fs.renameSync(tempFilename, this.filename);
    } catch (error) {
      logging.error(`Error writing config ${this.filename} ${error}`);
    }
  }
}

export class ChildConfig<T> implements JsonConfig<T> {
  constructor(private parentConfig: JsonConfig<{}>, private dataJson: T) {}
  data(): T {
    return this.dataJson;
  }
  write() {
    this.parentConfig.write();
  }
}

export class DelayedConfig<T> implements JsonConfig<T> {
  private dirty = false;
  constructor(private config: JsonConfig<T>, writePeriodMs: number) {
    setInterval(() => {
      if (!this.dirty) {
        return;
      }
      this.write();
      this.dirty = false;
    }, writePeriodMs);
  }
  data(): T {
    return this.config.data();
  }
  write() {
    this.dirty = false;
  }
}

// JsonConfig that writes to a member variable. Useful for testing.
export class InMemoryConfig<T> implements JsonConfig<T> {
  public written: T;
  constructor(private dataJson: T) {
    this.written = this.dataJson;
  }
  data(): T {
    return this.dataJson;
  }
  write() {
    this.written = JSON.parse(JSON.stringify(this.dataJson));
  }
}
