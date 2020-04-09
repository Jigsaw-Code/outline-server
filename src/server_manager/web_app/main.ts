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

import * as url from 'url';

import * as digitalocean_api from '../cloud/digitalocean_api';

import {App, DATA_LIMITS_AVAILABILITY_DATE} from './app';
import {DigitalOceanTokenManager} from './digitalocean_oauth';
import * as digitalocean_server from './digitalocean_server';
import {DisplayServerRepository} from './display_server';
import {ManualServerRepository} from './manual_server';
import {DEFAULT_PROMPT_IMPRESSION_DELAY_MS, OutlineSurveys} from './survey';

function ensureString(queryParam: string|string[]): string {
  if (Array.isArray(queryParam)) {
    // We pick the last one if the parameter appears multiple times.
    return queryParam[queryParam.length - 1];
  } else {
    return queryParam;
  }
}

document.addEventListener('WebComponentsReady', () => {
  // Parse URL query params.
  const queryParams = url.parse(document.URL, true).query;
  const debugMode = ensureString(queryParams.outlineDebugMode) === 'true';
  const metricsUrl = ensureString(queryParams.metricsUrl);
  const shadowboxImage = ensureString(queryParams.image);
  const version = ensureString(queryParams.version);
  const sentryDsn = ensureString(queryParams.sentryDsn);

  // Set DigitalOcean server repository parameters.
  const digitalOceanServerRepositoryFactory = (session: digitalocean_api.DigitalOceanSession) => {
    return new digitalocean_server.DigitaloceanServerRepository(
        session, shadowboxImage, metricsUrl, getSentryApiUrl(sentryDsn), debugMode);
  };

  // Create and start the app.
  // NOTE: this cast is safe and allows us to leverage Polymer typings since we haven't migrated to
  // Polymer 3, which adds typescript support.
  // tslint:disable-next-line:no-any
  const appRoot: polymer.Base = (document.getElementById('appRoot') as any) as polymer.Base;
  new App(
      appRoot, version, digitalocean_api.createDigitalOceanSession,
      digitalOceanServerRepositoryFactory, new ManualServerRepository('manualServers'),
      new DisplayServerRepository(), new DigitalOceanTokenManager(),
      new OutlineSurveys(
          appRoot.$.surveyDialog, localStorage, DEFAULT_PROMPT_IMPRESSION_DELAY_MS,
          DATA_LIMITS_AVAILABILITY_DATE))
      .start();
});

// Returns Sentry URL for DSN string or undefined if `sentryDsn` is falsy.
// e.g. for DSN "https://[API_KEY]@sentry.io/[PROJECT_ID]"
// this will return
// "https://sentry.io/api/[PROJECT_ID]/store/?sentry_version=7&sentry_key=[API_KEY]"
function getSentryApiUrl(sentryDsn?: string): string|undefined {
  if (!sentryDsn) {
    return undefined;
  }
  const matches = sentryDsn.match(/https:\/\/(\S+)@sentry\.io\/(\d+)/);
  return `https://sentry.io/api/${matches[2]}/store/?sentry_version=7&sentry_key=${matches[1]}`;
}
