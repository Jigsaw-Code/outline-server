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
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as request from 'request-lite';
import * as semver from 'semver';
import * as url from 'url';

interface ReleaseData {
  location?: string;
  version?: string;
  buildTimestamp?: number;
  md5?: string;
}

function getManagerReleaseData(releaseDataUrl: string): Promise<ReleaseData> {
  const releaseName = `outline-manager-${os.platform()}-${os.arch()}`;
  return new Promise((fulfill, reject) => {
    request(releaseDataUrl, (error, response, body) => {
      if (error) {
        return reject(error);
      }
      try {
        const data: ReleaseData = JSON.parse(body)['latestVersions'][releaseName];
        if (!data.version || !data.location) {
          return reject('invalid managerReleaseData ' + data);
        }
        return fulfill(data);
      } catch (e) {
        return reject('Unable to fetch latest manager info ' + e);
      }
    });
  });
}

export function checkForUpdates(currentVersion: string, releaseDataUrl: string) {
  getManagerReleaseData(releaseDataUrl)
      .then((managerReleaseData) => {
        const latestVersion = managerReleaseData.version;
        const semverDiff = semver.diff(latestVersion, currentVersion);
        // Only prompt for major and minor updates, ignoring patch, etc.
        if ((semverDiff === 'major' || semverDiff === 'minor') &&
            semver.gt(latestVersion, currentVersion)) {
          electron.dialog.showMessageBox(
              {
                message: `A new version of the Outline Manager is available.\n\nCurrent version: ${
                    currentVersion}\nNew version: ${latestVersion}`,
                buttons: ['Download', 'Cancel']
              },
              (clickedButtonIndex: number) => {
                if (clickedButtonIndex === 0) {
                  electron.shell.openExternal(managerReleaseData.location);
                }
              });
        }
      })
      .catch((e: Error) => {
        // Print error and prevent from propagating as we can still run the manager
        // without checking for new releases.
        console.error('Unable to fetch latest manager info', e);
      });
}
