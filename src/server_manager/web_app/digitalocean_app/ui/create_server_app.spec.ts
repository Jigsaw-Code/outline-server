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

import {DigitalOceanCreateServerApp} from "./create_server_app";
import {FakeDigitalOceanAccount} from "../../../model/test_helpers";
import {DigitalOceanStatus} from "../../../model/account";
import {sleep} from "../../../infrastructure/sleep";

describe('DigitalOceanCreateServerApp', () => {
  it('shows billing page when account has invalid billing information', async () => {
    const app = document.createElement('digitalocean-create-server-app') as DigitalOceanCreateServerApp;
    const account = new FakeDigitalOceanAccount(DigitalOceanStatus.INVALID_BILLING);
    app.start(account);
    sleep(2000);
    expect(app.currentPage).toEqual('enterBilling');
  });

  it('shows email verification page when account has not verified email address', async () => {
    const app = document.createElement('digitalocean-create-server-app') as DigitalOceanCreateServerApp;
    const account = new FakeDigitalOceanAccount(DigitalOceanStatus.EMAIL_NOT_VERIFIED);
    app.start(account);
    sleep(2000);
    expect(app.currentPage).toEqual('verifyEmail');
  });
});
