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

import * as i18n from './i18n_formatting';

describe('makeUnitFormatter', () => {
  it('creates the correct formatter', () => {
    const english = i18n.makeUnitFormatter('gigabyte', 'en');
    expect(english.format(10)).toEqual('10 GB');

    const french = i18n.makeUnitFormatter('terabyte', 'fr');
    expect(french.format(1.5)).toEqual('1,5 To');

    const farsi = i18n.makeUnitFormatter('megabyte', 'fa');
    expect(farsi.format(133.5)).toEqual('۱۳۳٫۵ مگابایت');
  });
});

describe('formattedUnit', () => {
  it('extracts the unit string', () => {
    const english = i18n.formattedUnit('megabyte', 'en');
    expect(english).toEqual('MB');

    const french = i18n.formattedUnit('terabyte', 'fr');
    expect(french).toEqual('To');

    const farsi = i18n.formattedUnit('megabyte', 'fa');
    expect(farsi).toEqual('مگابایت');
  });
});
