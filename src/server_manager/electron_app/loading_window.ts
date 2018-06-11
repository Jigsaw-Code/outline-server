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

export class LoadingWindow {
  private loadingBrowserWindow: electron.BrowserWindow;
  private timeoutId: NodeJS.Timer;

  public constructor(private mainWindow: Electron.BrowserWindow, private url: string) {}

  public showInMs(delayMs: number) {
    if (this.timeoutId) {
      // Timeout is already set - cancel it.
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = global.setTimeout(() => {
      this.timeoutId = null;
      this.loadingBrowserWindow = new electron.BrowserWindow({
        webPreferences: {
          nodeIntegration: false,
          nativeWindowOpen: true,
          webviewTag: false
        }
      });
      this.loadingBrowserWindow.loadURL(this.url);
      this.loadingBrowserWindow.setBounds(this.mainWindow.getBounds());
      this.mainWindow.hide();
    }, delayMs);
  }

  public hide() {
    if (this.timeoutId) {
      // loadingBrowserWindow has not been displayed yet, cancel the timeout.
      clearTimeout(this.timeoutId);
    }
    if (this.loadingBrowserWindow) {
      this.loadingBrowserWindow.close();
      this.loadingBrowserWindow = null;
    }
    this.mainWindow.show();
  }
}
