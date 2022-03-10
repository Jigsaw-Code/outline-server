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

export function asciiToHex(text: string) {
  // Assumes that text is no more than 8 bits per char, i.e. no unicode.
  const hexBytes: string[] = [];
  for (let i = 0; i < text.length; ++i) {
    const charCode = text.charCodeAt(i);
    if (charCode > 0xff) {
      // Consider supporting non-ascii characters:
      // http://monsur.hossa.in/2012/07/20/utf-8-in-javascript.html
      throw new Error(`Cannot encode wide character with value ${charCode}`);
    }
    hexBytes.push(('0' + charCode.toString(16)).slice(-2));
  }
  return hexBytes.join('');
}

export function hexToString(hexString: string) {
  const bytes: string[] = [];
  if (hexString.length % 2 !== 0) {
    throw new Error('hexString has odd length, ignoring: ' + hexString);
  }
  for (let i = 0; i < hexString.length; i += 2) {
    const hexByte = hexString.slice(i, i + 2);
    bytes.push(String.fromCharCode(parseInt(hexByte, 16)));
  }
  return bytes.join('');
}
