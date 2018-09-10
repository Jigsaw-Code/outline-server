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

import {InMemoryConfig} from '../infrastructure/json_config';

import {ManagerStats, ManagerStatsJson} from './manager_metrics';

function addDays(baseDate: Date, days: number) {
  const date = new Date(baseDate);
  date.setDate(baseDate.getDate() + days);
  return date;
}

describe('ManagerStats', () => {
  it('Saves traffic to config', (done) => {
    const now = new Date();
    const config = new InMemoryConfig({} as ManagerStatsJson);
    const stats = new ManagerStats(config);

    let report = stats.get30DayByteTransfer();
    expect(report.bytesTransferredByUserId).toEqual({});

    for (let di = 0; di < 40; di++) {
      stats.recordBytesTransferred(addDays(now, -di), 'user-0', 1);
    }
    report = stats.get30DayByteTransfer();
    // This is being dropped
    expect(report.bytesTransferredByUserId).toEqual({'user-0': 30});
    // We are not cleaning this from the config.
    expect(config.written.userIdSet).toEqual(['user-0']);
    expect(Object.keys(config.written.dailyUserBytesTransferred).length).toEqual(40);

    expect(new ManagerStats(new InMemoryConfig(config.written)).get30DayByteTransfer())
        .toEqual(report);
    done();
  });
});
