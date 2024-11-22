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
import {PrometheusClient, QueryResultData} from '../infrastructure/prometheus_scraper';
import {FakePrometheusClient} from './mocks/mocks';

export class QueryMapPrometheusClient implements PrometheusClient {
  constructor(private queryMap: {[query: string]: QueryResultData}) {}

  async query(_query: string): Promise<QueryResultData> {
    return this.queryMap[_query];
  }
}

describe('PrometheusManagerMetrics', () => {
  it('getServerMetrics', async (done) => {
    const managerMetrics = new PrometheusManagerMetrics(
      new QueryMapPrometheusClient({
        'sum(increase(shadowsocks_data_bytes_per_location{dir=~"c<p|p>t"}[0s])) by (location, asn, asorg)':
          {
            resultType: 'vector',
            result: [
              {
                metric: {
                  location: 'US',
                  asn: '49490',
                  asorg: null,
                },
                value: [null, '1000'],
              },
            ],
          },
        'sum(increase(shadowsocks_tunnel_time_seconds_per_location[0s])) by (location, asn, asorg)':
          {
            resultType: 'vector',
            result: [
              {
                metric: {
                  location: 'US',
                  asn: '49490',
                  asorg: null,
                },
                value: [null, '1000'],
              },
            ],
          },
        'sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[0s])) by (access_key)': {
          resultType: 'vector',
          result: [
            {
              metric: {
                access_key: '0',
              },
              value: [null, '1000'],
            },
          ],
        },
        'sum(increase(shadowsocks_tunnel_time_seconds[0s])) by (access_key)': {
          resultType: 'vector',
          result: [
            {
              metric: {
                access_key: '0',
              },
              value: [null, '1000'],
            },
          ],
        },
      })
    );

    const serverMetrics = await managerMetrics.getServerMetrics({seconds: 0});

    expect(JSON.stringify(serverMetrics, null, 2)).toEqual(`{
  "server": [
    {
      "location": "US",
      "asn": 49490,
      "asOrg": "null",
      "tunnelTime": {
        "seconds": 1000
      },
      "dataTransferred": {
        "bytes": 1000
      }
    }
  ],
  "accessKeys": [
    {
      "accessKeyId": 0,
      "tunnelTime": {
        "seconds": 1000
      },
      "dataTransferred": {
        "bytes": 1000
      }
    }
  ]
}`);
    done();
  });

  it('getServerMetrics - does a full outer join on metric data', async (done) => {
    const managerMetrics = new PrometheusManagerMetrics(
      new QueryMapPrometheusClient({
        'sum(increase(shadowsocks_data_bytes_per_location{dir=~"c<p|p>t"}[0s])) by (location, asn, asorg)':
          {
            resultType: 'vector',
            result: [
              {
                metric: {
                  location: 'US',
                  asn: '49490',
                  asorg: null,
                },
                value: [null, '1000'],
              },
            ],
          },
        'sum(increase(shadowsocks_tunnel_time_seconds_per_location[0s])) by (location, asn, asorg)':
          {
            resultType: 'vector',
            result: [
              {
                metric: {
                  location: 'CA',
                  asn: '53520',
                  asorg: null,
                },
                value: [null, '1000'],
              },
            ],
          },
        'sum(increase(shadowsocks_data_bytes{dir=~"c<p|p>t"}[0s])) by (access_key)': {
          resultType: 'vector',
          result: [
            {
              metric: {
                access_key: '0',
              },
              value: [null, '1000'],
            },
          ],
        },
        'sum(increase(shadowsocks_tunnel_time_seconds[0s])) by (access_key)': {
          resultType: 'vector',
          result: [
            {
              metric: {
                access_key: '1',
              },
              value: [null, '1000'],
            },
          ],
        },
      })
    );

    const serverMetrics = await managerMetrics.getServerMetrics({seconds: 0});

    expect(JSON.stringify(serverMetrics, null, 2)).toEqual(`{
  "server": [
    {
      "location": "CA",
      "asn": 53520,
      "asOrg": "null",
      "tunnelTime": {
        "seconds": 1000
      }
    },
    {
      "location": "US",
      "asn": 49490,
      "asOrg": "null",
      "dataTransferred": {
        "bytes": 1000
      }
    }
  ],
  "accessKeys": [
    {
      "accessKeyId": 1,
      "tunnelTime": {
        "seconds": 1000
      }
    },
    {
      "accessKeyId": 0,
      "dataTransferred": {
        "bytes": 1000
      }
    }
  ]
}`);
    done();
  });

  it('getOutboundByteTransfer', async (done) => {
    const managerMetrics = new PrometheusManagerMetrics(
      new FakePrometheusClient({'access-key-1': 1000, 'access-key-2': 10000})
    );
    const dataUsage = await managerMetrics.getOutboundByteTransfer({hours: 0});
    const bytesTransferredByUserId = dataUsage.bytesTransferredByUserId;
    expect(Object.keys(bytesTransferredByUserId).length).toEqual(2);
    expect(bytesTransferredByUserId['access-key-1']).toEqual(1000);
    expect(bytesTransferredByUserId['access-key-2']).toEqual(10000);
    done();
  });
});
