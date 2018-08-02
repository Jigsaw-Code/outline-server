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

import * as electron from 'electron';

import * as digitalocean_oauth from './digitalocean_oauth';

const ipcRenderer = electron.ipcRenderer;

interface ElectronGlobal extends NodeJS.Global {
  whitelistCertificate: (fingerprint: string) => void;
  onElectronEvent: (event: string, listener: () => void) => void;
  // tslint:disable-next-line:no-any
  sendElectronEvent: (event: string, ...args: any[]) => void;
  runDigitalOceanOauth: () => digitalocean_oauth.OauthSession;
}

process.once('loaded', () => {
  const electronGlobal = (global as ElectronGlobal);
  electronGlobal.whitelistCertificate = (fingerprint: string) => {
    return ipcRenderer.sendSync('whitelist-certificate', fingerprint);
  };
  electronGlobal.onElectronEvent = (event: string, listener: () => void) => {
    ipcRenderer.on(event, listener);
  };
  // tslint:disable-next-line:no-any
  electronGlobal.sendElectronEvent = (event: string, ...args: any[]) => {
    ipcRenderer.send(event, args);
  };
  electronGlobal.runDigitalOceanOauth = digitalocean_oauth.runOauth;
});
