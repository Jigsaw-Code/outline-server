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

import * as semver from 'semver';

import * as errors from '../infrastructure/errors';
import * as server from '../model/server';
import {Server} from '../model/server';
import * as digitalocean_server from './digitalocean_server';

import {DisplayServer} from './display_server';
import {AppRoot} from './ui_components/app-root';
import {DisplayAccessKey, DisplayDataAmount, ServerView} from './ui_components/outline-server-view';

const CHANGE_KEYS_PORT_VERSION = '1.0.0';
const DATA_LIMITS_VERSION = '1.1.0';
const CHANGE_HOSTNAME_VERSION = '1.2.0';

// Date by which the data limits feature experiment will be permanently added or removed.
export const DATA_LIMITS_AVAILABILITY_DATE = new Date('2020-06-02');
const MAX_ACCESS_KEY_DATA_LIMIT_BYTES = 50 * (10 ** 9);  // 50GB

export class ServerManagementApp {
  constructor(private appRoot: AppRoot) {}

  // Show the server management screen. Assumes the server is healthy.
  public async showServer(server: server.Server, selectedDisplayServer: DisplayServer) {
    this.appRoot.selectedServer = selectedDisplayServer;

    // Show view and initialize fields from selectedServer.
    const view = this.appRoot.getServerView(selectedDisplayServer.id);
    view.isServerReachable = true;
    view.serverId = server.getServerId();
    view.serverName = server.getName();
    view.serverHostname = server.getHostnameForAccessKeys();
    view.serverManagementApiUrl = server.getManagementApiUrl();
    view.serverPortForNewAccessKeys = server.getPortForNewAccessKeys();
    view.serverCreationDate =
        ServerManagementApp.localizeDate(server.getCreatedDate(), this.appRoot.language);
    view.serverVersion = server.getVersion();
    view.dataLimitsAvailabilityDate =
        ServerManagementApp.localizeDate(DATA_LIMITS_AVAILABILITY_DATE, this.appRoot.language);
    view.accessKeyDataLimit =
        ServerManagementApp.dataLimitToDisplayDataAmount(server.getAccessKeyDataLimit());
    view.isAccessKeyDataLimitEnabled = !!view.accessKeyDataLimit;

    const version = server.getVersion();
    if (version) {
      view.isAccessKeyPortEditable = semver.gte(version, CHANGE_KEYS_PORT_VERSION);
      view.supportsAccessKeyDataLimit = semver.gte(version, DATA_LIMITS_VERSION);
      view.isHostnameEditable = semver.gte(version, CHANGE_HOSTNAME_VERSION);
    }

    if (ServerManagementApp.isManagedServer(server)) {
      view.isServerManaged = true;
      const host = server.getHost();
      view.monthlyCost = host.getMonthlyCost().usd;
      view.monthlyOutboundTransferBytes =
          host.getMonthlyOutboundTransferLimit().terabytes * (10 ** 12);
      view.serverLocation = this.getLocalizedCityName(host.getRegionId());
    } else {
      view.isServerManaged = false;
    }

    view.metricsEnabled = server.getMetricsEnabled();
    this.appRoot.showServerView();
    this.showMetricsOptInWhenNeeded(server, view);

    // Load "My Connection" and other access keys.
    try {
      const serverAccessKeys = await server.listAccessKeys();
      view.accessKeyRows = serverAccessKeys.map(this.convertToUiAccessKey.bind(this));
      if (!view.accessKeyDataLimit) {
        view.accessKeyDataLimit = ServerManagementApp.dataLimitToDisplayDataAmount(
            await ServerManagementApp.computeDefaultAccessKeyDataLimit(server, serverAccessKeys));
      }
      // Show help bubbles once the page has rendered.
      setTimeout(() => {
        ServerManagementApp.showHelpBubblesOnce(view);
      }, 250);
    } catch (error) {
      console.error(`Failed to load access keys: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-keys-get'));
    }

    this.showTransferStats(server, view);
  }

  public async renameServer(server: Server, newName: string) {
    const view = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await server.setName(newName);
      view.serverName = newName;
    } catch (error) {
      console.error(`Failed to rename server: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-server-rename'));
      const oldName = server.getName();
      view.serverName = oldName;
      // tslint:disable-next-line:no-any
      (view.$.serverSettings as any).serverName = oldName;
    }
  }

  public async setMetricsEnabled(server: Server, metricsEnabled: boolean) {
    try {
      await server.setMetricsEnabled(metricsEnabled);
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      // Change metricsEnabled property on polymer element to update display.
      this.appRoot.getServerView(this.appRoot.selectedServer.id).metricsEnabled = metricsEnabled;
    } catch (error) {
      console.error(`Failed to set metrics enabled: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-metrics'));
    }
  }

  private showMetricsOptInWhenNeeded(server: server.Server, serverView: ServerView) {
    const showMetricsOptInOnce = () => {
      // FIXME: Add sanity check back in
      // // Sanity check to make sure the running server is still displayed, i.e.
      // // it hasn't been deleted.
      // if (this.selectedServer !== server) {
      //   return;
      // }

      // Show the metrics opt in prompt if the server has not already opted in,
      // and if they haven't seen the prompt yet according to localStorage.
      const storageKey = server.getServerId() + '-prompted-for-metrics';
      if (!server.getMetricsEnabled() && !localStorage.getItem(storageKey)) {
        this.appRoot.showMetricsDialogForNewServer();
        localStorage.setItem(storageKey, 'true');
      }
    };

    // Calculate milliseconds passed since server creation.
    const createdDate = server.getCreatedDate();
    const now = new Date();
    const msSinceCreation = now.getTime() - createdDate.getTime();

    // Show metrics opt-in once ONE_DAY_IN_MS has passed since server creation.
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
    if (msSinceCreation >= ONE_DAY_IN_MS) {
      showMetricsOptInOnce();
    } else {
      setTimeout(showMetricsOptInOnce, ONE_DAY_IN_MS - msSinceCreation);
    }
  }

  private async refreshTransferStats(server: server.Server, serverView: ServerView) {
    try {
      const stats = await server.getDataUsage();
      let totalBytes = 0;
      // tslint:disable-next-line:forin
      for (const accessKeyId in stats.bytesTransferredByUserId) {
        totalBytes += stats.bytesTransferredByUserId[accessKeyId];
      }
      serverView.setServerTransferredData(totalBytes);

      const accessKeyDataLimit = server.getAccessKeyDataLimit();
      if (accessKeyDataLimit) {
        // Make access key data usage relative to the data limit.
        totalBytes = accessKeyDataLimit.bytes;
      }

      // Update all the displayed access keys, even if usage didn't change, in case the data limit
      // did.
      for (const accessKey of serverView.accessKeyRows) {
        const accessKeyId = accessKey.id;
        const transferredBytes = stats.bytesTransferredByUserId[accessKeyId] || 0;
        let relativeTraffic =
            totalBytes ? 100 * transferredBytes / totalBytes : (accessKeyDataLimit ? 100 : 0);
        if (relativeTraffic > 100) {
          // Can happen when a data limit is set on an access key that already exceeds it.
          relativeTraffic = 100;
        }
        serverView.updateAccessKeyRow(accessKeyId, {transferredBytes, relativeTraffic});
      }
    } catch (e) {
      // Since failures are invisible to users we generally want exceptions here to bubble
      // up and trigger a Sentry report. The exception is network errors, about which we can't
      // do much (note: ShadowboxServer generates a breadcrumb for failures regardless which
      // will show up when someone explicitly submits feedback).
      if (e instanceof errors.ServerApiError && e.isNetworkError()) {
        return;
      }
      throw e;
    }
  }

  private showTransferStats(server: server.Server, serverView: ServerView) {
    this.refreshTransferStats(server, serverView);
    // Get transfer stats once per minute for as long as server is selected.
    const statsRefreshRateMs = 60 * 1000;
    const intervalId = setInterval(() => {
      // FIXME: Add check back in
      // if (this.selectedServer !== server) {
      //   // Server is no longer running, stop interval
      //   clearInterval(intervalId);
      //   return;
      // }
      this.refreshTransferStats(server, serverView);
    }, statsRefreshRateMs);
  }

  // Converts the access key from the remote service format to the
  // format used by outline-server-view.
  private convertToUiAccessKey(remoteAccessKey: server.AccessKey): DisplayAccessKey {
    return {
      id: remoteAccessKey.id,
      placeholderName: `${this.appRoot.localize('key', 'keyId', remoteAccessKey.id)}`,
      name: remoteAccessKey.name,
      accessUrl: remoteAccessKey.accessUrl,
      transferredBytes: 0,
      relativeTraffic: 0
    };
  }

  public addAccessKey(server: Server) {
    server.addAccessKey()
      .then((serverAccessKey: server.AccessKey) => {
        const uiAccessKey = this.convertToUiAccessKey(serverAccessKey);
        this.appRoot.getServerView(this.appRoot.selectedServer.id).addAccessKey(uiAccessKey);
        this.appRoot.showNotification(this.appRoot.localize('notification-key-added'));
      })
      .catch((error) => {
        console.error(`Failed to add access key: ${error}`);
        this.appRoot.showError(this.appRoot.localize('error-key-add'));
      });
  }

  public renameAccessKey(
      server: Server, accessKeyId: string, newName: string, entry: polymer.Base) {
    server.renameAccessKey(accessKeyId, newName)
      .then(() => {
        entry.commitName();
      })
      .catch((error) => {
        console.error(`Failed to rename access key: ${error}`);
        this.appRoot.showError(this.appRoot.localize('error-key-rename'));
        entry.revertName();
      });
  }

  public removeAccessKey(server: Server, accessKeyId: string) {
    server.removeAccessKey(accessKeyId)
      .then(() => {
        this.appRoot.getServerView(this.appRoot.selectedServer.id).removeAccessKey(accessKeyId);
        this.appRoot.showNotification(this.appRoot.localize('notification-key-removed'));
      })
      .catch((error) => {
        console.error(`Failed to remove access key: ${error}`);
        this.appRoot.showError(this.appRoot.localize('error-key-remove'));
      });
  }

  public async setAccessKeyDataLimit(server: Server, limit: server.DataLimit) {
    if (!limit) {
      return false;
    }
    const previousLimit = server.getAccessKeyDataLimit();
    if (previousLimit && limit.bytes === previousLimit.bytes) {
      return false;
    }
    const serverView = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await server.setAccessKeyDataLimit(limit);
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      serverView.accessKeyDataLimit = ServerManagementApp.dataLimitToDisplayDataAmount(limit);
      this.refreshTransferStats(server, serverView);
      return true;
    } catch (error) {
      console.error(`Failed to set access key data limit: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-set-data-limit'));
      serverView.accessKeyDataLimit = ServerManagementApp.dataLimitToDisplayDataAmount(
          previousLimit || await ServerManagementApp.computeDefaultAccessKeyDataLimit(server));
      serverView.isAccessKeyDataLimitEnabled = !!previousLimit;
    }
  }

  public async removeAccessKeyDataLimit(server: Server) {
    const serverView = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await server.removeAccessKeyDataLimit();
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      this.refreshTransferStats(server, serverView);
    } catch (error) {
      console.error(`Failed to remove access key data limit: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-remove-data-limit'));
      serverView.isAccessKeyDataLimitEnabled = true;
    }
  }

  public async setHostnameForAccessKeys(
      server: Server, hostname: string, serverSettings: polymer.Base) {
    this.appRoot.showNotification(this.appRoot.localize('saving'));
    try {
      await server.setHostnameForAccessKeys(hostname);
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      serverSettings.enterSavedState();
    } catch (error) {
      this.appRoot.showError(this.appRoot.localize('error-not-saved'));
      if (error.isNetworkError()) {
        serverSettings.enterErrorState(this.appRoot.localize('error-network'));
        return;
      }
      const message = error.response.status === 400 ? 'error-hostname-invalid' : 'error-unexpected';
      serverSettings.enterErrorState(this.appRoot.localize(message));
    }
  }

  public async setPortForNewAccessKeys(server: Server, port: number, serverSettings: polymer.Base) {
    this.appRoot.showNotification(this.appRoot.localize('saving'));
    try {
      await server.setPortForNewAccessKeys(port);
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      serverSettings.enterSavedState();
    } catch (error) {
      this.appRoot.showError(this.appRoot.localize('error-not-saved'));
      if (error.isNetworkError()) {
        serverSettings.enterErrorState(this.appRoot.localize('error-network'));
        return;
      }
      const code = error.response.status;
      if (code === 409) {
        serverSettings.enterErrorState(this.appRoot.localize('error-keys-port-in-use'));
        return;
      }
      serverSettings.enterErrorState(this.appRoot.localize('error-unexpected'));
    }
  }

  private static localizeDate(date: Date, language: string): string {
    return date.toLocaleString(language, {year: 'numeric', month: 'long', day: 'numeric'});
  }

  private static async showHelpBubblesOnce(serverView: ServerView) {
    if (!window.localStorage.getItem('addAccessKeyHelpBubble-dismissed')) {
      await serverView.showAddAccessKeyHelpBubble();
      window.localStorage.setItem('addAccessKeyHelpBubble-dismissed', 'true');
    }
    if (!window.localStorage.getItem('getConnectedHelpBubble-dismissed')) {
      await serverView.showGetConnectedHelpBubble();
      window.localStorage.setItem('getConnectedHelpBubble-dismissed', 'true');
    }
    if (!window.localStorage.getItem('dataLimitsHelpBubble-dismissed') &&
        serverView.supportsAccessKeyDataLimit) {
      await serverView.showDataLimitsHelpBubble();
      window.localStorage.setItem('dataLimitsHelpBubble-dismissed', 'true');
    }
  }

  private static dataLimitToDisplayDataAmount(limit: server.DataLimit): DisplayDataAmount|null {
    if (!limit) {
      return null;
    }
    const bytes = limit.bytes;
    if (bytes >= 10 ** 9) {
      return {value: Math.floor(bytes / (10 ** 9)), unit: 'GB'};
    }
    return {value: Math.floor(bytes / (10 ** 6)), unit: 'MB'};
  }

  // Compute the suggested data limit based on the server's transfer capacity and number of access
  // keys.
  private static async computeDefaultAccessKeyDataLimit(
      server: server.Server, accessKeys?: server.AccessKey[]): Promise<server.DataLimit> {
    try {
      // Assume non-managed servers have a data transfer capacity of 1TB.
      let serverTransferCapacity: server.DataAmount = {terabytes: 1};
      if (ServerManagementApp.isManagedServer(server)) {
        serverTransferCapacity = server.getHost().getMonthlyOutboundTransferLimit();
      }
      if (!accessKeys) {
        accessKeys = await server.listAccessKeys();
      }
      let dataLimitBytes = serverTransferCapacity.terabytes * (10 ** 12) / (accessKeys.length || 1);
      if (dataLimitBytes > MAX_ACCESS_KEY_DATA_LIMIT_BYTES) {
        dataLimitBytes = MAX_ACCESS_KEY_DATA_LIMIT_BYTES;
      }
      return {bytes: dataLimitBytes};
    } catch (e) {
      console.error(`Failed to compute default access key data limit: ${e}`);
      return {bytes: MAX_ACCESS_KEY_DATA_LIMIT_BYTES};
    }
  }

  // TODO: Reconcile with copy in app.ts
  private getLocalizedCityName(regionId: server.RegionId) {
    const cityId = digitalocean_server.GetCityId(regionId);
    return this.appRoot.localize(`city-${cityId}`);
  }

  // TODO: Reconcile with copy in app.ts
  private static isManagedServer(testServer: server.Server): testServer is server.ManagedServer {
    return !!(testServer as server.ManagedServer).getHost;
  }

  public static displayDataAmountToDataLimit(dataAmount: DisplayDataAmount): server.DataLimit|null {
    if (!dataAmount) {
      return null;
    }
    if (dataAmount.unit === 'GB') {
      return {bytes: dataAmount.value * (10 ** 9)};
    } else if (dataAmount.unit === 'MB') {
      return {bytes: dataAmount.value * (10 ** 6)};
    }
    return {bytes: dataAmount.value};
  }
}
