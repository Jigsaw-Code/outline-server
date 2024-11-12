// Copyright 2019 The Outline Authors
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

import {PrometheusManagerMetrics} from './manager_metrics';
import {FakeAccessKeyPrometheusClient} from './mocks/mocks';

describe('PrometheusManagerMetrics', () => {
  it('getServerMetrics', async (done) => {
    const managerMetrics = new PrometheusManagerMetrics(
      new FakeAccessKeyPrometheusClient([
        {
          accessKeyId: 0,
          location: 'US',
          asn: 49490,
          asOrg: null,
          dataTransferred: {
            bytes: 50000,
          },
          tunnelTime: {
            seconds: 10000,
          },
        },
        {
          accessKeyId: 1,
          location: 'US',
          asn: 49490,
          asOrg: null,
          dataTransferred: {
            bytes: 50000,
          },
          tunnelTime: {
            seconds: 5000,
          },
        },
        {
          accessKeyId: 2,
          location: 'CA',
          asn: null,
          asOrg: null,
          dataTransferred: {
            bytes: 40000,
          },
          tunnelTime: {
            seconds: 7500,
          },
        },
      ])
    );

    const serverMetrics = await managerMetrics.getServerMetrics({hours: 0});

    expect(JSON.stringify(serverMetrics, null, 2)).toEqual(`{
  "server": [
    {
      "location": "US",
      "asn": 49490,
      "asOrg": "null",
      "dataTransferred": {
        "bytes": 100000
      },
      "tunnelTime": {
        "seconds": 15000
      }
    },
    {
      "location": "CA",
      "asn": null,
      "asOrg": "null",
      "dataTransferred": {
        "bytes": 40000
      },
      "tunnelTime": {
        "seconds": 7500
      }
    }
  ],
  "accessKeys": [
    {
      "accessKeyId": 0,
      "dataTransferred": {
        "bytes": 50000
      },
      "tunnelTime": {
        "seconds": 10000
      }
    },
    {
      "accessKeyId": 1,
      "dataTransferred": {
        "bytes": 50000
      },
      "tunnelTime": {
        "seconds": 5000
      }
    },
    {
      "accessKeyId": 2,
      "dataTransferred": {
        "bytes": 40000
      },
      "tunnelTime": {
        "seconds": 7500
      }
    }
  ]
}`);
    done();
  });

  it('getOutboundByteTransfer', async (done) => {
    const managerMetrics = new PrometheusManagerMetrics(
      new FakeAccessKeyPrometheusClient([
        {
          accessKeyId: 'access-key-1',
          asn: null,
          asOrg: null,
          location: null,
          dataTransferred: {
            bytes: 1000,
          },
        },
        {
          accessKeyId: 'access-key-2',
          asn: null,
          asOrg: null,
          location: null,
          dataTransferred: {
            bytes: 10000,
          },
        },
      ])
    );
    const dataUsage = await managerMetrics.getOutboundByteTransfer({hours: 0});
    const bytesTransferredByUserId = dataUsage.bytesTransferredByUserId;
    expect(Object.keys(bytesTransferredByUserId).length).toEqual(2);
    expect(bytesTransferredByUserId['access-key-1']).toEqual(1000);
    expect(bytesTransferredByUserId['access-key-2']).toEqual(10000);
    done();
  });
});
