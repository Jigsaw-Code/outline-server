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
import {TextFile} from '../model/text_file';

// Reads a text file if it exists, or null if the file is not found.
// Throws any other error except file not found.
export class FilesystemTextFile implements TextFile {
  constructor(private readonly filename: string) {}

  readFileSync(): string {
    return fs.readFileSync(this.filename, {encoding: 'utf8'});
  }

  writeFileSync(text: string): void {
    fs.writeFileSync(this.filename, text, {encoding: 'utf8'});
  }
}
