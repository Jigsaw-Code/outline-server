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

// Reads a text file if it exists, or null if the file is not found.
// Throws any other error except file not found.
export function readFileIfExists(filename: string): string {
  try {
    return fs.readFileSync(filename, {encoding: 'utf8'}) ?? null;
  } catch (err) {
    // err.code will be 'ENOENT' if the file is not found, this is expected.
    if (err.code === 'ENOENT') {
      return null;
    } else {
      throw err;
    }
  }
}

// Write to temporary file, then move that temporary file to the
// persistent location, to avoid accidentally breaking the metrics file.
// Use *Sync calls for atomic operations, to guard against corrupting
// these files.
export function atomicWriteFileSync(filename: string, filebody: string) {
  const tempFilename = `${filename}.${Date.now()}`;
  fs.writeFileSync(tempFilename, filebody, {encoding: 'utf8'});
  fs.renameSync(tempFilename, filename);
}
