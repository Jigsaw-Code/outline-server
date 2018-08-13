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

import {ipcRenderer} from 'electron';

import * as digitalocean_oauth from './digitalocean_oauth';

// For communication between the main and renderer process.
//
// Required since we disable nodeIntegration; for more info, see the entries here for
// nodeIntegration and preload:
//   https://electronjs.org/docs/api/browser-window#class-browserwindow

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
