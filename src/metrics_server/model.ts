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

/**
 * An interface for representing hourly connection metrics reports.
 */
export interface HourlyConnectionMetricsReport {
  /**
   * The ID of the server that generated the report.
   */
  serverId: string;

  /**
   * The start time of the report, in milliseconds since the Unix epoch.
   */
  startUtcMs: number;

  /**
   * The end time of the report, in milliseconds since the Unix epoch.
   */
  endUtcMs: number;

  /**
   * An array of reports for each user who connected to the server during the report period.
   */
  userReports: HourlyUserConnectionMetricsReport[];
}

/**
 * An interface for representing hourly user connection metrics reports.
 */
export interface HourlyUserConnectionMetricsReport {
  /**
   * The ID of the user who connected to the server.
   */
  userId: string;

  /**
   * An array of countries that the user connected from.
   */
  countries: string[];

  /**
   * The total number of bytes that the user transferred during the report period.
   */
  bytesTransferred: number;
}

/**
 * An interface for representing daily feature metrics reports.
 */
export interface DailyFeatureMetricsReport {
  /**
   * The ID of the server that generated the report.
   */
  serverId: string;

  /**
   * The version of the server that generated the report.
   */
  serverVersion: string;

  /**
   * The timestamp of the report, in milliseconds since the Unix epoch.
   */
  timestampUtcMs: number;

  /**
   * A report for the data limit for the server.
   */
  dataLimit: DailyDataLimitMetricsReport;
}

/**
 * An interface for representing daily data limit metrics reports.
 */
export interface DailyDataLimitMetricsReport {
  /**
   * Whether or not the data limit is enabled.
   */
  enabled: boolean;

  /**
   * The number of keys that have been used against the data limit.
   */
  perKeyLimitCount?: number;
}
