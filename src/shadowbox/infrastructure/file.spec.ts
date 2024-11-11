/**
 * Copyright 2024 The Outline Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as fs from 'fs';
import * as tmp from 'tmp';
import * as file from './file';

describe('file', () => {
  tmp.setGracefulCleanup();

  describe('readFileIfExists', () => {
    let tmpFile: tmp.FileResult;

    beforeEach(() => (tmpFile = tmp.fileSync()));

    it('reads the file if it exists', () => {
      const contents = 'test';

      fs.writeFileSync(tmpFile.name, contents);

      expect(file.readFileIfExists(tmpFile.name)).toBe(contents);
    });

    it('reads the file if it exists and is empty', () => {
      fs.writeFileSync(tmpFile.name, '');

      expect(file.readFileIfExists(tmpFile.name)).toBe('');
    });

    it("returns null if file doesn't exist", () =>
      expect(file.readFileIfExists(tmp.tmpNameSync())).toBe(null));
  });

  describe('atomicWriteFileSync', () => {
    let tmpFile: tmp.FileResult;

    beforeEach(() => (tmpFile = tmp.fileSync()));

    it('writes to the file', () => {
      const contents = 'test';

      file.atomicWriteFileSync(tmpFile.name, contents);

      expect(fs.readFileSync(tmpFile.name, {encoding: 'utf8'})).toEqual(contents);
    });

    it('supports multiple simultaneous writes to the same file', async () => {
      const writeCount = 100;

      const writer = (_, id) =>
        new Promise<void>((resolve, reject) => {
          try {
            file.atomicWriteFileSync(
              tmpFile.name,
              `${fs.readFileSync(tmpFile.name, {encoding: 'utf-8'})}${id}\n`
            );
            resolve();
          } catch (e) {
            reject(e);
          }
        });

      await Promise.all(Array.from({length: writeCount}, writer));

      expect(fs.readFileSync(tmpFile.name, {encoding: 'utf8'}).trimEnd().split('\n').length).toBe(
        writeCount
      );
    });
  });
});
