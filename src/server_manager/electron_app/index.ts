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
import * as dotenv from 'dotenv';
import * as electron from 'electron';
import {autoUpdater} from 'electron-updater';
import * as path from 'path';
import {URL, URLSearchParams} from 'url';

import * as menu from './menu';

const app = electron.app;
const ipcMain = electron.ipcMain;
const shell = electron.shell;

// Run before referencing environment variables.
dotenv.config({path: path.join(__dirname, '.env')});

const debugMode = process.env.OUTLINE_DEBUG === 'true';

const IMAGES_BASENAME = `${path.join(
  __dirname.replace('app.asar', 'app.asar.unpacked'),
  'server_manager',
  'web_app'
)}`;

const sentryDsn = process.env.SENTRY_DSN;
if (sentryDsn) {
  sentry.init({
    dsn: sentryDsn,
    // Sentry provides a sensible default but we would prefer without the leading
    // "outline-manager@".
    release: electron.app.getVersion(),
    maxBreadcrumbs: 100,
    beforeBreadcrumb: (breadcrumb: sentry.Breadcrumb) => {
      // Don't submit breadcrumbs for console.debug.
      if (breadcrumb.category === 'console') {
        if (breadcrumb.level === sentry.Severity.Debug) {
          return null;
        }
      }
      return breadcrumb;
    },
  });
}

// To clearly identify app restarts in Sentry.
console.info(`Outline Manager is starting`);

interface IpcEvent {
  returnValue: {};
}

function createMainWindow() {
  const win = new electron.BrowserWindow({
    width: 800,
    height: 1024,
    minWidth: 600,
    minHeight: 768,
    maximizable: false,
    icon: path.join(__dirname, 'web_app', 'ui_components', 'icons', 'launcher.png'),
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      nativeWindowOpen: true,
      webviewTag: false,
    },
  });
  const webAppUrl = getWebAppUrl();
  win.loadURL(webAppUrl);

  const handleNavigation = (event: Event, url: string) => {
    try {
      const parsed: URL = new URL(url);
      if (
        parsed.protocol === 'http:' ||
        parsed.protocol === 'https:' ||
        parsed.protocol === 'macappstore:'
      ) {
        shell.openExternal(url);
      } else {
        console.warn(`Refusing to open URL with protocol "${parsed.protocol}"`);
      }
    } catch (e) {
      console.warn('Could not parse URL: ' + url);
    }
    event.preventDefault();
  };
  win.webContents.on('will-navigate', (event: Event, url: string) => {
    handleNavigation(event, url);
  });
  win.webContents.on('new-window', (event: Event, url: string) => {
    handleNavigation(event, url);
  });
  win.webContents.on('did-finish-load', () => {
    // Wait until now to check for updates now so that the UI won't miss the event.
    if (!debugMode) {
      autoUpdater.checkForUpdates();
    }
  });

  return win;
}

function getWebAppUrl() {
  const queryParams = new URLSearchParams();
  queryParams.set('version', electron.app.getVersion());

  // Set queryParams from environment variables.
  if (process.env.SB_IMAGE) {
    queryParams.set('image', process.env.SB_IMAGE);
    console.log(`Will install Shadowbox from ${process.env.SB_IMAGE} Docker image`);
  }
  if (process.env.SB_METRICS_URL) {
    queryParams.set('metricsUrl', process.env.SB_METRICS_URL);
    console.log(`Will use metrics url ${process.env.SB_METRICS_URL}`);
  }
  if (sentryDsn) {
    queryParams.set('sentryDsn', sentryDsn);
  }
  if (debugMode) {
    queryParams.set('outlineDebugMode', 'true');
    console.log('Enabling Outline debug mode');
  }

  // Append arguments to URL if any.
  const webAppUrl = new URL('outline://web_app/index.html');
  webAppUrl.search = queryParams.toString();
  const webAppUrlString = webAppUrl.toString();
  console.log('Launching web app from ' + webAppUrlString);
  return webAppUrlString;
}

// Digital Ocean stopped sending 'Acces-Control-Allow-Origin' headers in some API responses
// (i.e. v2/droplets). As a workaround, intercept DO API requests and preemptively inject the
// header to allow our origin.  Additionally, some OPTIONS requests return 403. Modify the response
// status code and inject CORS response headers.
function workaroundDigitalOceanApiCors() {
  const headersFilter = {urls: ['https://api.digitalocean.com/*']};
  electron.session.defaultSession.webRequest.onHeadersReceived(
    headersFilter,
    (
      details: electron.OnHeadersReceivedListenerDetails,
      callback: (response: electron.HeadersReceivedResponse) => void
    ) => {
      if (details.method === 'OPTIONS') {
        details.responseHeaders['access-control-allow-origin'] = ['outline://web_app'];
        if (details.statusCode === 403) {
          details.statusCode = 200;
          details.statusLine = 'HTTP/1.1 200';
          details.responseHeaders['status'] = ['200'];
          details.responseHeaders['access-control-allow-headers'] = ['*'];
          details.responseHeaders['access-control-allow-credentials'] = ['true'];
          details.responseHeaders['access-control-allow-methods'] = [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE',
            'OPTIONS',
          ];
          details.responseHeaders['access-control-expose-headers'] = [
            'RateLimit-Limit',
            'RateLimit-Remaining',
            'RateLimit-Reset',
            'Total',
            'Link',
          ];
          details.responseHeaders['access-control-max-age'] = ['86400'];
        }
      }
      callback(details);
    }
  );
}

function main() {
  // prevent window being garbage collected
  let mainWindow: Electron.BrowserWindow;

  // Mark secure to avoid mixed content warnings when loading DigitalOcean pages via https://.
  electron.protocol.registerSchemesAsPrivileged([
    {scheme: 'outline', privileges: {standard: true, secure: true}},
  ]);

  if (!app.requestSingleInstanceLock()) {
    console.log('another instance is running - exiting');
    app.quit();
  }
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.on('ready', () => {
    const menuTemplate = menu.getMenuTemplate(debugMode);
    if (menuTemplate.length > 0) {
      electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(menuTemplate));
    }

    workaroundDigitalOceanApiCors();

    // Register a custom protocol so we can use absolute paths in the web app.
    // This also acts as a kind of chroot for the web app, so it cannot access
    // the user's filesystem. Hostnames are ignored.
    const registered = electron.protocol.registerFileProtocol('outline', (request, callback) => {
      const appPath = new URL(request.url).pathname;
      const filesystemPath = path.join(__dirname, 'server_manager/web_app', appPath);
      callback(filesystemPath);
    });
    if (!registered) {
      throw new Error('Failed to register outline protocol');
    }
    mainWindow = createMainWindow();
  });

  const UPDATE_DOWNLOADED_EVENT = 'update-downloaded';
  autoUpdater.on(UPDATE_DOWNLOADED_EVENT, (_ev, _info) => {
    if (mainWindow) {
      mainWindow.webContents.send(UPDATE_DOWNLOADED_EVENT);
    }
  });

  // Handle request to trust the certificate from the renderer process.
  const trustedFingerprints = new Set<string>();
  ipcMain.on('trust-certificate', (event: IpcEvent, fingerprint: string) => {
    trustedFingerprints.add(`sha256/${fingerprint}`);
    event.returnValue = true;
  });
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(trustedFingerprints.has(certificate.fingerprint));
  });

  // Restores the mainWindow if minimized and brings it into focus.
  ipcMain.on('bring-to-front', (_event: IpcEvent) => {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  // Handle "show me where" requests from the renderer process.
  ipcMain.on('open-image', (event: IpcEvent, basename: string) => {
    const p = path.join(IMAGES_BASENAME, basename);
    if (!shell.openPath(p)) {
      console.error(`could not open image at ${p}`);
    }
  });

  app.on('activate', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow();
      mainWindow.on('closed', () => {
        mainWindow = null;
      });
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

main();
