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

// Utility functions for internationalizing numbers and units

const TERABYTE = 10 ** 12;
const GIGABYTE = 10 ** 9;
const MEGABYTE = 10 ** 6;
const KILOBYTE = 10 ** 3;

interface FormatParams {
  value: number;
  unit: 'terabyte'|'gigabyte'|'megabyte'|'kilobyte'|'byte';
  decimalPlaces: number;
}

function getDataFormattingParams(numBytes: number): FormatParams {
  if (numBytes >= TERABYTE) {
    return {value: numBytes / TERABYTE, unit: 'terabyte', decimalPlaces: 2};
  } else if (numBytes >= GIGABYTE) {
    return {value: numBytes / GIGABYTE, unit: 'gigabyte', decimalPlaces: 2};
  } else if (numBytes >= MEGABYTE) {
    return {value: numBytes / MEGABYTE, unit: 'megabyte', decimalPlaces: 1};
  } else if (numBytes >= KILOBYTE) {
    return {value: numBytes / KILOBYTE, unit: 'kilobyte', decimalPlaces: 0};
  }
  return {value: numBytes, unit: 'byte', decimalPlaces: 0};
}

function makeUnitFormatter(language: string, params: FormatParams) {
  const options: Intl.NumberFormatOptions = {
    style: 'unit',
    unit: params.unit,
    unitDisplay: 'short',
    maximumFractionDigits: params.decimalPlaces
  };
  const out = new Intl.NumberFormat(language, options);
  return out;
}

export function getFormattedDataAmountParts(amount: number, language: string) {
  const params = getDataFormattingParams(amount);
  const parts = makeUnitFormatter(language, params).formatToParts(params.value);
  const isUnit = (part: Intl.NumberFormatPart) => (part as {type: string}).type === 'unit';
  const unitText = parts.find(isUnit).value;
  return {
    value: parts.filter((part) => !isUnit(part)).map(part => part.value).join('').trim(),
    // Special case for "byte", since we'd rather be consistent with "KB", etc.  "byte" is
    // presumably used due to the example in the Unicode standard,
    // http://unicode.org/reports/tr35/tr35-general.html#Example_Units
    unit: unitText === 'byte' ? 'B' : unitText
  };
}

export function formatBytes(numBytes: number, language: string) {
  const params = getDataFormattingParams(numBytes);
  return makeUnitFormatter(language, params).format(params.value);
}
