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

import * as sentry from '@sentry/electron';
import {ipcRenderer} from 'electron';
import {URL} from 'url';

import * as digitalocean_oauth from './digitalocean_oauth';
import {redactManagerUrl} from './util';

// This file is run in the renderer process *before* nodeIntegration is disabled.
//
// Use it for main/renderer process communication and configuring Sentry (which works via
// main/renderer process messages).

// Configure Sentry to redact PII from the renderer process requests.
// For all other config see the main process.
const params = new URL(document.URL).searchParams;
sentry.init({
  dsn: params.get('sentryDsn') || '',
  beforeBreadcrumb: (breadcrumb: sentry.Breadcrumb) => {
    // Redact PII from fetch requests.
    if (breadcrumb.category === 'fetch' && breadcrumb.data && breadcrumb.data.url) {
      try {
        breadcrumb.data.url = `(redacted)/${redactManagerUrl(breadcrumb.data.url)}`;
      } catch (e) {
        // NOTE: cannot log this failure to console if console breadcrumbs are enabled
        breadcrumb.data.url = `(error redacting)`;
      }
    }
    return breadcrumb;
  }
});

// tslint:disable-next-line:no-any
(window as any).whitelistCertificate = (fingerprint: string) => {
  return ipcRenderer.sendSync('whitelist-certificate', fingerprint);
};

// tslint:disable-next-line:no-any
(window as any).openImage = (basename: string) => {
  ipcRenderer.send('open-image', basename);
};

// tslint:disable-next-line:no-any
(window as any).onUpdateDownloaded = (callback: () => void) => {
  ipcRenderer.on('update-downloaded', callback);
};

// tslint:disable-next-line:no-any
(window as any).runDigitalOceanOauth = digitalocean_oauth.runOauth;

// tslint:disable-next-line:no-any
(window as any).bringToFront = () => {
  return ipcRenderer.send('bring-to-front');
};
