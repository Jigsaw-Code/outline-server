import * as fs from 'fs';
import * as tmp from 'tmp';
import * as file from './file';

describe('file', () => {
  tmp.setGracefulCleanup();

  describe('readFileIfExists', () => {
    let tmpFile: tmp.FileResult;

    beforeEach(() => tmpFile = tmp.fileSync());

    it('reads the file if it exists', () => {
      const TEST_CONTENTS = 'test';

      fs.writeFileSync(tmpFile.name, TEST_CONTENTS);

      expect(file.readFileIfExists(tmpFile.name)).toBe(TEST_CONTENTS);
    });

    it('reads the file if it exists and is empty', () => {
      fs.writeFileSync(tmpFile.name, '');

      expect(file.readFileIfExists(tmpFile.name)).toBe('');
    });

    it('returns null if file doesn\'t exist',
       () => expect(file.readFileIfExists(tmp.tmpNameSync())).toBe(null));
  });

  describe('atomicWriteFileSync', () => {
    let tmpFile: tmp.FileResult;

    beforeEach(() => tmpFile = tmp.fileSync());

    it('writes to the file', () => {
      const TEST_CONTENTS = 'test';

      file.atomicWriteFileSync(tmpFile.name, TEST_CONTENTS);

      expect(fs.readFileSync(tmpFile.name, {encoding: 'utf8'})).toEqual(TEST_CONTENTS);
    });

    it('supports multiple simultaneous writes to the same file', async () => {
      const TEST_WRITE_COUNT = 100;

      const writer = (_, id) => new Promise<void>((resolve, reject) => {
        try {
          file.atomicWriteFileSync(
              tmpFile.name, `${fs.readFileSync(tmpFile.name, {encoding: 'utf-8'})}${id}\n`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      await Promise.all(Array.from({length: TEST_WRITE_COUNT}, writer));

      expect(fs.readFileSync(tmpFile.name, {encoding: 'utf8'}).trimEnd().split('\n').length)
          .toBe(TEST_WRITE_COUNT);
    });
  });
});
