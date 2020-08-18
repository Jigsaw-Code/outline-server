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
import {EventEmitter} from 'eventemitter3';
import * as semver from 'semver';

import * as digitalocean_api from '../cloud/digitalocean_api';
import * as errors from '../infrastructure/errors';
import {sleep} from '../infrastructure/sleep';
import * as server from '../model/server';

import {TokenManager} from './digitalocean_oauth';
import * as digitalocean_server from './digitalocean_server';
import {DisplayServer, DisplayServerRepository, makeDisplayServer} from './display_server';
import {parseManualServerConfig} from './management_urls';
import {AppRoot} from './ui_components/app-root.js';
import {Location} from './ui_components/outline-region-picker-step';
import {DisplayAccessKey, DisplayDataAmount, ServerView} from './ui_components/outline-server-view.js';

// The Outline DigitalOcean team's referral code:
//   https://www.digitalocean.com/help/referral-program/
const UNUSED_DIGITALOCEAN_REFERRAL_CODE = '5ddb4219b716';

const CHANGE_KEYS_PORT_VERSION = '1.0.0';
const DATA_LIMITS_VERSION = '1.1.0';
const CHANGE_HOSTNAME_VERSION = '1.2.0';
const MAX_ACCESS_KEY_DATA_LIMIT_BYTES = 50 * (10 ** 9);  // 50GB

// DigitalOcean mapping of regions to flags
const FLAG_IMAGE_DIR = 'images/flags';
const DIGITALOCEAN_FLAG_MAPPING: {[cityId: string]: string} = {
  ams: `${FLAG_IMAGE_DIR}/netherlands.png`,
  sgp: `${FLAG_IMAGE_DIR}/singapore.png`,
  blr: `${FLAG_IMAGE_DIR}/india.png`,
  fra: `${FLAG_IMAGE_DIR}/germany.png`,
  lon: `${FLAG_IMAGE_DIR}/uk.png`,
  sfo: `${FLAG_IMAGE_DIR}/us.png`,
  tor: `${FLAG_IMAGE_DIR}/canada.png`,
  nyc: `${FLAG_IMAGE_DIR}/us.png`,
};

function dataLimitToDisplayDataAmount(limit: server.DataLimit): DisplayDataAmount|null {
  if (!limit) {
    return null;
  }
  const bytes = limit.bytes;
  if (bytes >= 10 ** 9) {
    return {value: Math.floor(bytes / (10 ** 9)), unit: 'GB'};
  }
  return {value: Math.floor(bytes / (10 ** 6)), unit: 'MB'};
}

function displayDataAmountToDataLimit(dataAmount: DisplayDataAmount): server.DataLimit|null {
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

// Compute the suggested data limit based on the server's transfer capacity and number of access
// keys.
async function computeDefaultAccessKeyDataLimit(
    server: server.Server, accessKeys?: server.AccessKey[]): Promise<server.DataLimit> {
  try {
    // Assume non-managed servers have a data transfer capacity of 1TB.
    let serverTransferCapacity: server.DataAmount = {terabytes: 1};
    if (isManagedServer(server)) {
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

// Returns whether the user has seen a notification for the updated feature metrics data collection
// policy.
function hasSeenFeatureMetricsNotification(): boolean {
  return !!window.localStorage.getItem('dataLimitsHelpBubble-dismissed') &&
      !!window.localStorage.getItem('dataLimits-feature-collection-notification');
}

async function showHelpBubblesOnce(serverView: ServerView) {
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

function isManagedServer(testServer: server.Server): testServer is server.ManagedServer {
  return !!(testServer as server.ManagedServer).getHost;
}

function isManualServer(testServer: server.Server): testServer is server.ManualServer {
  return !!(testServer as server.ManualServer).forget;
}

function localizeDate(date: Date, language: string): string {
  return date.toLocaleString(language, {year: 'numeric', month: 'long', day: 'numeric'});
}

type DigitalOceanSessionFactory = (accessToken: string) => digitalocean_api.DigitalOceanSession;
type DigitalOceanServerRepositoryFactory = (session: digitalocean_api.DigitalOceanSession) =>
    server.ManagedServerRepository;

export class App {
  private digitalOceanRepository: server.ManagedServerRepository;
  private selectedServer: server.Server;
  private serverBeingCreated: server.ManagedServer;

  constructor(
      private appRoot: AppRoot, private readonly version: string,
      private createDigitalOceanSession: DigitalOceanSessionFactory,
      private createDigitalOceanServerRepository: DigitalOceanServerRepositoryFactory,
      private manualServerRepository: server.ManualServerRepository,
      private displayServerRepository: DisplayServerRepository,
      private digitalOceanTokenManager: TokenManager) {
    appRoot.setAttribute('outline-version', this.version);

    appRoot.addEventListener('ConnectToDigitalOcean', (event: CustomEvent) => {
      this.connectToDigitalOcean();
    });
    appRoot.addEventListener('SignOutRequested', (event: CustomEvent) => {
      this.clearCredentialsAndShowIntro();
    });

    appRoot.addEventListener('SetUpServerRequested', (event: CustomEvent) => {
      this.createDigitalOceanServer(event.detail.regionId);
    });

    appRoot.addEventListener('DeleteServerRequested', (event: CustomEvent) => {
      this.deleteSelectedServer();
    });

    appRoot.addEventListener('ForgetServerRequested', (event: CustomEvent) => {
      this.forgetSelectedServer();
    });

    appRoot.addEventListener('AddAccessKeyRequested', (event: CustomEvent) => {
      this.addAccessKey();
    });

    appRoot.addEventListener('RemoveAccessKeyRequested', (event: CustomEvent) => {
      this.removeAccessKey(event.detail.accessKeyId);
    });

    appRoot.addEventListener('RenameAccessKeyRequested', (event: CustomEvent) => {
      this.renameAccessKey(event.detail.accessKeyId, event.detail.newName, event.detail.entry);
    });

    appRoot.addEventListener('SetAccessKeyDataLimitRequested', (event: CustomEvent) => {
      this.setAccessKeyDataLimit(displayDataAmountToDataLimit(event.detail.limit));
    });

    appRoot.addEventListener('RemoveAccessKeyDataLimitRequested', (event: CustomEvent) => {
      this.removeAccessKeyDataLimit();
    });

    appRoot.addEventListener('ChangePortForNewAccessKeysRequested', (event: CustomEvent) => {
      this.setPortForNewAccessKeys(event.detail.validatedInput, event.detail.ui);
    });

    appRoot.addEventListener('ChangeHostnameForAccessKeysRequested', (event: CustomEvent) => {
      this.setHostnameForAccessKeys(event.detail.validatedInput, event.detail.ui);
    });

    // The UI wants us to validate a server management URL.
    // "Reply" by setting a field on the relevant template.
    appRoot.addEventListener('ManualServerEdited', (event: CustomEvent) => {
      let isValid = true;
      try {
        parseManualServerConfig(event.detail.userInput);
      } catch (e) {
        isValid = false;
      }
      const manualServerEntryEl = appRoot.getManualServerEntry();
      manualServerEntryEl.enableDoneButton = isValid;
    });

    appRoot.addEventListener('ManualServerEntered', (event: CustomEvent) => {
      const userInput = event.detail.userInput;
      const manualServerEntryEl = appRoot.getManualServerEntry();
      this.createManualServer(userInput)
          .then(() => {
            // Clear fields on outline-manual-server-entry (e.g. dismiss the connecting popup).
            manualServerEntryEl.clear();
          })
          .catch((e: Error) => {
            // Remove the progress indicator.
            manualServerEntryEl.showConnection = false;
            // Display either error dialog or feedback depending on error type.
            if (e instanceof errors.UnreachableServerError) {
              const errorTitle = appRoot.localize('error-server-unreachable-title');
              const errorMessage = appRoot.localize('error-server-unreachable');
              this.appRoot.showManualServerError(errorTitle, errorMessage);
            } else {
              // TODO(alalama): with UI validation, this code path never gets executed. Remove?
              let errorMessage = '';
              if (e.message) {
                errorMessage += `${e.message}\n`;
              }
              if (userInput) {
                errorMessage += userInput;
              }
              appRoot.openManualInstallFeedback(errorMessage);
            }
          });
    });

    appRoot.addEventListener('EnableMetricsRequested', (event: CustomEvent) => {
      this.setMetricsEnabled(true);
    });

    appRoot.addEventListener('DisableMetricsRequested', (event: CustomEvent) => {
      this.setMetricsEnabled(false);
    });

    appRoot.addEventListener('SubmitFeedback', (event: CustomEvent) => {
      const detail = event.detail;
      try {
        sentry.captureEvent({
          message: detail.userFeedback,
          user: {email: detail.userEmail},
          tags: {category: detail.feedbackCategory, cloudProvider: detail.cloudProvider}
        });
        appRoot.showNotification(appRoot.localize('notification-feedback-thanks'));
      } catch (e) {
        console.error(`Failed to submit feedback: ${e}`);
        appRoot.showError(appRoot.localize('error-feedback'));
      }
    });

    appRoot.addEventListener('SetLanguageRequested', (event: CustomEvent) => {
      this.setAppLanguage(event.detail.languageCode, event.detail.languageDir);
    });

    appRoot.addEventListener('ServerRenameRequested', (event: CustomEvent) => {
      this.renameServer(event.detail.newName);
    });

    appRoot.addEventListener('CancelServerCreationRequested', (event: CustomEvent) => {
      this.cancelServerCreation(this.selectedServer);
    });

    appRoot.addEventListener('OpenImageRequested', (event: CustomEvent) => {
      openImage(event.detail.imagePath);
    });

    appRoot.addEventListener('OpenShareDialogRequested', (event: CustomEvent) => {
      const accessKey = event.detail.accessKey;
      this.appRoot.openShareDialog(accessKey, this.getS3InviteUrl(accessKey));
    });

    appRoot.addEventListener('OpenGetConnectedDialogRequested', (event: CustomEvent) => {
      this.appRoot.openGetConnectedDialog(this.getS3InviteUrl(event.detail.accessKey, true));
    });

    appRoot.addEventListener('ShowServerRequested', (event: CustomEvent) => {
      this.handleShowServerRequested(event.detail.displayServerId);
    });

    onUpdateDownloaded(this.displayAppUpdateNotification.bind(this));
  }

  async start(): Promise<void> {
    this.showIntro();
    await this.syncDisplayServersToUi();

    const manualServersPromise = this.manualServerRepository.listServers();

    const accessToken = this.digitalOceanTokenManager.getStoredToken();
    const managedServersPromise = !!accessToken ?
        this.enterDigitalOceanMode(accessToken).catch(e => [] as server.ManagedServer[]) :
        Promise.resolve([]);

    return Promise.all([manualServersPromise, managedServersPromise])
        .then(([manualServers, managedServers]) => {
          const installedManagedServers =
              managedServers.filter(server => server.isInstallCompleted());
          const serverBeingCreated = managedServers.find(server => !server.isInstallCompleted());
          if (!!serverBeingCreated) {
            this.syncServerCreationToUi(serverBeingCreated);
          }
          return this.syncServersToDisplay(manualServers.concat(installedManagedServers));
        })
        .then(() => {
          this.maybeShowLastDisplayedServer();
        });
  }

  private async syncServersToDisplay(servers: server.Server[]) {
    for (const server of servers) {
      await this.syncServerToDisplay(server);
    }

    // Remove any unsynced servers from display and alert the user.
    const displayServers = await this.displayServerRepository.listServers();
    const unsyncedServers = displayServers.filter(s => !s.isSynced);
    if (unsyncedServers.length > 0) {
      for (const displayServer of unsyncedServers) {
        this.displayServerRepository.removeServer(displayServer);
      }
      const unsyncedServerNames = unsyncedServers.map(s => s.name).join(', ');
      let messageKey = 'error-server-removed';
      let placeholder = 'serverName';
      if (unsyncedServers.length > 1) {
        // Pluralize localized message.
        messageKey = 'error-servers-removed';
        placeholder = 'serverNames';
      }
      this.appRoot.showError(this.appRoot.localize(messageKey, placeholder, unsyncedServerNames));
    }

    await this.syncDisplayServersToUi();
  }

  // Syncs the locally persisted server metadata for `server`. Creates a DisplayServer for `server`
  // if one is not found in storage. Updates the UI to show the DisplayServer.
  // While this method does not make any assumptions on whether the server is reachable, it does
  // assume that its management API URL is available.
  private async syncServerToDisplay(server: server.Server): Promise<DisplayServer> {
    // We key display servers by the server management API URL, which can be retrieved independently
    // of the server health.
    const displayServerId = server.getManagementApiUrl();
    let displayServer = this.displayServerRepository.findServer(displayServerId);
    if (!displayServer) {
      console.debug(`Could not find display server with ID ${displayServerId}`);
      displayServer = await makeDisplayServer(server);
      this.displayServerRepository.addServer(displayServer);
    } else {
      // We may need to update the stored display server if it was persisted when the server was not
      // healthy, or the server has been renamed.
      try {
        const remoteServerName = server.getName();
        if (displayServer.name !== remoteServerName) {
          displayServer.name = remoteServerName;
        }
      } catch (e) {
        // Ignore, we may not have the server config yet.
      }
      // Mark the server as synced.
      this.displayServerRepository.removeServer(displayServer);
      displayServer.isSynced = true;
      this.displayServerRepository.addServer(displayServer);
    }
    return displayServer;
  }

  // Updates the UI with the stored display servers and server creation in progress, if any.
  private async syncDisplayServersToUi() {
    const displayServerBeingCreated = this.getDisplayServerBeingCreated();
    await this.displayServerRepository.listServers().then((displayServers) => {
      if (!!displayServerBeingCreated) {
        displayServers.push(displayServerBeingCreated);
      }
      this.appRoot.serverList = displayServers;
    });
  }

  // Removes `displayServer` from the UI.
  private async removeServerFromDisplay(displayServer: DisplayServer) {
    this.displayServerRepository.removeServer(displayServer);
    await this.syncDisplayServersToUi();
  }

  // Retrieves the server associated with `displayServer`.
  private async getServerFromRepository(displayServer: DisplayServer): Promise<server.Server|null> {
    const apiManagementUrl = displayServer.id;
    let server: server.Server = null;
    if (displayServer.isManaged) {
      if (!!this.digitalOceanRepository) {
        // Fetch the servers from memory to prevent a leak that happens due to polling when creating
        // a new object for a server whose creation has been cancelled.
        const managedServers = await this.digitalOceanRepository.listServers(false);
        server = managedServers.find(
            (managedServer) => managedServer.getManagementApiUrl() === apiManagementUrl);
      }
    } else {
      server =
          this.manualServerRepository.findServer({'apiUrl': apiManagementUrl, 'certSha256': ''});
    }
    return server;
  }

  private syncServerCreationToUi(server: server.ManagedServer) {
    this.serverBeingCreated = server;
    this.syncDisplayServersToUi();
    // Show creation progress for new servers only after we have a ManagedServer object,
    // otherwise the cancel action will not be available.
    this.showServerCreationProgress();
    this.waitForManagedServerCreation();
  }

  private getDisplayServerBeingCreated(): DisplayServer {
    if (!this.serverBeingCreated) {
      return null;
    }
    // Set name to the default server name for this region. Because the server
    // is still being created, the getName REST API will not yet be available.
    const regionId = this.serverBeingCreated.getHost().getRegionId();
    const serverName = this.makeLocalizedServerName(regionId);
    return {
      // Use the droplet ID until the API URL is available.
      id: this.serverBeingCreated.getHost().getHostId(),
      name: serverName,
      isManaged: true
    };
  }

  // Shows the last server displayed, if there is one in local storage and it still exists.
  private maybeShowLastDisplayedServer() {
    if (!!this.serverBeingCreated) {
      // The server being created should be shown regardless of the last user selection.
      this.displayServerRepository.removeLastDisplayedServerId();
      return;
    }
    const lastDisplayedServerId = this.displayServerRepository.getLastDisplayedServerId();
    if (!lastDisplayedServerId) {
      return;  // No server was displayed when user quit the app.
    }
    const lastDisplayedServer = this.displayServerRepository.findServer(lastDisplayedServerId);
    if (!lastDisplayedServer) {
      return console.debug('Last displayed server ID not found in display sever repository');
    }
    this.showServerFromRepository(lastDisplayedServer);
  }

  private showServerFromRepository(displayServer: DisplayServer) {
    this.getServerFromRepository(displayServer).then((server) => {
      if (!!server) {
        this.showServerIfHealthy(server, displayServer);
      }
    });
  }

  private async handleShowServerRequested(displayServerId: string) {
    const displayServer = this.displayServerRepository.findServer(displayServerId) ||
        this.getDisplayServerBeingCreated();
    if (!displayServer) {
      // This shouldn't happen since the displayed servers are fetched from the repository.
      console.error('Display server not found in storage');
      return;
    }
    const server = await this.getServerFromRepository(displayServer);
    if (!!server) {
      this.showServerIfHealthy(server, displayServer);
    } else if (!!this.serverBeingCreated) {
      this.showServerCreationProgress();
    } else {
      // This should not happen, since we remove unsynced servers from display.
      console.error(`Could not find server for display server ID ${displayServerId}`);
    }
  }

  // Signs in to DigitalOcean through the OAuthFlow. Creates a `ManagedServerRepository` and
  // resolves with the servers present in the account.
  private enterDigitalOceanMode(accessToken: string): Promise<server.ManagedServer[]> {
    const doSession = this.createDigitalOceanSession(accessToken);
    const authEvents = new EventEmitter();
    let cancelled = false;
    let activatingAccount = false;

    return new Promise((resolve, reject) => {
      const cancelAccountStateVerification = () => {
        cancelled = true;
        this.clearCredentialsAndShowIntro();
        reject(new Error('User canceled'));
      };
      const oauthUi = this.appRoot.getDigitalOceanOauthFlow(cancelAccountStateVerification);
      const query = () => {
        if (cancelled) {
          return;
        }
        this.digitalOceanRetry(() => {
              if (cancelled) {
                return Promise.reject('Authorization cancelled');
              }
              return doSession.getAccount();
            })
            .then((account) => {
              authEvents.emit('account-update', account);
            })
            .catch((error) => {
              if (!cancelled) {
                this.showIntro();
                const msg = `Failed to get DigitalOcean account information: ${error}`;
                console.error(msg);
                this.appRoot.showError(this.appRoot.localize('error-do-account-info'));
                reject(new Error(msg));
              }
            });
      };

      authEvents.on('account-update', (account: digitalocean_api.Account) => {
        if (cancelled) {
          return [];
        }
        this.appRoot.adminEmail = account.email;
        if (account.status === 'active') {
          bringToFront();
          let maybeSleep = Promise.resolve();
          if (activatingAccount) {
            // Show the 'account active' screen for a few seconds if the account was activated
            // during this session.
            oauthUi.showAccountActive();
            maybeSleep = sleep(1500);
          }
          maybeSleep
              .then(() => {
                this.digitalOceanRepository = this.createDigitalOceanServerRepository(doSession);
                resolve(this.digitalOceanRepository.listServers());
              })
              .catch((e) => {
                this.showIntro();
                const msg = 'Could not fetch server list from DigitalOcean';
                console.error(msg);
                reject(new Error(msg));
              });
        } else {
          this.appRoot.showDigitalOceanOauthFlow();
          activatingAccount = true;
          if (account.email_verified) {
            oauthUi.showBilling();
          } else {
            oauthUi.showEmailVerification();
          }
          setTimeout(query, 1000);
        }
      });

      query();
    });
  }

  private showServerIfHealthy(server: server.Server, displayServer: DisplayServer) {
    server.isHealthy().then((isHealthy) => {
      if (isHealthy) {
        // Sync the server display in case it was previously unreachable.
        this.syncServerToDisplay(server).then(() => {
          this.showServer(server, displayServer);
        });
      } else {
        // Display the unreachable server state within the server view.
        const serverView = this.appRoot.getServerView(displayServer.id) as ServerView;
        serverView.isServerReachable = false;
        serverView.isServerManaged = isManagedServer(server);
        serverView.serverName = displayServer.name;  // Don't get the name from the remote server.
        serverView.retryDisplayingServer = () => {
          // Refresh the server list if the server is managed, it may have been deleted outside the
          // app.
          let serverExistsPromise = Promise.resolve(true);
          if (serverView.isServerManaged && !!this.digitalOceanRepository) {
            serverExistsPromise =
                this.digitalOceanRepository.listServers().then((managedServers) => {
                  return this.getServerFromRepository(displayServer).then((server) => {
                    return !!server;
                  });
                });
          }
          serverExistsPromise.then((serverExists: boolean) => {
            if (serverExists) {
              this.showServerIfHealthy(server, displayServer);
            } else {
              // Server has been deleted outside the app.
              this.appRoot.showError(
                  this.appRoot.localize('error-server-removed', 'serverName', displayServer.name));
              this.removeServerFromDisplay(displayServer);
              this.selectedServer = null;
              this.appRoot.selectedServer = null;
              this.showIntro();
            }
          });
        };
        this.selectedServer = server;
        this.appRoot.selectedServer = displayServer;
        this.appRoot.showServerView();
      }
    });
  }

  // Intended to add a "retry or re-authenticate?" prompt to DigitalOcean
  // operations. Specifically, any operation rejecting with an digitalocean_api.XhrError will
  // result in a dialog asking the user whether to retry the operation or
  // re-authenticate against DigitalOcean.
  // This is necessary because an access token may expire or be revoked at
  // any time and there's no way to programmatically distinguish network errors
  // from CORS-type errors (see the comments in DigitalOceanSession for more
  // information).
  // TODO: It would be great if, once the user has re-authenticated, we could
  //       return the UI to its exact prior state. Fortunately, the most likely
  //       time to discover an invalid access token is when the application
  //       starts.
  private digitalOceanRetry = <T>(f: () => Promise<T>): Promise<T> => {
    return f().catch((e) => {
      if (!(e instanceof digitalocean_api.XhrError)) {
        return Promise.reject(e);
      }

      return new Promise<T>((resolve, reject) => {
        this.appRoot.showConnectivityDialog((retry: boolean) => {
          if (retry) {
            this.digitalOceanRetry(f).then(resolve, reject);
          } else {
            this.clearCredentialsAndShowIntro();
            reject(e);
          }
        });
      });
    });
  };

  // Shows the intro screen with overview and options to sign in or sign up.
  private showIntro() {
    this.appRoot.showIntro();
  }

  private displayAppUpdateNotification() {
    this.appRoot.showNotification(this.appRoot.localize('notification-app-update'), 60000);
  }

  private connectToDigitalOcean() {
    const accessToken = this.digitalOceanTokenManager.getStoredToken();
    if (accessToken) {
      this.enterDigitalOceanMode(accessToken).then((managedServers) => {
        if (!!this.serverBeingCreated) {
          // Disallow creating multiple servers simultaneously.
          this.showServerCreationProgress();
          return;
        }
        this.syncServersToDisplay(managedServers);
        this.showCreateServer();
      });
      return;
    }
    const session = runDigitalOceanOauth();
    const handleOauthFlowCanceled = () => {
      session.cancel();
      this.clearCredentialsAndShowIntro();
    };
    this.appRoot.getAndShowDigitalOceanOauthFlow(handleOauthFlowCanceled);

    session.result
        .then((accessToken) => {
          // Save accessToken to storage. DigitalOcean tokens
          // expire after 30 days, unless they are manually revoked by the user.
          // After 30 days the user will have to sign into DigitalOcean again.
          // Note we cannot yet use DigitalOcean refresh tokens, as they require
          // a client_secret to be stored on a server and not visible to end users
          // in client-side JS.  More details at:
          // https://developers.digitalocean.com/documentation/oauth/#refresh-token-flow
          this.digitalOceanTokenManager.writeTokenToStorage(accessToken);
          this.enterDigitalOceanMode(accessToken).then((managedServers) => {
            if (managedServers.length > 0) {
              this.syncServersToDisplay(managedServers).then(() => {
                // Show the first server in the list since the user just signed in to DO.
                const displayServer = this.appRoot.serverList.find(
                    (displayServer: DisplayServer) => displayServer.isManaged);
                this.showServerFromRepository(displayServer);
              });
            } else {
              this.showCreateServer();
            }
          });
        })
        .catch((error) => {
          if (!session.isCancelled()) {
            this.clearCredentialsAndShowIntro();
            bringToFront();
            console.error(`DigitalOcean authentication failed: ${error}`);
            this.appRoot.showError(this.appRoot.localize('error-do-auth'));
          }
        });
  }

  // Clears the credentials and returns to the intro screen.
  private clearCredentialsAndShowIntro() {
    this.digitalOceanTokenManager.removeTokenFromStorage();
    // Remove display servers from storage.
    this.displayServerRepository.listServers().then((displayServers: DisplayServer[]) => {
      for (const displayServer of displayServers) {
        if (displayServer.isManaged) {
          this.removeServerFromDisplay(displayServer);
        }
      }
    });
    // Reset UI
    this.appRoot.adminEmail = '';
    if (!!this.appRoot.selectedServer && this.appRoot.selectedServer.isManaged) {
      this.appRoot.selectedServer = null;
      this.showIntro();
    } else if (!this.appRoot.selectedServer) {
      this.showIntro();
    }
  }

  // Opens the screen to create a server.
  private showCreateServer() {
    const regionPicker = this.appRoot.getAndShowRegionPicker();
    // The region picker initially shows all options as disabled. Options are enabled by this code,
    // after checking which regions are available.
    this.digitalOceanRetry(() => {
          return this.digitalOceanRepository.getRegionMap();
        })
        .then(
            (map) => {
              const locations = Object.entries(map).map(([cityId, regionIds]) => {
                return this.createLocationModel(cityId, regionIds);
              });
              regionPicker.locations = locations;
            },
            (e) => {
              console.error(`Failed to get list of available regions: ${e}`);
              this.appRoot.showError(this.appRoot.localize('error-do-regions'));
            });
  }

  private showServerCreationProgress() {
    // Set selected server, needed for cancel button.
    this.selectedServer = this.serverBeingCreated;
    this.appRoot.selectedServer = this.getDisplayServerBeingCreated();
    // Update UI.  Only show cancel button if the server has not yet finished
    // installation, to prevent accidental deletion when restarting.
    const showCancelButton = !this.serverBeingCreated.isInstallCompleted();
    this.appRoot.showProgress(this.appRoot.selectedServer.name, showCancelButton);
  }

  private waitForManagedServerCreation(tryAgain = false): void {
    this.serverBeingCreated.waitOnInstall(tryAgain)
        .then(() => {
          // Unset the instance variable before syncing the server so the UI does not display it.
          const server = this.serverBeingCreated;
          this.serverBeingCreated = null;
          return this.syncAndShowServer(server);
        })
        .catch((e) => {
          console.log(e);
          if (e instanceof errors.DeletedServerError) {
            // The user deleted this server, no need to show an error or delete it again.
            this.serverBeingCreated = null;
            return;
          }
          let errorMessage = this.serverBeingCreated.isInstallCompleted() ?
              this.appRoot.localize('error-server-unreachable-title') :
              this.appRoot.localize('error-server-creation');
          errorMessage += ` ${this.appRoot.localize('digitalocean-unreachable')}`;
          this.appRoot
              .showModalDialog(
                  null,  // Don't display any title.
                  errorMessage,
                  [this.appRoot.localize('server-destroy'), this.appRoot.localize('retry')])
              .then((clickedButtonIndex: number) => {
                if (clickedButtonIndex === 0) {  // user clicked 'Delete this server'
                  console.info('Deleting unreachable server');
                  this.serverBeingCreated.getHost().delete().then(() => {
                    this.serverBeingCreated = null;
                    this.showCreateServer();
                  });
                } else if (clickedButtonIndex === 1) {  // user clicked 'Try again'.
                  console.info('Retrying unreachable server');
                  this.waitForManagedServerCreation(true);
                }
              });
        });
  }

  private getLocalizedCityName(regionId: server.RegionId) {
    const cityId = digitalocean_server.GetCityId(regionId);
    return this.appRoot.localize(`city-${cityId}`);
  }

  private makeLocalizedServerName(regionId: server.RegionId) {
    const serverLocation = this.getLocalizedCityName(regionId);
    return this.appRoot.localize('server-name', 'serverLocation', serverLocation);
  }

  // Returns a promise which fulfills once the DigitalOcean droplet is created.
  // Shadowbox may not be fully installed once this promise is fulfilled.
  public createDigitalOceanServer(regionId: server.RegionId) {
    const serverName = this.makeLocalizedServerName(regionId);
    return this
        .digitalOceanRetry(() => {
          return this.digitalOceanRepository.createServer(regionId, serverName);
        })
        .then((server) => {
          this.syncServerCreationToUi(server);
        })
        .catch((e) => {
          // Sanity check - this error is not expected to occur, as waitForManagedServerCreation
          // has it's own error handling.
          console.error('error from waitForManagedServerCreation');
          return Promise.reject(e);
        });
  }

  // Syncs a healthy `server` to the display and shows it.
  private async syncAndShowServer(server: server.Server, timeoutMs = 250) {
    const displayServer = await this.syncServerToDisplay(server);
    await this.syncDisplayServersToUi();
    this.showServer(server, displayServer);
  }

  // Show the server management screen. Assumes the server is healthy.
  private async showServer(selectedServer: server.Server, selectedDisplayServer: DisplayServer) {
    this.selectedServer = selectedServer;
    this.appRoot.selectedServer = selectedDisplayServer;
    this.displayServerRepository.storeLastDisplayedServerId(selectedDisplayServer.id);

    // Show view and initialize fields from selectedServer.
    const view = this.appRoot.getServerView(selectedDisplayServer.id);
    view.isServerReachable = true;
    view.serverId = selectedServer.getServerId();
    view.serverName = selectedServer.getName();
    view.serverHostname = selectedServer.getHostnameForAccessKeys();
    view.serverManagementApiUrl = selectedServer.getManagementApiUrl();
    view.serverPortForNewAccessKeys = selectedServer.getPortForNewAccessKeys();
    view.serverCreationDate = localizeDate(selectedServer.getCreatedDate(), this.appRoot.language);
    view.serverVersion = selectedServer.getVersion();
    view.accessKeyDataLimit = dataLimitToDisplayDataAmount(selectedServer.getAccessKeyDataLimit());
    view.isAccessKeyDataLimitEnabled = !!view.accessKeyDataLimit;
    view.showFeatureMetricsDisclaimer = selectedServer.getMetricsEnabled() &&
        !selectedServer.getAccessKeyDataLimit() && !hasSeenFeatureMetricsNotification();

    const version = this.selectedServer.getVersion();
    if (version) {
      view.isAccessKeyPortEditable = semver.gte(version, CHANGE_KEYS_PORT_VERSION);
      view.supportsAccessKeyDataLimit = semver.gte(version, DATA_LIMITS_VERSION);
      view.isHostnameEditable = semver.gte(version, CHANGE_HOSTNAME_VERSION);
    }

    if (isManagedServer(selectedServer)) {
      view.isServerManaged = true;
      const host = selectedServer.getHost();
      view.monthlyCost = host.getMonthlyCost().usd;
      view.monthlyOutboundTransferBytes =
          host.getMonthlyOutboundTransferLimit().terabytes * (10 ** 12);
      view.serverLocation = this.getLocalizedCityName(host.getRegionId());
    } else {
      view.isServerManaged = false;
    }

    view.metricsEnabled = selectedServer.getMetricsEnabled();
    this.appRoot.showServerView();
    this.showMetricsOptInWhenNeeded(selectedServer, view);

    // Load "My Connection" and other access keys.
    try {
      const serverAccessKeys = await selectedServer.listAccessKeys();
      view.accessKeyRows = serverAccessKeys.map(this.convertToUiAccessKey.bind(this));
      if (!view.accessKeyDataLimit) {
        view.accessKeyDataLimit = dataLimitToDisplayDataAmount(
            await computeDefaultAccessKeyDataLimit(selectedServer, serverAccessKeys));
      }
      // Show help bubbles once the page has rendered.
      setTimeout(() => {
        showHelpBubblesOnce(view);
      }, 250);
    } catch (error) {
      console.error(`Failed to load access keys: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-keys-get'));
    }

    this.showTransferStats(selectedServer, view);
  }

  private showMetricsOptInWhenNeeded(selectedServer: server.Server, serverView: ServerView) {
    const showMetricsOptInOnce = () => {
      // Sanity check to make sure the running server is still displayed, i.e.
      // it hasn't been deleted.
      if (this.selectedServer !== selectedServer) {
        return;
      }
      // Show the metrics opt in prompt if the server has not already opted in,
      // and if they haven't seen the prompt yet according to localStorage.
      const storageKey = selectedServer.getServerId() + '-prompted-for-metrics';
      if (!selectedServer.getMetricsEnabled() && !localStorage.getItem(storageKey)) {
        this.appRoot.showMetricsDialogForNewServer();
        localStorage.setItem(storageKey, 'true');
      }
    };

    // Calculate milliseconds passed since server creation.
    const createdDate = selectedServer.getCreatedDate();
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

  private async refreshTransferStats(selectedServer: server.Server, serverView: ServerView) {
    try {
      const stats = await selectedServer.getDataUsage();
      let totalBytes = 0;
      // tslint:disable-next-line:forin
      for (const accessKeyId in stats.bytesTransferredByUserId) {
        totalBytes += stats.bytesTransferredByUserId[accessKeyId];
      }
      serverView.setServerTransferredData(totalBytes);

      const accessKeyDataLimit = selectedServer.getAccessKeyDataLimit();
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

  private showTransferStats(selectedServer: server.Server, serverView: ServerView) {
    this.refreshTransferStats(selectedServer, serverView);
    // Get transfer stats once per minute for as long as server is selected.
    const statsRefreshRateMs = 60 * 1000;
    const intervalId = setInterval(() => {
      if (this.selectedServer !== selectedServer) {
        // Server is no longer running, stop interval
        clearInterval(intervalId);
        return;
      }
      this.refreshTransferStats(selectedServer, serverView);
    }, statsRefreshRateMs);
  }

  private getS3InviteUrl(accessUrl: string, isAdmin = false) {
    // TODO(alalama): display the invite in the user's preferred language.
    const adminParam = isAdmin ? '?admin_embed' : '';
    return `https://s3.amazonaws.com/outline-vpn/invite.html${adminParam}#${
        encodeURIComponent(accessUrl)}`;
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

  private addAccessKey() {
    this.selectedServer.addAccessKey()
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

  private renameAccessKey(accessKeyId: string, newName: string, entry: polymer.Base) {
    this.selectedServer.renameAccessKey(accessKeyId, newName)
        .then(() => {
          entry.commitName();
        })
        .catch((error) => {
          console.error(`Failed to rename access key: ${error}`);
          this.appRoot.showError(this.appRoot.localize('error-key-rename'));
          entry.revertName();
        });
  }

  private async setAccessKeyDataLimit(limit: server.DataLimit) {
    if (!limit) {
      return;
    }
    const previousLimit = this.selectedServer.getAccessKeyDataLimit();
    if (previousLimit && limit.bytes === previousLimit.bytes) {
      return;
    }
    const serverView = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await this.selectedServer.setAccessKeyDataLimit(limit);
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      serverView.accessKeyDataLimit = dataLimitToDisplayDataAmount(limit);
      this.refreshTransferStats(this.selectedServer, serverView);
      // Don't display the feature collection disclaimer anymore.
      serverView.showFeatureMetricsDisclaimer = false;
      window.localStorage.setItem('dataLimits-feature-collection-notification', 'true');
    } catch (error) {
      console.error(`Failed to set access key data limit: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-set-data-limit'));
      serverView.accessKeyDataLimit = dataLimitToDisplayDataAmount(
          previousLimit || await computeDefaultAccessKeyDataLimit(this.selectedServer));
      serverView.isAccessKeyDataLimitEnabled = !!previousLimit;
    }
  }

  private async removeAccessKeyDataLimit() {
    const serverView = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await this.selectedServer.removeAccessKeyDataLimit();
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      this.refreshTransferStats(this.selectedServer, serverView);
    } catch (error) {
      console.error(`Failed to remove access key data limit: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-remove-data-limit'));
      serverView.isAccessKeyDataLimitEnabled = true;
    }
  }

  private async setHostnameForAccessKeys(hostname: string, serverSettings: polymer.Base) {
    this.appRoot.showNotification(this.appRoot.localize('saving'));
    try {
      await this.selectedServer.setHostnameForAccessKeys(hostname);
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

  private async setPortForNewAccessKeys(port: number, serverSettings: polymer.Base) {
    this.appRoot.showNotification(this.appRoot.localize('saving'));
    try {
      await this.selectedServer.setPortForNewAccessKeys(port);
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

  // Returns promise which fulfills when the server is created successfully,
  // or rejects with an error message that can be displayed to the user.
  public createManualServer(userInput: string): Promise<void> {
    let serverConfig: server.ManualServerConfig;
    try {
      serverConfig = parseManualServerConfig(userInput);
    } catch (e) {
      // This shouldn't happen because the UI validates the URL before enabling the DONE button.
      const msg = `could not parse server config: ${e.message}`;
      console.error(msg);
      return Promise.reject(new Error(msg));
    }

    // Don't let `ManualServerRepository.addServer` throw to avoid redundant error handling if we
    // are adding an existing server. Query the repository instead to treat the UI accordingly.
    const storedServer = this.manualServerRepository.findServer(serverConfig);
    if (!!storedServer) {
      return this.syncServerToDisplay(storedServer).then((displayServer) => {
        this.appRoot.showNotification(this.appRoot.localize('notification-server-exists'), 5000);
        this.showServerIfHealthy(storedServer, displayServer);
      });
    }
    return this.manualServerRepository.addServer(serverConfig).then((manualServer) => {
      return manualServer.isHealthy().then((isHealthy) => {
        if (isHealthy) {
          return this.syncAndShowServer(manualServer);
        } else {
          // Remove inaccessible manual server from local storage if it was just created.
          manualServer.forget();
          console.error('Manual server installed but unreachable.');
          return Promise.reject(new errors.UnreachableServerError());
        }
      });
    });
  }

  private removeAccessKey(accessKeyId: string) {
    this.selectedServer.removeAccessKey(accessKeyId)
        .then(() => {
          this.appRoot.getServerView(this.appRoot.selectedServer.id).removeAccessKey(accessKeyId);
          this.appRoot.showNotification(this.appRoot.localize('notification-key-removed'));
        })
        .catch((error) => {
          console.error(`Failed to remove access key: ${error}`);
          this.appRoot.showError(this.appRoot.localize('error-key-remove'));
        });
  }

  private deleteSelectedServer() {
    const serverToDelete = this.selectedServer;
    if (!isManagedServer(serverToDelete)) {
      const msg = 'cannot delete non-ManagedServer';
      console.error(msg);
      throw new Error(msg);
    }

    const confirmationTitle = this.appRoot.localize('confirmation-server-destroy-title');
    const confirmationText = this.appRoot.localize('confirmation-server-destroy');
    const confirmationButton = this.appRoot.localize('destroy');
    this.appRoot.getConfirmation(confirmationTitle, confirmationText, confirmationButton, () => {
      this.digitalOceanRetry(() => {
            return serverToDelete.getHost().delete();
          })
          .then(
              () => {
                this.removeServerFromDisplay(this.appRoot.selectedServer);
                this.appRoot.selectedServer = null;
                this.selectedServer = null;
                this.showIntro();
                this.appRoot.showNotification(
                    this.appRoot.localize('notification-server-destroyed'));
              },
              (e) => {
                // Don't show a toast on the login screen.
                if (!(e instanceof digitalocean_api.XhrError)) {
                  console.error(`Failed destroy server: ${e}`);
                  this.appRoot.showError(this.appRoot.localize('error-server-destroy'));
                }
              });
    });
  }

  private forgetSelectedServer() {
    const serverToForget = this.selectedServer;
    if (!isManualServer(serverToForget)) {
      const msg = 'cannot forget non-ManualServer';
      console.error(msg);
      throw new Error(msg);
    }

    const confirmationTitle = this.appRoot.localize('confirmation-server-remove-title');
    const confirmationText = this.appRoot.localize('confirmation-server-remove');
    const confirmationButton = this.appRoot.localize('remove');
    this.appRoot.getConfirmation(confirmationTitle, confirmationText, confirmationButton, () => {
      serverToForget.forget();
      this.removeServerFromDisplay(this.appRoot.selectedServer);
      this.appRoot.selectedServer = null;
      this.selectedServer = null;
      this.showIntro();
      this.appRoot.showNotification(this.appRoot.localize('notification-server-removed'));
    });
  }

  private async setMetricsEnabled(metricsEnabled: boolean) {
    const serverView = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await this.selectedServer.setMetricsEnabled(metricsEnabled);
      this.appRoot.showNotification(this.appRoot.localize('saved'));
      // Change metricsEnabled property on polymer element to update display.
      serverView.metricsEnabled = metricsEnabled;
    } catch (error) {
      console.error(`Failed to set metrics enabled: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-metrics'));
      serverView.metricsEnabled = !metricsEnabled;
    }
  }

  private async renameServer(newName: string) {
    const view = this.appRoot.getServerView(this.appRoot.selectedServer.id);
    try {
      await this.selectedServer.setName(newName);
      view.serverName = newName;
      this.syncAndShowServer(this.selectedServer);
    } catch (error) {
      console.error(`Failed to rename server: ${error}`);
      this.appRoot.showError(this.appRoot.localize('error-server-rename'));
      const oldName = this.selectedServer.getName();
      view.serverName = oldName;
      // tslint:disable-next-line:no-any
      (view.$.serverSettings as any).serverName = oldName;
    }
  }

  private cancelServerCreation(serverToCancel: server.Server): void {
    if (!isManagedServer(serverToCancel)) {
      const msg = 'cannot cancel non-ManagedServer';
      console.error(msg);
      throw new Error(msg);
    }
    serverToCancel.getHost().delete().then(() => {
      this.serverBeingCreated = null;
      this.removeServerFromDisplay(this.appRoot.selectedServer);
      this.appRoot.selectedServer = null;
      this.showCreateServer();
    });
  }

  private setAppLanguage(languageCode: string, languageDir: string) {
    this.appRoot.setLanguage(languageCode, languageDir);
    document.documentElement.setAttribute('dir', languageDir);
    window.localStorage.setItem('overrideLanguage', languageCode);
  }

  private createLocationModel(cityId: string, regionIds: string[]): Location {
    return {
      id: regionIds.length > 0 ? regionIds[0] : null,
      name: this.appRoot.localize(`city-${cityId}`),
      flag: DIGITALOCEAN_FLAG_MAPPING[cityId] || '',
      available: regionIds.length > 0,
    };
  }
}
