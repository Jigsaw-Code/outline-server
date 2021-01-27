/*
  Copyright 2020 The Outline Authors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import * as i18n from './data_formatting';

describe('formatBytesParts', () => {
  if (process?.versions?.node) {
    it('doesn\'t run on Node', () => {
      expect(() => i18n.formatBytesParts(0, 'en')).toThrow();
    });
  } else {
    it('extracts the unit string and value separately', () => {
      const english = i18n.formatBytesParts(0, 'en');
      expect(english.unit).toEqual('B');
      expect(english.value).toEqual('0');
      
      const spanish = i18n.formatBytesParts(2, 'es');
      expect(spanish.unit).toEqual('B');
      expect(spanish.value).toEqual('2');

      const russian = i18n.formatBytesParts(3000, 'ru');
      expect(russian.unit).toEqual('кБ');
      expect(russian.value).toEqual('3');

      const french = i18n.formatBytesParts(1.5 * 10 ** 9, 'fr');
      expect(french.unit).toEqual('Go');
      expect(french.value).toEqual('1,5');

      const farsi = i18n.formatBytesParts(133.5 * 10 ** 6, 'fa');
      expect(farsi.unit).toEqual('مگابایت');
      expect(farsi.value).toEqual('۱۳۳٫۵');
    });
  }
});

describe('formatBytes', () => {
  if (process?.versions?.node) {
    it('doesn\'t run on Node', () => {
      expect(() => i18n.formatBytes(0, 'en')).toThrow();
    });
  } else {
    it('Formats data amounts', () => {
      expect(i18n.formatBytes(10 * 10 ** 9, 'en')).toEqual('10 GB');
      expect(i18n.formatBytes(1.5 * 10 ** 6, 'es')).toEqual('1,5 MB');
      expect(i18n.formatBytes(2.35 * 10 ** 12, 'ru')).toEqual('2,35 ТБ');
    });

    it('Omits trailing zero decimal digits', () => {
      expect(i18n.formatBytes(10 ** 12, 'en')).toEqual('1 TB');
    });
  }
});
