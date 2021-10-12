import * as fs from 'fs';
import * as file from './file';

const [TEMP_FILE_PATH, TEMP_FILE_CONTENTS] = ['./.tmp', ''];

describe('file', () => {
  describe('readFileIfExists', () => {
    it('reads the file if it exists', () => {
      fs.writeFileSync(TEMP_FILE_PATH, TEMP_FILE_CONTENTS);

      expect(file.readFileIfExists(TEMP_FILE_PATH)).toBe(TEMP_FILE_CONTENTS);

      fs.unlinkSync(TEMP_FILE_PATH);
    });

    it('returns null if file doesn\'t exist',
       () => expect(file.readFileIfExists(TEMP_FILE_PATH)).toBe(null));
  });

  describe('atomicWriteFileSync', () => {
    beforeEach(() => fs.writeFileSync(TEMP_FILE_PATH, TEMP_FILE_CONTENTS));
    afterEach(() => fs.unlinkSync(TEMP_FILE_PATH));

    it('writes to the file', () => {
      const contents = 'test';

      file.atomicWriteFileSync(TEMP_FILE_PATH, contents);

      expect(fs.readFileSync(TEMP_FILE_PATH, {encoding: 'utf8'})).toEqual(contents);
    });

    it('supports multiple simultaneous writes to the same file', async () => {
      const writeCount = 100;

      const writer = (_, id) => new Promise<void>((resolve, reject) => {
        try {
          file.atomicWriteFileSync(
              TEMP_FILE_PATH, `${fs.readFileSync(TEMP_FILE_PATH, {encoding: 'utf-8'})}${id}\n`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });

      await Promise.all(Array.from({length: writeCount}, writer));

      expect(fs.readFileSync(TEMP_FILE_PATH, {encoding: 'utf8'}).trimEnd().split('\n').length)
          .toBe(writeCount);
    });
  });
});
