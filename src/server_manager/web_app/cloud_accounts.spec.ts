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

import {CloudAccounts} from "./cloud_accounts";
import {InMemoryStorage} from "../infrastructure/memory_storage";

describe('CloudAccounts', () => {
  it('get account methods return null when no cloud accounts are connected', async () => {
    const cloudAccounts = new CloudAccounts(null, null, new InMemoryStorage());
    expect(cloudAccounts.getDigitalOceanAccount()).toBeNull();
    expect(cloudAccounts.getGcpAccount()).toBeNull();
  });

  // TODO: Add tests for remaining methods in the public interface

  // TODO: Add tests for LastDOToken migration
});
