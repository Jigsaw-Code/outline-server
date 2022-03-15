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

// Byte transfer metrics for a sliding timeframe, including both inbound and outbound.
// TODO: this is copied at src/model/server.ts.  Both copies should
// be kept in sync, until we can find a way to share code between the web_app
// and shadowbox.
export interface DataUsageByUser {
  // The userId key should be of type AccessKeyId, however that results in the tsc
  // error TS1023: An index signature parameter type must be 'string' or 'number'.
  // See https://github.com/Microsoft/TypeScript/issues/2491
  // TODO: rename this to AccessKeyId in a backwards compatible way.
  bytesTransferredByUserId: {[userId: string]: number};
}

// Sliding time frame for measuring data utilization.
export interface DataUsageTimeframe {
  hours: number;
}
