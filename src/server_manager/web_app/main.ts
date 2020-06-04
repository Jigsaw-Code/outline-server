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

import './ui_components/app-root.js';

import * as digitalocean_api from '../cloud/digitalocean_api';
import * as i18n from '../infrastructure/i18n';
import {getSentryApiUrl} from '../infrastructure/sentry';

import {App, DATA_LIMITS_AVAILABILITY_DATE} from './app';
import {DigitalOceanTokenManager} from './digitalocean_oauth';
import * as digitalocean_server from './digitalocean_server';
import {DisplayServerRepository} from './display_server';
import {ManualServerRepository} from './manual_server';
import {DEFAULT_PROMPT_IMPRESSION_DELAY_MS, OutlineSurveys} from './survey';
import {AppRoot} from './ui_components/app-root.js';

const SUPPORTED_LANGUAGES: {[key: string]: {id: string, dir: string}} = {
  'am': {id: 'am', dir: 'ltr'},
  'ar': {id: 'ar', dir: 'rtl'},
  'bg': {id: 'bg', dir: 'ltr'},
  'ca': {id: 'ca', dir: 'ltr'},
  'cs': {id: 'cs', dir: 'ltr'},
  'da': {id: 'da', dir: 'ltr'},
  'de': {id: 'de', dir: 'ltr'},
  'el': {id: 'el', dir: 'ltr'},
  'en': {id: 'en', dir: 'ltr'},
  'es-419': {id: 'es-419', dir: 'ltr'},
  'fa': {id: 'fa', dir: 'rtl'},
  'fi': {id: 'fi', dir: 'ltr'},
  'fil': {id: 'fil', dir: 'ltr'},
  'fr': {id: 'fr', dir: 'ltr'},
  'he': {id: 'he', dir: 'rtl'},
  'hi': {id: 'hi', dir: 'ltr'},
  'hr': {id: 'hr', dir: 'ltr'},
  'hu': {id: 'hu', dir: 'ltr'},
  'id': {id: 'id', dir: 'ltr'},
  'it': {id: 'it', dir: 'ltr'},
  'ja': {id: 'ja', dir: 'ltr'},
  'ko': {id: 'ko', dir: 'ltr'},
  'km': {id: 'km', dir: 'ltr'},
  'lt': {id: 'lt', dir: 'ltr'},
  'lv': {id: 'lv', dir: 'ltr'},
  'nl': {id: 'nl', dir: 'ltr'},
  'no': {id: 'no', dir: 'ltr'},
  'pl': {id: 'pl', dir: 'ltr'},
  'pt-BR': {id: 'pt-BR', dir: 'ltr'},
  'ro': {id: 'ro', dir: 'ltr'},
  'ru': {id: 'ru', dir: 'ltr'},
  'sk': {id: 'sk', dir: 'ltr'},
  'sl': {id: 'sl', dir: 'ltr'},
  'sr': {id: 'sr', dir: 'ltr'},
  'sr-Latn': {id: 'sr-Latn', dir: 'ltr'},
  'sv': {id: 'sv', dir: 'ltr'},
  'th': {id: 'th', dir: 'ltr'},
  'tr': {id: 'tr', dir: 'ltr'},
  'uk': {id: 'uk', dir: 'ltr'},
  'ur': {id: 'ur', dir: 'rtl'},
  'vi': {id: 'vi', dir: 'ltr'},
  'zh': {id: 'zh', dir: 'ltr'},
  'zh-CN': {id: 'zh-CN', dir: 'ltr'},
  'zh-TW': {id: 'zh-TW', dir: 'ltr'},
};

function getLanguageToUse(): i18n.LanguageCode {
  const supportedLanguages = i18n.languageList(Object.keys(SUPPORTED_LANGUAGES));
  const defaultLanguage = new i18n.LanguageCode('en');
  const userLanguages = i18n.getBrowserLanguages();
  return new i18n.LanguageMatcher(supportedLanguages, defaultLanguage)
      .getBestSupportedLanguage(userLanguages);
}

document.addEventListener('WebComponentsReady', () => {
  // Parse URL query params.
  const params = new URL(document.URL).searchParams;
  const debugMode = params.get('outlineDebugMode') === 'true';
  const metricsUrl = params.get('metricsUrl');
  const shadowboxImage = params.get('image');
  const version = params.get('version');
  const sentryDsn = params.get('sentryDsn');

  // Set DigitalOcean server repository parameters.
  const digitalOceanServerRepositoryFactory = (session: digitalocean_api.DigitalOceanSession) => {
    return new digitalocean_server.DigitaloceanServerRepository(
        session, shadowboxImage, metricsUrl, getSentryApiUrl(sentryDsn), debugMode);
  };

  // Create and start the app.
  const language = getLanguageToUse();
  const languageDirection = SUPPORTED_LANGUAGES[language.string()].dir;
  document.documentElement.setAttribute('dir', languageDirection);
  // NOTE: this cast is safe and allows us to leverage Polymer typings since we haven't migrated to
  // Polymer 3, which adds typescript support.
  const appRoot = document.getElementById('appRoot') as unknown as AppRoot;
  appRoot.setLanguage(language.string(), languageDirection);
  new App(
      appRoot, version, digitalocean_api.createDigitalOceanSession,
      digitalOceanServerRepositoryFactory, new ManualServerRepository('manualServers'),
      new DisplayServerRepository(), new DigitalOceanTokenManager(),
      new OutlineSurveys(
          appRoot.$.surveyDialog, localStorage, DEFAULT_PROMPT_IMPRESSION_DELAY_MS,
          DATA_LIMITS_AVAILABILITY_DATE))
      .start();
});

