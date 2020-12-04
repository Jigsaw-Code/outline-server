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

import {sleep} from "../../../infrastructure/sleep";
import {KeyValueStorage} from "../../../infrastructure/key_value_storage";
import {DigitalOceanCloud, PersistedAccount} from "../model/cloud";
import {FAKE_SHADOWBOX_SETTINGS, mockDigitalOceanOauth} from "../../../model/test_helpers";
import {EventEmitter} from "eventemitter3";

import {DigitalOceanConnectAccountApp} from "./connect_account_app";

describe('DigitalOceanConnectAccountApp', () => {
  xit('fires account connected event on successful OAuth flow',
     async () => {
       const digitalOceanStorage = new KeyValueStorage<PersistedAccount, string>(
           'testing/accounts/digitalocean', localStorage, (entry: PersistedAccount) => entry.id);
       const digitalOceanCloud = new DigitalOceanCloud(new EventEmitter(), FAKE_SHADOWBOX_SETTINGS, digitalOceanStorage);
       mockDigitalOceanOauth('fake-personal-access-token');

       let onAccountConnectedCalled = false;
       document.addEventListener(DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECTED, () => {
         onAccountConnectedCalled = true;
       });

       const app = document.createElement('digitalocean-connect-account-app') as DigitalOceanConnectAccountApp;
       app.cloud = digitalOceanCloud;
       await app.start();
       sleep(2000);
       expect(onAccountConnectedCalled).toEqual(true);
     });
});
