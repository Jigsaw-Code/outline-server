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
import * as electron from 'electron';
import {autoUpdater} from 'electron-updater';
import * as path from 'path';
import {URL, URLSearchParams} from 'url';

import {LoadingWindow} from './loading_window';
import * as menu from './menu';
import {redactManagerUrl} from './util';

const app = electron.app;
const ipcMain = electron.ipcMain;
const shell = electron.shell;

const debugMode = process.env.OUTLINE_DEBUG === 'true';

const IMAGES_BASENAME =
    `${path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'server_manager', 'web_app')}`;

const sentryDsn =
    process.env.SENTRY_DSN || 'https://533e56d1b2d64314bd6092a574e6d0f1@sentry.io/215496';

sentry.init({
  dsn: sentryDsn,
  // Sentry provides a sensible default but we would prefer without the leading "outline-manager@".
  release: electron.app.getVersion(),
  maxBreadcrumbs: 100,
  shouldAddBreadcrumb: (breadcrumb) => {
    // Don't submit breadcrumbs for console.debug.
    if (breadcrumb.category === 'console') {
      if (breadcrumb.level === sentry.Severity.Debug) {
        return false;
      }
    }
    return true;
  },
  beforeBreadcrumb: (breadcrumb) => {
    // Redact PII from XHR requests.
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
// To clearly identify app restarts in Sentry.
console.info(`Outline Manager is starting`);

interface IpcEvent {
  returnValue: {};
}

function createMainWindow() {
  const win = new electron.BrowserWindow({
    width: 600,
    height: 768,
    resizable: false,
    icon: path.join(__dirname, 'web_app', 'ui_components', 'icons', 'launcher.png'),
    webPreferences: {
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      nativeWindowOpen: true,
      webviewTag: false
    }
  });
  const webAppUrl = getWebAppUrl();
  win.loadURL(webAppUrl);

  const loadingWindow = new LoadingWindow(win, 'outline://web_app/loading.html');
  const LOADING_WINDOW_DELAY_MS = 3000;

  const handleNavigation = (event: Event, url: string) => {
    try {
      const parsed: URL = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
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
  win.webContents.on('new-window', handleNavigation.bind(this));
  win.webContents.on('did-finish-load', () => {
    loadingWindow.hide();

    // Wait until now to check for updates now so that the UI won't miss the event.
    if (!debugMode) {
      autoUpdater.checkForUpdates();
    }

    // Opening the window does not trigger a focus event, at least on Linux.
    win.webContents.send('poll-clipboard');
  });

  // Disable window maximization.  Setting "maximizable: false" in BrowserWindow
  // options does not work as documented.
  win.setMaximizable(false);

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
  queryParams.set('sentryDsn', sentryDsn);
  if (debugMode) {
    queryParams.set('outlineDebugMode', 'true');
    console.log(`Enabling Outline debug mode`);
  }

  // Append arguments to URL if any.
  const webAppUrl = new URL('outline://web_app/index.html');
  webAppUrl.search = queryParams.toString();
  const webAppUrlString = webAppUrl.toString();
  console.log('Launching web app from ' + webAppUrlString);
  return webAppUrlString;
}

function main() {
  // prevent window being garbage collected
  let mainWindow: Electron.BrowserWindow;

  // Mark secure to avoid mixed content warnings when loading DigitalOcean pages via https://.
  electron.protocol.registerStandardSchemes(['outline'], {secure: true});

  const isSecondInstance = app.makeSingleInstance((argv, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  if (isSecondInstance) {
    app.quit();
  }

  app.on('ready', () => {
    const menuTemplate = menu.getMenuTemplate(debugMode);
    if (menuTemplate.length > 0) {
      electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(menuTemplate));
    }

    // Register a custom protocol so we can use absolute paths in the web app.
    // This also acts as a kind of chroot for the web app, so it cannot access
    // the user's filesystem. Hostnames are ignored.
    electron.protocol.registerFileProtocol(
        'outline',
        (request, callback) => {
          const appPath = new URL(request.url).pathname;
          const filesystemPath = path.join(__dirname, 'server_manager/web_app', appPath);
          callback(filesystemPath);
        },
        (error) => {
          if (error) {
            throw new Error('Failed to register outline protocol');
          }
        });
    mainWindow = createMainWindow();
  });

  const UPDATE_DOWNLOADED_EVENT = 'update-downloaded';
  autoUpdater.on(UPDATE_DOWNLOADED_EVENT, (ev, info) => {
    if (mainWindow) {
      mainWindow.webContents.send(UPDATE_DOWNLOADED_EVENT);
    }
  });

  // Handle cert whitelisting requests from the renderer process.
  const trustedFingerprints = new Set<string>();
  ipcMain.on('whitelist-certificate', (event: IpcEvent, fingerprint: string) => {
    trustedFingerprints.add(`sha256/${fingerprint}`);
    event.returnValue = true;
  });
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault();
    callback(trustedFingerprints.has(certificate.fingerprint));
  });

  // Restores the mainWindow if minimized and brings it into focus.
  ipcMain.on('bring-to-front', (event: IpcEvent) => {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  // Handle "show me where" requests from the renderer process.
  ipcMain.on('open-image', (event: IpcEvent, basename: string) => {
    const p = path.join(IMAGES_BASENAME, basename);
    if (!shell.openItem(p)) {
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

  app.on('browser-window-focus', () => {
    if (mainWindow) {
      mainWindow.webContents.send('poll-clipboard');
    }
  });
}

main();
