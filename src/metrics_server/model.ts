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

// NOTE: These interfaces are mirrored in in src/shadowbox/server/metrics.ts
// Find a way to share them between shadowbox and metrics_server.
export interface HourlyConnectionMetricsReport {
  serverId: string;
  startUtcMs: number;
  endUtcMs: number;
  userReports: HourlyUserConnectionMetricsReport[];
}

export interface HourlyUserConnectionMetricsReport {
  userId?: string;
  countries?: string[];
  asn?: number;
  bytesTransferred: number;
  tunnelTimeSec?: number;
}

export interface HourlyUserConnectionMetricsReportByLocation
  extends Omit<HourlyUserConnectionMetricsReport, 'countries'> {
  countries: string[];
}

export interface DailyFeatureMetricsReport {
  serverId: string;
  serverVersion: string;
  timestampUtcMs: number;
  dataLimit: DailyDataLimitMetricsReport;
}

export interface DailyDataLimitMetricsReport {
  enabled: boolean;
  perKeyLimitCount?: number;
}
