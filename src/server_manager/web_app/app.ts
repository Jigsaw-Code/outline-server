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
import * as events from 'events';

import * as digitalocean_api from '../cloud/digitalocean_api';
import * as errors from '../infrastructure/errors';
import * as server from '../model/server';

import {TokenManager} from './digitalocean_oauth';
import * as digitalocean_server from './digitalocean_server';
import {DisplayServer, DisplayServerRepository} from './display_server';

// tslint:disable-next-line:no-any
type Polymer = HTMLElement&any;

interface PolymerEvent extends Event {
  // tslint:disable-next-line:no-any
  detail: any;
}

// The Outline DigitalOcean team's referral code:
//   https://www.digitalocean.com/help/referral-program/
const DIGITALOCEAN_REFERRAL_CODE = '5ddb4219b716';

interface UiAccessKey {
  id: string;
  placeholderName: string;
  name: string;
  accessUrl: string;
  transferredBytes: number;
  relativeTraffic: number;
}

// Converts the access key from the remote service format to the
// format used by outline-server-view.
function convertToUiAccessKey(remoteAccessKey: server.AccessKey): UiAccessKey {
  return {
    id: remoteAccessKey.id,
    placeholderName: 'Key ' + remoteAccessKey.id,
    name: remoteAccessKey.name,
    accessUrl: remoteAccessKey.accessUrl,
    transferredBytes: 0,
    relativeTraffic: 0
  };
}

const DIGITAL_OCEAN_CREATION_ERROR_MESSAGE = `Sorry! We couldn't create a server this time.
  If this problem persists, it might be that your account needs to be reviewed by DigitalOcean.
  Please log in to www.digitalocean.com and follow their instructions.`;

function isManagedServer(testServer: server.Server): testServer is server.ManagedServer {
  return !!(testServer as server.ManagedServer).getHost;
}

function isManualServer(testServer: server.Server): testServer is server.ManualServer {
  return !!(testServer as server.ManualServer).forget;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type DigitalOceanSessionFactory = (accessToken: string) => digitalocean_api.DigitalOceanSession;
type DigitalOceanServerRepositoryFactory = (session: digitalocean_api.DigitalOceanSession) =>
    server.ManagedServerRepository;

export class App {
  private digitalOceanRepository: server.ManagedServerRepository;
  private selectedServer: server.Server;
  private serverBeingCreated: server.ManagedServer;
  private displayServerBeingCreated: DisplayServer;

  constructor(
      private appRoot: Polymer, private readonly appUrl: string, private readonly version: string,
      private createDigitalOceanSession: DigitalOceanSessionFactory,
      private createDigitalOceanServerRepository: DigitalOceanServerRepositoryFactory,
      private manualServerRepository: server.ManualServerRepository,
      private displayServerRepository: DisplayServerRepository,
      private digitalOceanTokenManager: TokenManager) {
    appRoot.setAttribute('outline-version', this.version);

    appRoot.addEventListener('ConnectToDigitalOcean', (event: PolymerEvent) => {
      this.connectToDigitalOcean();
    });
    appRoot.addEventListener('SignOutRequested', (event: PolymerEvent) => {
      this.clearCredentialsAndShowIntro();
    });

    appRoot.addEventListener('SetUpServerRequested', (event: PolymerEvent) => {
      this.createDigitalOceanServer(event.detail.regionId);
    });

    appRoot.addEventListener('DeleteServerRequested', (event: PolymerEvent) => {
      this.deleteSelectedServer();
    });

    appRoot.addEventListener('ForgetServerRequested', (event: PolymerEvent) => {
      this.forgetSelectedServer();
    });

    appRoot.addEventListener('AddAccessKeyRequested', (event: PolymerEvent) => {
      this.addAccessKey();
    });

    appRoot.addEventListener('RemoveAccessKeyRequested', (event: PolymerEvent) => {
      this.removeAccessKey(event.detail.accessKeyId);
    });

    appRoot.addEventListener('RenameAccessKeyRequested', (event: PolymerEvent) => {
      this.renameAccessKey(event.detail.accessKeyId, event.detail.newName, event.detail.entry);
    });

    appRoot.addEventListener('ManualServerEntered', (event: PolymerEvent) => {
      const manualServerEntryEl = appRoot.getManualServerEntry();
      const userInputConfig = event.detail.userInputConfig;
      if (!userInputConfig) {
        manualServerEntryEl.showConnection = false;
        const errorTitle = 'Failed to import server';
        const errorText =
            'Please paste the output from the installation process before proceeding.';
        this.appRoot.showManualServerError(errorTitle, errorText);
        return;
      }
      userInputConfig.replace(/\s+/g, '');  // Remove whitespace
      this.createManualServer(userInputConfig)
          .then(() => {
            // Clear fields on outline-manual-server-entry (e.g. dismiss the connecting popup).
            manualServerEntryEl.clear();
          })
          .catch((e: Error) => {
            // Remove the "Attempting to connect..." display.
            manualServerEntryEl.showConnection = false;
            // Display either error dialog or feedback depending on error type.
            if (e instanceof errors.UnreachableServerError) {
              const errorTitle = 'Unable to connect to your Outline Server';
              this.appRoot.showManualServerError(errorTitle, e.message);
            } else {
              let errorMessage = '';
              if (e.message) {
                errorMessage += `${e.message}\n`;
              }
              if (userInputConfig) {
                errorMessage += userInputConfig;
              }
              appRoot.openManualInstallFeedback(errorMessage);
            }
          });
    });

    appRoot.addEventListener('EnableMetricsRequested', (event: PolymerEvent) => {
      this.setMetricsEnabled(true);
    });

    appRoot.addEventListener('DisableMetricsRequested', (event: PolymerEvent) => {
      this.setMetricsEnabled(false);
    });

    appRoot.addEventListener('SubmitFeedback', (event: PolymerEvent) => {
      const detail = event.detail;
      try {
        sentry.captureEvent({
          message: detail.userFeedback,
          user: {email: detail.userEmail},
          tags: {category: detail.feedbackCategory, cloudProvider: detail.cloudProvider}
        });
        appRoot.showNotification('Thanks for helping us improve! We love hearing from you.');
      } catch (e) {
        appRoot.showError('Failed to submit feedback. Please try again.');
      }
    });

    appRoot.addEventListener('ServerRenameRequested', (event: PolymerEvent) => {
      this.renameServer(event.detail.newName);
    });

    appRoot.addEventListener('CancelServerCreationRequested', (event: PolymerEvent) => {
      this.cancelServerCreation(this.selectedServer);
    });

    appRoot.addEventListener('OpenImageRequested', (event: PolymerEvent) => {
      openImage(event.detail.imagePath);
    });

    appRoot.addEventListener('OpenShareDialogRequested', (event: PolymerEvent) => {
      const accessKey = event.detail.accessKey;
      this.appRoot.openShareDialog(accessKey, this.getS3InviteUrl(accessKey));
    });

    appRoot.addEventListener('OpenGetConnectedDialogRequested', (event: PolymerEvent) => {
      this.appRoot.openGetConnectedDialog(this.getS3InviteUrl(event.detail.accessKey, true));
    });

    appRoot.addEventListener('ShowServerRequested', (event: PolymerEvent) => {
      this.handleShowServerRequested(event.detail.displayServerId);
    });

    onUpdateDownloaded(this.displayAppUpdateNotification.bind(this));
  }

  start(): void {
    this.syncDisplayServersToUi();

    // Load display servers and associate them with managed and manual servers.
    this.manualServerRepository.listServers().then((manualServers) => {
      this.syncServersToDisplay(manualServers).then(() => {
        this.maybeShowLastDisplayedServer();
      });
    });

    const accessToken = this.digitalOceanTokenManager.getStoredToken();
    if (accessToken) {
      this.enterDigitalOceanMode(accessToken).then((managedServers) => {
        this.syncServersToDisplay(managedServers).then(() => {
          this.maybeShowLastDisplayedServer();
        });
      });
    }
    this.showIntro();
  }

  private async syncServersToDisplay(servers: server.Server[]) {
    for (const server of servers) {
      await this.syncServerToDisplay(server);
    }
  }

  // Syncs the locally persisted server metadata for `server`. Creates a DisplayServer for `server`
  // if one is not found in storage. While this method does not make any assumptions on whether the
  // server is reachable, it does assume that its management API URL is available.
  private async syncServerToDisplay(server: server.Server): Promise<DisplayServer> {
    // We key display servers by the server management API URL, which can be retrieved independently
    // of the server health.
    const displayServerId = server.getManagementApiUrl();
    let displayServer = this.displayServerRepository.findServer(displayServerId);
    if (!displayServer) {
      console.warn(`Could not find display server with ID ${displayServerId}`);
      const isHealthy = await server.isHealthy().catch((e) => false);
      displayServer = {
        id: displayServerId,
        name: isHealthy ? server.getName() : server.getHostname(),
        isManaged: isManagedServer(server)
      };
      this.displayServerRepository.addServer(displayServer);
      this.syncDisplayServersToUi();
    } else {
      // We may need to update the stored display server if it was persisted when the server was not
      // healthy.
      try {
        const remoteServerName = server.getName();
        if (displayServer.name !== remoteServerName) {
          displayServer.name = remoteServerName;
          this.removeServerFromDisplay(displayServer);
          this.displayServerRepository.addServer(displayServer);
          this.syncDisplayServersToUi();
        }
      } catch (e) {
        // Ignore, we may not have the server config yet.
      }
    }
    return displayServer;
  }

  private syncDisplayServersToUi() {
    this.displayServerRepository.listServers().then((displayServers) => {
      this.appRoot.serverList = displayServers;
      if (!!this.displayServerBeingCreated) {
        // Trigger Polymer array mutation.
        this.appRoot.push('serverList', this.displayServerBeingCreated);
      }
    });
  }

  // Removes `displayServer` from the UI.
  private removeServerFromDisplay(displayServer: DisplayServer) {
    this.displayServerRepository.removeServer(displayServer);
    this.syncDisplayServersToUi();
  }

  // Retrieves a server associated to `displayServer`.
  private async getServerFromRepository(displayServer: DisplayServer): Promise<server.Server|null> {
    const apiManagementUrl = displayServer.id;
    let server: server.Server = null;
    if (displayServer.isManaged) {
      const accessToken = this.digitalOceanTokenManager.getStoredToken();
      if (accessToken) {
        const managedServers: server.ManagedServer[] =
            await this.enterDigitalOceanMode(accessToken).catch(e => []);
        server = managedServers.find(
            (managedServer) => managedServer.getManagementApiUrl() === apiManagementUrl);
      }
    } else {
      server =
          this.manualServerRepository.findServer({'apiUrl': apiManagementUrl, 'certSha256': ''});
    }
    return server;
  }

  // Shows the last server displayed, if there is one in local storage and it still exists.
  private maybeShowLastDisplayedServer() {
    const lastDisplayedServerId = this.displayServerRepository.getLastDisplayedServerId();
    if (!lastDisplayedServerId) {
      return;  // No server was displayed when user quit the app.
    }
    const lastDisplayedServer = this.displayServerRepository.findServer(lastDisplayedServerId);
    if (!lastDisplayedServer) {
      return console.warn('Last displayed server ID not found in display sever repository');
    }
    this.getAndShowServerFromRepository(lastDisplayedServer);
  }

  private async handleShowServerRequested(displayServerId: string) {
    const displayServer =
        this.displayServerRepository.findServer(displayServerId) || this.displayServerBeingCreated;
    if (!displayServer) {
      // This shouldn't happen since the displayed servers are fetched from the repository.
      console.error('Display server not found in storage');
      return;
    }
    const server = await this.getServerFromRepository(displayServer);
    if (!server && !!this.serverBeingCreated) {
      this.showServerCreationProgress();
    } else if (!!server) {
      this.showServerIfHealthy(server, displayServer);
    } else {
      // We should never reach this.
      console.error(`Could not find manual server for display server ID ${displayServerId}`);
    }
  }

  private getAndShowServerFromRepository(displayServer: DisplayServer) {
    this.getServerFromRepository(displayServer).then((server) => {
      if (!!server) {
        this.showServerIfHealthy(server, displayServer);
      }
    });
  }

  // Signs in to DigitalOcean through the OAuthFlow. Creates a `ManagedServerRepository` and
  // resolves with the servers present in the account.
  private enterDigitalOceanMode(accessToken: string): Promise<server.ManagedServer[]> {
    const doSession = this.createDigitalOceanSession(accessToken);
    const authEvents = new events.EventEmitter();
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
                const msg = 'Failed to get DigitalOcean account information';
                this.displayError(msg, error);
                reject(new Error(`${msg}: ${error}`));
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
        const serverView = this.appRoot.getServerView();
        serverView.isServerReachable = false;
        serverView.isServerManaged = isManagedServer(server);
        serverView.serverName = displayServer.name;  // Don't get the name from the remote server.
        serverView.retryDisplayingServer = () => {
          this.showServerIfHealthy(server, displayServer);
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

      return new Promise((resolve, reject) => {
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

  private displayError(message: string, cause: Error) {
    console.error(`${message}: ${cause}`);
    this.appRoot.showError(message);
    console.error(message);
  }

  private displayNotification(message: string) {
    this.appRoot.showNotification(message);
  }

  // Shows the intro screen with overview and options to sign in or sign up.
  private showIntro() {
    this.appRoot.showIntro();
  }

  private displayAppUpdateNotification() {
    const msg =
        'An updated version of the Outline Manager has been downloaded. It will be installed when you restart the application.';
    this.appRoot.showToast(msg, 60000);
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
                this.getServerFromRepository(displayServer);
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
            this.displayError('Authentication with DigitalOcean failed', error);
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
              // Change from a list of regions per location to just one region per location.
              // Where there are multiple working regions in one location, arbitrarily use the
              // first.
              const availableRegionIds: {[cityId: string]: server.RegionId} = {};
              for (const cityId in map) {
                if (map[cityId].length > 0) {
                  availableRegionIds[cityId] = map[cityId][0];
                }
              }
              regionPicker.availableRegionIds = availableRegionIds;
            },
            (e) => {
              this.displayError('Failed to get list of available regions', e);
            });
  }

  private showServerCreationProgress() {
    // Set selected server, needed for cancel button.
    this.selectedServer = this.serverBeingCreated;
    this.appRoot.selectedServer = this.displayServerBeingCreated;
    // Update UI.  Only show cancel button if the server has not yet finished
    // installation, to prevent accidental deletion when restarting.
    const showCancelButton = !this.serverBeingCreated.isInstallCompleted();
    this.appRoot.showProgress(this.displayServerBeingCreated.name, showCancelButton);
  }

  private waitForManagedServerCreation(tryAgain = false): void {
    this.serverBeingCreated.waitOnInstall(tryAgain)
        .then(() => {
          this.syncServerToDisplay(this.serverBeingCreated).then((displayServer) => {
            this.removeServerFromDisplay(this.displayServerBeingCreated);
            this.showServer(this.serverBeingCreated, displayServer);
            this.serverBeingCreated = null;
            this.displayServerBeingCreated = null;
          });
        })
        .catch((e) => {
          console.log(e);
          if (e instanceof errors.DeletedServerError) {
            // The user deleted this server, no need to show an error or delete it again.
            this.serverBeingCreated = null;
            this.displayServerBeingCreated = null;
            return;
          }
          const errorMessage = this.serverBeingCreated.isInstallCompleted() ?
              'We are unable to connect to your Outline server at the moment.  This may be due to a firewall on your network or temporary connectivity issues with digitalocean.com.' :
              'There was an error creating your Outline server.  This may be due to a firewall on your network or temporary connectivity issues with digitalocean.com.';
          this.appRoot
              .showModalDialog(
                  null,  // Don't display any title.
                  errorMessage, ['Delete this server', 'Try again'])
              .then((clickedButtonIndex: number) => {
                if (clickedButtonIndex === 0) {  // user clicked 'Delete this server'
                  console.info('Deleting unreachable server');
                  this.serverBeingCreated.getHost().delete().then(() => {
                    this.serverBeingCreated = null;
                    this.displayServerBeingCreated = null;
                    this.showCreateServer();
                  });
                } else if (clickedButtonIndex === 1) {  // user clicked 'Try again'.
                  console.info('Retrying unreachable server');
                  this.waitForManagedServerCreation(true);
                }
              });
        });
  }

  // Returns a promise which fulfills once the DigitalOcean droplet is created.
  // Shadowbox may not be fully installed once this promise is fulfilled.
  public createDigitalOceanServer(regionId: server.RegionId) {
    return this
        .digitalOceanRetry(() => {
          return this.digitalOceanRepository.createServer(regionId);
        })
        .then((server) => {
          // Set name to the default server name for this region. Because the server
          // is still being created, the getName REST API will not yet be available.
          const regionId = server.getHost().getRegionId();
          const serverName = digitalocean_server.MakeEnglishNameForServer(regionId);
          this.serverBeingCreated = server;
          this.displayServerBeingCreated = {
            id: server.getHost().getHostId(),  // Use the droplet ID until the API URL is available.
            name: serverName,
            isManaged: true
          };
          this.syncDisplayServersToUi();
          // Show creation progress for new servers only after we have a ManagedServer object,
          // otherwise the cancel action will not be available.
          this.showServerCreationProgress();
          this.waitForManagedServerCreation();
        })
        .catch((e) => {
          // Sanity check - this error is not expected to occur, as waitForManagedServerCreation
          // has it's own error handling.
          console.error('error from waitForManagedServerCreation');
          return Promise.reject(e);
        });
  }

  // Show the server management screen. Assumes the server is healthy.
  private showServer(selectedServer: server.Server, selectedDisplayServer: DisplayServer): void {
    this.selectedServer = selectedServer;
    this.appRoot.selectedServer = selectedDisplayServer;
    this.displayServerRepository.storeLastDisplayedServerId(selectedDisplayServer.id);

    // Show view and initialize fields from selectedServer.
    const view = this.appRoot.getServerView();
    view.isServerReachable = true;
    view.serverId = selectedServer.getServerId();
    view.serverName = selectedServer.getName();
    view.serverHostname = selectedServer.getHostname();
    view.serverManagementPort = selectedServer.getManagementPort();
    view.serverCreationDate = selectedServer.getCreatedDate().toLocaleString(
        'en-US', {year: 'numeric', month: 'long', day: 'numeric'});

    if (isManagedServer(selectedServer)) {
      view.isServerManaged = true;
      const host = selectedServer.getHost();
      view.monthlyCost = host.getMonthlyCost().usd;
      view.monthlyOutboundTransferBytes =
          host.getMonthlyOutboundTransferLimit().terabytes * (2 ** 40);
      view.serverLocation = digitalocean_server.GetEnglishCityName(host.getRegionId());
    } else {
      view.isServerManaged = false;
      // TODO(dborkan): consider using dom-if with restamp property
      // https://www.polymer-project.org/1.0/docs/api/elements/dom-if
      // or using template-repeat.  Then we won't have to worry about clearing
      // the server-view when we display a new server.  This should be fixed
      // once we support multiple servers.
      view.serverLocation = undefined;
      view.monthlyCost = undefined;
      view.monthlyOutboundTransferBytes = undefined;
    }

    view.metricsEnabled = selectedServer.getMetricsEnabled();
    view.selectedTab = 'connections';
    this.appRoot.showServerView();
    this.showMetricsOptInWhenNeeded(selectedServer, view);

    // Load "My Connection" and other access keys.
    selectedServer.listAccessKeys()
        .then((serverAccessKeys: server.AccessKey[]) => {
          view.accessKeyRows = serverAccessKeys.map(convertToUiAccessKey);
          // Initialize help bubbles once the page has rendered.
          setTimeout(() => {
            view.initHelpBubbles();
          }, 250);
        })
        .catch((error) => {
          this.displayError('Could not load keys', error);
        });

    this.showTransferStats(selectedServer, view);
  }

  private showMetricsOptInWhenNeeded(selectedServer: server.Server, serverView: Polymer) {
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

  private showTransferStats(selectedServer: server.Server, serverView: Polymer) {
    const refreshTransferStats = () => {
      selectedServer.getDataUsage().then(
          (stats) => {
            // Calculate total bytes transferred.
            let totalBytes = 0;
            // tslint:disable-next-line:forin
            for (const accessKeyId in stats.bytesTransferredByUserId) {
              totalBytes += stats.bytesTransferredByUserId[accessKeyId];
            }
            serverView.setServerTransferredData(totalBytes);
            // tslint:disable-next-line:forin
            for (const accessKeyId in stats.bytesTransferredByUserId) {
              const transferredBytes = stats.bytesTransferredByUserId[accessKeyId];
              const relativeTraffic = totalBytes ? 100 * transferredBytes / totalBytes : 0;
              serverView.updateAccessKeyRow(accessKeyId, {transferredBytes, relativeTraffic});
            }
          },
          (e) => {
            // Since failures are invisible to users we generally want exceptions here to bubble
            // up and trigger a Sentry report. The exception is network errors, about which we can't
            // do much (note: ShadowboxServer generates a breadcrumb for failures regardless which
            // will show up when someone explicitly submits feedback).
            if (e instanceof errors.ServerApiError && e.isNetworkError()) {
              return;
            }
            throw e;
          });
    };
    refreshTransferStats();

    // Get transfer stats once per minute for as long as server is selected.
    const statsRefreshRateMs = 60 * 1000;
    const intervalId = setInterval(() => {
      if (this.selectedServer !== selectedServer) {
        // Server is no longer running, stop interval
        clearInterval(intervalId);
        return;
      }
      refreshTransferStats();
    }, statsRefreshRateMs);
  }

  private getS3InviteUrl(accessUrl: string, isAdmin = false) {
    const adminParam = isAdmin ? '?admin_embed' : '';
    return `https://s3.amazonaws.com/outline-vpn/invite.html${adminParam}#${
        encodeURIComponent(accessUrl)}`;
  }

  private addAccessKey() {
    this.selectedServer.addAccessKey()
        .then((serverAccessKey: server.AccessKey) => {
          const uiAccessKey = convertToUiAccessKey(serverAccessKey);
          this.appRoot.getServerView().addAccessKey(uiAccessKey);
          this.displayNotification('Key added');
        })
        .catch((error) => {
          this.displayError('Failed to add key', error);
        });
  }

  private renameAccessKey(accessKeyId: string, newName: string, entry: Polymer) {
    this.selectedServer.renameAccessKey(accessKeyId, newName)
        .then(() => {
          entry.commitName();
        })
        .catch((error) => {
          this.displayError('Failed to rename key', error);
          entry.revertName();
        });
  }

  // Returns promise which fulfills when the server is created successfully,
  // or rejects with an error message that can be displayed to the user.
  public createManualServer(userInputConfig: string): Promise<void> {
    // Parse and validate user input.
    let serverConfig: server.ManualServerConfig;
    try {
      // Remove anything before the first '{' and after the last '}', in case
      // the user accidentally copied extra from the install script.
      userInputConfig = userInputConfig.substr(userInputConfig.indexOf('{'));
      userInputConfig = userInputConfig.substr(0, userInputConfig.lastIndexOf('}') + 1);
      serverConfig = JSON.parse(userInputConfig);
    } catch (e) {
      console.error('Invalid server configuration: could not parse JSON.');
      return Promise.reject(new Error(''));
    }
    if (!serverConfig.apiUrl) {
      const msg = 'Invalid server configuration: apiUrl is missing.';
      console.error(msg);
      return Promise.reject(new Error(msg));
    } else if (!serverConfig.certSha256) {
      const msg = 'Invalid server configuration: certSha256 is missing.';
      console.error(msg);
      return Promise.reject(new Error(msg));
    }

    // Don't let `ManualServerRepository.addServer` throw to avoid redundant error handling if we
    // are adding an existing server. Query the repository instead to treat the UI accordingly.
    const storedServer = this.manualServerRepository.findServer(serverConfig);
    if (!!storedServer) {
      return this.syncServerToDisplay(storedServer).then((displayServer) => {
        this.appRoot.showToast('Server already added', 5000);
        this.showServerIfHealthy(storedServer, displayServer);
      });
    }
    return this.manualServerRepository.addServer(serverConfig).then((manualServer) => {
      return manualServer.isHealthy().then((isHealthy) => {
        if (isHealthy) {
          return this.syncServerToDisplay(manualServer).then((displayServer) => {
            this.showServer(manualServer, displayServer);
          });
        } else {
          // Remove inaccessible manual server from local storage if it was just created.
          manualServer.forget();
          console.error('Manual server installed but unreachable.');
          return Promise.reject(new errors.UnreachableServerError(
              'Your Outline Server was installed correctly, but we are not able to connect to it. Most likely this is because your server\'s firewall rules are blocking incoming connections. Please review them and make sure to allow incoming TCP connections on ports ranging from 1024 to 65535.'));
        }
      });
    });
  }

  private removeAccessKey(accessKeyId: string) {
    this.selectedServer.removeAccessKey(accessKeyId)
        .then(() => {
          this.appRoot.getServerView().removeAccessKey(accessKeyId);
          this.displayNotification('Key removed');
        })
        .catch((error) => {
          this.displayError('Failed to remove key', error);
        });
  }

  private deleteSelectedServer() {
    const serverToDelete = this.selectedServer;
    if (!isManagedServer(serverToDelete)) {
      const msg = 'cannot delete non-ManagedServer';
      console.error(msg);
      throw new Error(msg);
    }

    const confirmationTitle = 'Destroy Server?';
    const confirmationText = 'Existing users will lose access.  This action cannot be undone.';
    const confirmationButton = 'DESTROY';
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
                this.displayNotification('Server destroyed');
              },
              (e) => {
                // Don't show a toast on the login screen.
                if (!(e instanceof digitalocean_api.XhrError)) {
                  this.displayError('Failed to destroy server', e);
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

    const confirmationTitle = 'Remove Server?';
    const confirmationText =
        'This action removes your server from the Outline Manager, but does not block proxy access to users.  You will still need to manually delete the Outline server from your host machine.';
    const confirmationButton = 'REMOVE';
    this.appRoot.getConfirmation(confirmationTitle, confirmationText, confirmationButton, () => {
      serverToForget.forget();
      this.removeServerFromDisplay(this.appRoot.selectedServer);
      this.appRoot.selectedServer = null;
      this.selectedServer = null;
      this.showIntro();
      this.displayNotification('Server removed');
    });
  }

  private setMetricsEnabled(metricsEnabled: boolean) {
    this.selectedServer.setMetricsEnabled(metricsEnabled)
        .then(() => {
          // Change metricsEnabled property on polymer element to update display.
          this.appRoot.getServerView().metricsEnabled = metricsEnabled;
        })
        .catch((error) => {
          this.displayError('Error setting metrics enabled', error);
        });
  }

  private renameServer(newName: string): void {
    this.selectedServer.setName(newName)
        .then(() => {
          this.appRoot.getServerView().serverName = newName;
          this.removeServerFromDisplay(this.appRoot.selectedServer);
          this.syncServerToDisplay(this.selectedServer).then((displayServer) => {
            this.appRoot.selectedServer = displayServer;
          });
        })
        .catch((error) => {
          this.displayError('Error renaming server', error);
        });
  }

  private cancelServerCreation(serverToCancel: server.Server): void {
    if (!isManagedServer(serverToCancel)) {
      const msg = 'cannot cancel non-ManagedServer';
      console.error(msg);
      throw new Error(msg);
    }
    serverToCancel.getHost().delete().then(() => {
      const displayServerToCancel = this.displayServerBeingCreated;
      this.displayServerBeingCreated = null;
      this.appRoot.selectedServer = null;
      this.removeServerFromDisplay(displayServerToCancel);
      this.showCreateServer();
    });
  }
}
