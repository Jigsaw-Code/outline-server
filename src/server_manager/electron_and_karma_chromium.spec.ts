// Copyright 2021 The Outline Authors
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

import {electronToChromium} from 'electron-to-chromium';
// Since we aren't in the electron process, process.versions.electron isn't defined.
import {version as electronVersion} from 'electron/package.json';
import fetch from 'node-fetch';

import {config} from './package.json';

describe('Karma', () => {
  it('uses the correct Chromium version', async (done) => {
    // Omaha Proxy is a service maintained by the Chrome team which serves metadata about current
    // and legacy Chrome versions.
    const electronChromiumVersionInfo = await (
      await fetch(
        `http://omahaproxy.appspot.com/deps.json?version=${electronToChromium(electronVersion)}`
      )
    ).json();
    const electronChromeRevision = electronChromiumVersionInfo.chromium_base_position;
    expect(electronChromeRevision).toEqual(config.PUPPETEER_CHROMIUM_REVISION);
    done();
  });
});
