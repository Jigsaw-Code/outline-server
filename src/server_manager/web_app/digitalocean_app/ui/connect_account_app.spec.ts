// Copyright 2020 The Outline Authors
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

import {EventEmitter} from 'eventemitter3';

import {KeyValueStorage} from '../../../infrastructure/key_value_storage';
import {FAKE_SHADOWBOX_SETTINGS, makeLocalize, mockDigitalOceanOauth} from '../../../model/test_helpers';
import {DigitalOceanCloud, PersistedAccount} from '../model/cloud';

import {DigitalOceanConnectAccountApp} from './connect_account_app';
import {sleep} from "../../../infrastructure/sleep";

beforeAll(async () => {
  const loadDigitalOceanConnectAccountApp = new DigitalOceanConnectAccountApp();

  document.body.innerHTML = '<digitalocean-connect-account-app id="digitalOceanConnectAccountApp" language="en"></digitalocean-connect-account-app>';
  const app = document.getElementById('digitalOceanConnectAccountApp') as unknown as DigitalOceanConnectAccountApp;
  app.localize = await makeLocalize('en');
});

describe('DigitalOceanConnectAccountApp', () => {
  xit('fires account connected event on successful OAuth flow', async () => {
    mockDigitalOceanOauth('fake-personal-access-token', false, 0);

    const app = document.getElementById('digitalOceanConnectAccountApp') as unknown as DigitalOceanConnectAccountApp;
    let onAccountConnectedCalled = false;
    app.addEventListener('digitalocean-account-connected', () => onAccountConnectedCalled = true);
    app.cloud = createDigitalOceanCloud();

    app.start();
    await sleep(200);
    expect(onAccountConnectedCalled).toEqual(true);
  });

  it('fires account connect cancelled event on OAuth cancelled', async () => {
    mockDigitalOceanOauth('fake-personal-access-token', true);

    const app = document.getElementById('digitalOceanConnectAccountApp') as unknown as DigitalOceanConnectAccountApp;
    let onAccountConnectCancelled = false;
    app.addEventListener(DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECT_CANCELLED, () => onAccountConnectCancelled = true);
    app.cloud = createDigitalOceanCloud();

    await app.start();
    expect(onAccountConnectCancelled).toEqual(true);
  });
});

function createDigitalOceanCloud() {
  const digitalOceanStorage = new KeyValueStorage<PersistedAccount, string>(
      'testing/accounts/digitalocean', localStorage, (entry: PersistedAccount) => entry.id);
  return new DigitalOceanCloud(new EventEmitter(), FAKE_SHADOWBOX_SETTINGS, digitalOceanStorage);
}
