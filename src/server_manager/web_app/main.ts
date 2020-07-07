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

import {App} from './app';
import {DigitalOceanTokenManager} from './digitalocean_oauth';
import * as digitalocean_server from './digitalocean_server';
import {DisplayServerRepository} from './display_server';
import {ManualServerRepository} from './manual_server';
import {AppRoot} from './ui_components/app-root.js';

type LanguageDef = {
  id: string,
  name: string,
  dir: string
};
const SUPPORTED_LANGUAGES: {[key: string]: LanguageDef} = {
  'am': {id: 'am', name: 'አማርኛ', dir: 'ltr'},
  'ar': {id: 'ar', name: 'العربية', dir: 'rtl'},
  'bg': {id: 'bg', name: 'Български', dir: 'ltr'},
  'ca': {id: 'ca', name: 'Català', dir: 'ltr'},
  'cs': {id: 'cs', name: 'Česky', dir: 'ltr'},
  'da': {id: 'da', name: 'Dansk', dir: 'ltr'},
  'de': {id: 'de', name: 'Deutsch', dir: 'ltr'},
  'el': {id: 'el', name: 'Ελληνικά', dir: 'ltr'},
  'en': {id: 'en', name: 'English', dir: 'ltr'},
  'es-419': {id: 'es-419', name: 'Español', dir: 'ltr'},
  'fa': {id: 'fa', name: 'فارسی', dir: 'rtl'},
  'fi': {id: 'fi', name: 'Suomi', dir: 'ltr'},
  'fil': {id: 'fil', name: 'Wikang Filipino', dir: 'ltr'},
  'fr': {id: 'fr', name: 'Français', dir: 'ltr'},
  'he': {id: 'he', name: 'עברית', dir: 'rtl'},
  'hi': {id: 'hi', name: 'हिन्दी', dir: 'ltr'},
  'hr': {id: 'hr', name: 'Hrvatski', dir: 'ltr'},
  'hu': {id: 'hu', name: 'Magyar', dir: 'ltr'},
  'id': {id: 'id', name: 'Bahasa Indonesia', dir: 'ltr'},
  'it': {id: 'it', name: 'Italiano', dir: 'ltr'},
  'ja': {id: 'ja', name: '日本語', dir: 'ltr'},
  'km': {id: 'km', name: 'ភាសាខ្មែរ', dir: 'ltr'},
  'ko': {id: 'ko', name: '한국어', dir: 'ltr'},
  'lt': {id: 'lt', name: 'Lietuvių', dir: 'ltr'},
  'lv': {id: 'lv', name: 'Latviešu', dir: 'ltr'},
  'nl': {id: 'nl', name: 'Nederlands', dir: 'ltr'},
  'no': {id: 'no', name: 'Norsk (bokmål / riksmål)', dir: 'ltr'},
  'pl': {id: 'pl', name: 'Polski', dir: 'ltr'},
  'pt-BR': {id: 'pt-BR', name: 'Português', dir: 'ltr'},
  'ro': {id: 'ro', name: 'Română', dir: 'ltr'},
  'ru': {id: 'ru', name: 'Русский', dir: 'ltr'},
  'sk': {id: 'sk', name: 'Slovenčina', dir: 'ltr'},
  'sl': {id: 'sl', name: 'Slovenščina', dir: 'ltr'},
  'sr': {id: 'sr', name: 'Српски', dir: 'ltr'},
  'sr-Latn': {id: 'sr-Latn', name: 'Srpski', dir: 'ltr'},
  'sv': {id: 'sv', name: 'Svenska', dir: 'ltr'},
  'th': {id: 'th', name: 'ไทย', dir: 'ltr'},
  'tr': {id: 'tr', name: 'Türkçe', dir: 'ltr'},
  'uk': {id: 'uk', name: 'Українська', dir: 'ltr'},
  'ur': {id: 'ur', name: 'اردو', dir: 'rtl'},
  'vi': {id: 'vi', name: 'Việtnam', dir: 'ltr'},
  'zh-CN': {id: 'zh-CN', name: '简体中文', dir: 'ltr'},
  'zh-TW': {id: 'zh-TW', name: '繁體中文‬‬‪‬', dir: 'ltr'},
};

function getLanguageToUse(): i18n.LanguageCode {
  const supportedLanguages = i18n.languageList(Object.keys(SUPPORTED_LANGUAGES));
  const preferredLanguages = i18n.getBrowserLanguages();
  const overrideLanguage = window.localStorage.getItem('overrideLanguage');
  if (overrideLanguage) {
    preferredLanguages.unshift(new i18n.LanguageCode(overrideLanguage));
  }
  const defaultLanguage = new i18n.LanguageCode('en');
  return new i18n.LanguageMatcher(supportedLanguages, defaultLanguage)
      .getBestSupportedLanguage(preferredLanguages);
}

function sortLanguageDefsByName(languageDefs: LanguageDef[]) {
  return languageDefs.sort((a, b) => {
    return a.name > b.name ? 1 : -1;
  });
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

  const filteredLanguageDefs = Object.values(SUPPORTED_LANGUAGES);
  appRoot.supportedLanguages = sortLanguageDefsByName(filteredLanguageDefs);
  appRoot.setLanguage(language.string(), languageDirection);
  new App(
      appRoot, version, digitalocean_api.createDigitalOceanSession,
      digitalOceanServerRepositoryFactory, new ManualServerRepository('manualServers'),
      new DisplayServerRepository(), new DigitalOceanTokenManager())
      .start();
});

