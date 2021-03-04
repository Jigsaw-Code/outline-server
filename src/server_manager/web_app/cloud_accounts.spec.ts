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

import {InMemoryStorage} from '../infrastructure/memory_storage';

import {AccountJson, CloudAccounts} from './cloud_accounts';
import {FakeDigitalOceanAccount, FakeGcpAccount} from "./testing/models";

const FAKE_ACCOUNTS_JSON = [
  {
    digitalocean: {
      accessToken: 'fake-access-token',
    }
  },
  {
    gcp: {
      refreshToken: 'fake-refresh-token',
    }
  }
];

describe('CloudAccounts', () => {
  it('get account methods return null when no cloud accounts are connected', () => {
    const cloudAccounts = createCloudAccount();
    cloudAccounts.load();
    expect(cloudAccounts.getDigitalOceanAccount()).toBeNull();
    expect(cloudAccounts.getGcpAccount()).toBeNull();
  });

  it('load connects account that exist in local storage', () => {
    const storage = createInMemoryStorage(FAKE_ACCOUNTS_JSON);
    const cloudAccounts = createCloudAccount(storage);
    cloudAccounts.load();
    expect(cloudAccounts.getDigitalOceanAccount()).not.toBeNull();
    expect(cloudAccounts.getGcpAccount()).not.toBeNull();
  });

  it('connects accounts when connect methods are invoked', () => {
    const cloudAccounts = createCloudAccount();
    cloudAccounts.load();

    expect(cloudAccounts.getDigitalOceanAccount()).toBeNull();
    cloudAccounts.connectDigitalOceanAccount('fake-access-token');
    expect(cloudAccounts.getDigitalOceanAccount()).not.toBeNull();

    expect(cloudAccounts.getGcpAccount()).toBeNull();
    cloudAccounts.connectGcpAccount('fake-access-token');
    expect(cloudAccounts.getGcpAccount()).not.toBeNull();
  });

  it('removes account when disconnect is invoked', () => {
    const storage = createInMemoryStorage(FAKE_ACCOUNTS_JSON);
    const cloudAccounts = createCloudAccount(storage);
    cloudAccounts.load();

    expect(cloudAccounts.getDigitalOceanAccount()).not.toBeNull();
    cloudAccounts.disconnectDigitalOceanAccount();
    expect(cloudAccounts.getDigitalOceanAccount()).toBeNull();

    expect(cloudAccounts.getGcpAccount()).not.toBeNull();
    cloudAccounts.disconnectGcpAccount();
    expect(cloudAccounts.getGcpAccount()).toBeNull();
  });

  it('functional noop on calling disconnect when accounts are not connected', () => {
    const cloudAccounts = createCloudAccount();
    cloudAccounts.load();

    expect(cloudAccounts.getDigitalOceanAccount()).toBeNull();
    cloudAccounts.disconnectDigitalOceanAccount();
    expect(cloudAccounts.getDigitalOceanAccount()).toBeNull();

    expect(cloudAccounts.getGcpAccount()).toBeNull();
    cloudAccounts.disconnectGcpAccount();
    expect(cloudAccounts.getGcpAccount()).toBeNull();
  });

  it('migrates existing legacy DigitalOcean access token on load', () => {
    const storage = new InMemoryStorage();
    storage.setItem('LastDOToken', 'legacy-digitalocean-access-token');
    const cloudAccounts = createCloudAccount(storage);
    cloudAccounts.load();

    expect(cloudAccounts.getDigitalOceanAccount()).not.toBeNull();
  });

  it('updates legacy DigitalOcean access token when account reconnected', () => {
    const storage = new InMemoryStorage();
    storage.setItem('LastDOToken', 'legacy-digitalocean-access-token');
    const cloudAccounts = createCloudAccount(storage);
    cloudAccounts.load();

    expect(storage.getItem('LastDOToken')).toEqual('legacy-digitalocean-access-token');
    cloudAccounts.connectDigitalOceanAccount('new-digitalocean-access-token');
    expect(storage.getItem('LastDOToken')).toEqual('new-digitalocean-access-token');
  });
});

function createInMemoryStorage(accountJsonArray: AccountJson[] = []): Storage {
  const storage = new InMemoryStorage();
  storage.setItem('accounts-storage', JSON.stringify(accountJsonArray));
  return storage;
}

function createCloudAccount(storage = createInMemoryStorage()): CloudAccounts {
  const digitalOceanAccountFactory = (accessToken: string) => new FakeDigitalOceanAccount(accessToken);
  const digitalOceanAccountCredentialsGetter = (account: FakeDigitalOceanAccount) => account.getAccessToken();
  const gcpAccountFactory = (refreshToken: string) => new FakeGcpAccount(refreshToken);
  const gcpAccountCredentialsGetter = (account: FakeGcpAccount) => account.getRefreshToken();
  return new CloudAccounts(
      digitalOceanAccountFactory, digitalOceanAccountCredentialsGetter,
      gcpAccountFactory, gcpAccountCredentialsGetter, storage);
}
