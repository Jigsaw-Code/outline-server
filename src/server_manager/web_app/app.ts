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

import * as digitalocean_api from '../cloud/digitalocean_api';
import * as errors from '../infrastructure/errors';
import * as server from '../model/server';

import {getOauthUrl, TokenManager} from './digitalocean_oauth';
import * as digitalocean_server from './digitalocean_server';
import {SentryErrorReporter} from './error_reporter';
import {ManualServerRepository} from './manual_server';

// tslint:disable-next-line:no-any
type Polymer = HTMLElement&any;

interface PolymerEvent extends Event {
  // tslint:disable-next-line:no-any
  detail: any;
}

// The Outline DigitalOcean team's referral code:
//   https://www.digitalocean.com/help/referral-program/
const DIGITALOCEAN_REFERRAL_CODE = '5ddb4219b716';

// These functions are defined in electron_app/preload.ts.
declare function clearDigitalOceanCookies(): boolean;
declare function onElectronEvent(event: string, listener: () => void): void;
declare function sendElectronEvent(event: string): void;

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

type DigitalOceanSessionFactory = (accessToken: string) => digitalocean_api.DigitalOceanSession;
type DigitalOceanServerRepositoryFactory = (session: digitalocean_api.DigitalOceanSession) =>
    server.ManagedServerRepository;

export class App {
  private digitalOceanRepository: server.ManagedServerRepository;
  private selectedServer: server.Server;
  private runningServer: server.Server;

  constructor(
      private appRoot: Polymer, private readonly appUrl: string, private readonly version: string,
      private createDigitalOceanSession: DigitalOceanSessionFactory,
      private createDigitalOceanServerRepository: DigitalOceanServerRepositoryFactory,
      private manualServerRepository: server.ManualServerRepository,
      private digitalOceanTokenManager: TokenManager) {
    appRoot.setAttribute('outline-version', this.version);

    appRoot.addEventListener('SignOutRequested', (event: PolymerEvent) => {
      this.clearCredentialsAndShowIntro();
    });

    appRoot.addEventListener('ClearDigitalOceanCookiesRequested', (event: PolymerEvent) => {
      this.signOutFromDigitalocean();
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
      const userInputConfig = event.detail.userInputConfig;
      const manualServerEntryEl = appRoot.getServerCreator().getManualServerEntry();
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
              manualServerEntryEl.showError('Unable to connect to your Outline Server', e.message);
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
        SentryErrorReporter.report(detail.userFeedback, detail.feedbackCategory, detail.userEmail);
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

    onElectronEvent('update-downloaded', this.displayAppUpdateNotification.bind(this));
    sendElectronEvent('app-ui-ready');
  }

  // Returns a Promise that fulfills once the correct UI screen is shown.
  start(): Promise<void> {
    // Load manual servers from storage.
    return this.manualServerRepository.listServers().then((manualServers) => {
      // Show any manual servers if they exist.
      if (manualServers.length > 0) {
        this.showManualServerIfHealthy(manualServers[0]);
        return;
      }

      // User has no manual servers - check if they are logged into DigitalOcean.
      const accessToken = this.digitalOceanTokenManager.extractTokenFromUrl();
      if (accessToken) {
        return this.getDigitalOceanServerList(accessToken)
            .then((serverList) => {
              // Check if this user already has a shadowsocks server, if so show that.
              // This assumes we only allow one shadowsocks server per DigitalOcean user.
              if (serverList.length > 0) {
                this.showManagedServer(serverList[0]);
              } else {
                this.showCreateServer();
              }
            })
            .catch((e) => {
              const msg = 'could not fetch account details and/or server list';
              console.error(msg, e);
              SentryErrorReporter.logError(msg);
              this.showIntro();
            });
      }

      // User has no manual servers or DigitalOcean token.
      this.showIntro();
    });
  }

  private showManualServerIfHealthy(manualServer: server.ManualServer) {
    manualServer.isHealthy().then((isHealthy) => {
      if (isHealthy) {
        this.showServer(manualServer);
        return;
      }

      // Error reaching manual server, request that the user to choose between
      // forgetting the server and trying again.
      this.appRoot
          .showModalDialog(
              null,  // Don't display any title.
              'We are unable to reach your Outline server.  Please check that it is still running and accessible.',
              ['Forget this server', 'Try again'])
          .then((clickedButtonIndex: number) => {
            if (clickedButtonIndex === 0) {  // user clicked 'Forget this server'
              manualServer.forget();
              this.displayNotification('Server forgotten');
              this.showIntro();
              return;
            } else if (clickedButtonIndex === 1) {  // user clicked 'Try again'.
              this.showManualServerIfHealthy(manualServer);
              return;
            }
          });
    });
  }

  // Returns a Promise that fulfills once the correct UI screen is shown.
  private getDigitalOceanServerList(accessToken: string): Promise<server.ManagedServer[]> {
    // Save accessToken to storage. DigitalOcean tokens
    // expire after 30 days, unless they are manually revoked by the user.
    // After 30 days the user will have to sign into DigitalOcean again.
    // Note we cannot yet use DigitalOcean refresh tokens, as they require
    // a client_secret to be stored on a server and not visible to end users
    // in client-side JS.  More details at:
    // https://developers.digitalocean.com/documentation/oauth/#refresh-token-flow
    this.digitalOceanTokenManager.writeTokenToStorage(accessToken);

    // Fetch the user's email address and list of servers then change to
    // either the region picker or management screen, depending on whether
    // they have a server.
    const digitalOceanSession = this.createDigitalOceanSession(accessToken);
    return this
        .digitalOceanRetry(() => {
          return digitalOceanSession.getAccount().then((account) => {
            this.appRoot.adminEmail = account.email;

            this.digitalOceanRepository =
                this.createDigitalOceanServerRepository(digitalOceanSession);
            return this.digitalOceanRepository.listServers();
          });
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
  private digitalOceanRetry = <T>(f: () => Promise<T>):
      Promise<T> => {
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
      }

  private displayError(message: string, cause: Error) {
    console.error(`${message}: ${cause}`);
    this.appRoot.showError(message);
    SentryErrorReporter.logError(message);
  }

  private displayNotification(message: string) {
    this.appRoot.showNotification(message);
  }

  // Shows the intro screen with overview and options to sign in or sign up.
  private showIntro() {
    this.appRoot.getAndShowServerCreator().showIntro(
        getOauthUrl(this.appUrl), DIGITALOCEAN_REFERRAL_CODE);
  }

  private displayAppUpdateNotification() {
    const msg =
        'An updated version of the Outline Manager has been downloaded. It will be installed when you restart the application.';
    this.appRoot.showToast(msg, 60000);
  }

  // Clears the credentials and returns to the intro screen.
  private clearCredentialsAndShowIntro() {
    this.signOutFromDigitalocean();
    // Remove credential from URL and local storage.
    location.hash = '';
    this.digitalOceanTokenManager.removeTokenFromStorage();
    // Reset UI
    this.appRoot.adminEmail = '';
    this.showIntro();
  }

  private signOutFromDigitalocean() {
    if (typeof clearDigitalOceanCookies === 'function') {
      clearDigitalOceanCookies();
    } else {
      // Running outside of Electron, use old iframe logic.
      // We load the logout page on an iframe so that the browser clears the
      // credential cookies properly. We can't get the credential cookies cleared
      // with a XHR.
      const iframe = document.createElement('iframe');
      iframe.src = 'https://cloud.digitalocean.com/logout';
      iframe.onload = () => {
        const msg = 'Signed out from DigitalOcean';
        console.log(msg);
        SentryErrorReporter.logInfo(msg);
        iframe.remove();
      };
      iframe.onerror = () => {
        const msg = 'DigitalOcean iframe error';
        console.error(msg);
        SentryErrorReporter.logError(msg);
        iframe.remove();
      };
      document.body.appendChild(iframe);
    }
  }

  // Opens the screen to create a server.
  private showCreateServer() {
    const regionPicker = this.appRoot.getAndShowServerCreator().getAndShowRegionPicker();
    // The region picker initially shows all options as disabled.  Options are enabled
    // by this code, after checking which regions are available.
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

  private showServerCreationProgress(managedServer: server.ManagedServer) {
    // Set name to the default server name for this region.  Because the server
    // is still being created, the getName REST API will not yet be available.
    const regionId = managedServer.getHost().getRegionId();
    const serverName = digitalocean_server.MakeEnglishNameForServer(regionId);
    // Set selected server, needed for cancel button.
    this.selectedServer = managedServer;
    // Update UI.  Only show cancel button if the server has not yet finished
    // installation, to prevent accidental deletion when restarting.
    const showCancelButton = !managedServer.isInstallCompleted();
    this.appRoot.getAndShowServerCreator().showProgress(serverName, showCancelButton);
  }

  private showManagedServer(managedServer: server.ManagedServer, tryAgain = false): void {
    // Show creation progress only after we have a ManagedServer object,
    // otherwise the cancel action will not be available.
    this.showServerCreationProgress(managedServer);

    managedServer.waitOnInstall(tryAgain)
        .then(() => {
          this.showServer(managedServer);
        })
        .catch((e) => {
          if (e instanceof errors.DeletedServerError) {
            // The user deleted this server, no need to show an error or delete
            // it again.
            return;
          }
          const errorMessage = managedServer.isInstallCompleted() ?
              'We are unable to connect to your Outline server at the moment.  This may be due to a firewall on your network or temporary connectivity issues with digitalocean.com.' :
              'There was an error creating your Outline server.  This may be due to a firewall on your network or temporary connectivity issues with digitalocean.com.';
          SentryErrorReporter.logError(errorMessage);
          this.appRoot
              .showModalDialog(
                  null,  // Don't display any title.
                  errorMessage, ['Delete this server', 'Try again'])
              .then((clickedButtonIndex: number) => {
                if (clickedButtonIndex === 0) {  // user clicked 'Delete this server'
                  SentryErrorReporter.logInfo('Deleting unreachable server');
                  managedServer.getHost().delete().then(() => {
                    this.showCreateServer();
                  });
                } else if (clickedButtonIndex === 1) {  // user clicked 'Try again'.
                  SentryErrorReporter.logInfo('Retrying unreachable server');
                  this.showManagedServer(managedServer, true);
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
        .then((managedServer) => {
          this.showManagedServer(managedServer);
        })
        .catch((e) => {
          // Sanity check - this error is not expected to occur, as showManagedServer
          // has it's own error handling.
          console.error('error from showManagedServer', e);
          return Promise.reject(e);
        });
  }

  // Displays `DIGITAL_OCEAN_CREATION_ERROR_MESSAGE` in a dialog that prompts the user to submit
  // feedback. Logs `msg` and `error` to the console and Sentry.
  private handleServerCreationFailure(msg: string, error: Error) {
    console.error(msg, error);
    SentryErrorReporter.logError(msg);
    this.appRoot
        .showModalDialog(
            'Failed to create server', DIGITAL_OCEAN_CREATION_ERROR_MESSAGE,
            ['Cancel', 'Submit Feedback'])
        .then((clickedButtonIndex: number) => {
          if (clickedButtonIndex === 1) {
            const feedbackDialog = this.appRoot.$.feedbackDialog;
            feedbackDialog.open(null, null, feedbackDialog.feedbackCategories.INSTALLATION);
          }
          this.showCreateServer();  // Reset UI.
        });
  }

  // Show the server management screen.
  private showServer(selectedServer: server.Server): void {
    this.selectedServer = selectedServer;
    this.runningServer = selectedServer;

    // Show view and initialize fields from selectedServer.
    const view = this.appRoot.getAndShowServerView();
    view.serverName = selectedServer.getName();

    if (isManagedServer(selectedServer)) {
      const host = selectedServer.getHost();
      view.monthlyCost = host.getMonthlyCost().usd;
      view.deleteEnabled = true;
      view.forgetEnabled = false;
      // Set monthly transfer byte limit for UI.  For UI simplicity we are:
      // 1. Showing 1 TB as 1000 GB (not 1024)
      // 2. Dividing the total transfer limit by 2 to account for inbound and
      //    outbound connections, i.e. if I download a 10 GB file, it has to
      //    first be download from destination to the Outline server, then from
      //    the Outline server to my client, and costs me 20 GB against my quota,
      //    in this case it's simpler to say I used 10/500GB instead of 20/1000GB.
      const monthlyTransferGb = host.getMonthlyTransferLimit().terabytes * 1000 / 2;
      view.monthlyTransferBytes = monthlyTransferGb * (2 ** 30);
    } else {
      // TODO(dborkan): consider using dom-if with restamp property
      // https://www.polymer-project.org/1.0/docs/api/elements/dom-if
      // or using template-repeat.  Then we won't have to worry about clearing
      // the server-view when we display a new server.  This should be fixed
      // once we support multiple servers.
      view.monthlyCost = undefined;
      view.monthlyTransferBytes = undefined;
      view.deleteEnabled = false;
      view.forgetEnabled = true;
    }

    view.metricsEnabled = selectedServer.getMetricsEnabled();
    this.showMetricsOptInWhenNeeded(selectedServer, view);
    view.serverId = selectedServer.getServerId();

    // Load "My Connection" and other access keys.
    selectedServer.listAccessKeys()
        .then((serverAccessKeys: server.AccessKey[]) => {
          view.accessKeyRows = serverAccessKeys.map(convertToUiAccessKey);
        })
        .catch((error) => {
          this.displayError('Could not load keys', error);
        });

    this.showTransferStats(selectedServer, view);
  }

  private showMetricsOptInWhenNeeded(runningServer: server.Server, serverView: Polymer) {
    const showMetricsOptInOnce = () => {
      // Sanity check to make sure the running server is still displayed, i.e.
      // it hasn't been deleted.
      if (this.runningServer !== runningServer) {
        return;
      }
      // Show the metrics opt in prompt if the server has not already opted in,
      // and if they haven't seen the prompt yet according to localStorage.
      const storageKey = runningServer.getServerId() + '-prompted-for-metrics';
      if (!runningServer.getMetricsEnabled() && !localStorage.getItem(storageKey)) {
        serverView.showMetricsDialogForNewServer();
        localStorage.setItem(storageKey, 'true');
      }
    };

    // Calculate milliseconds passed since server creation.
    const createdDate = runningServer.getCreatedDate();
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

  private showTransferStats(runningServer: server.Server, serverView: Polymer) {
    const refreshTransferStats = () => {
      runningServer.getDataUsage().then((stats) => {
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
      });
    };
    refreshTransferStats();

    // Get transfer stats once per minute for as long as server is selected.
    const statsRefreshRateMs = 60 * 1000;
    const intervalId = setInterval(() => {
      if (this.selectedServer !== runningServer) {
        // Server is no longer running, stop interval
        clearInterval(intervalId);
        return;
      }
      refreshTransferStats();
    }, statsRefreshRateMs);
  }

  private addAccessKey() {
    this.runningServer.addAccessKey()
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
    const server = this.runningServer;
    server.renameAccessKey(accessKeyId, newName)
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
      SentryErrorReporter.logError('Invalid server configuration: could not parse JSON.');
      return Promise.reject(new Error(''));
    }
    if (!serverConfig.apiUrl) {
      const msg = 'Invalid server configuration: apiUrl is missing.';
      SentryErrorReporter.logError(msg);
      return Promise.reject(new Error(msg));
    } else if (!serverConfig.certSha256) {
      const msg = 'Invalid server configuration: certSha256 is missing.';
      SentryErrorReporter.logError(msg);
      return Promise.reject(new Error(msg));
    }

    return this.manualServerRepository.addServer(serverConfig).then((manualServer) => {
      return manualServer.isHealthy().then((isHealthy) => {
        if (isHealthy) {
          this.showServer(manualServer);
          return Promise.resolve();
        } else {
          // Remove inaccessible manual server from local storage.
          manualServer.forget();
          SentryErrorReporter.logError('Manual server installed but unreachable.');
          return Promise.reject(new errors.UnreachableServerError(
              'Your Outline Server was installed correctly, but we are not able to connect to it. Most likely this is because your server\'s firewall rules are blocking incoming connections. Please review them and make sure to allow incoming TCP connections on ports ranging from 1024 to 65535.'));
        }
      });
    });
  }

  private removeAccessKey(accessKeyId: string) {
    this.runningServer.removeAccessKey(accessKeyId)
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
      SentryErrorReporter.logError(msg);
      throw new Error(msg);
    }

    const confirmationTitle = 'Delete Server?';
    const confirmationText = 'Existing users will lose access.  This action cannot be undone.';
    const confirmationButton = 'DELETE';
    this.appRoot.getConfirmation(confirmationTitle, confirmationText, confirmationButton, () => {
      this.digitalOceanRetry(() => {
            return serverToDelete.getHost().delete();
          })
          .then(
              () => {
                this.appRoot.getServerView().closeServerSettings();
                this.selectedServer = null;
                this.showCreateServer();
                this.displayNotification('Server deleted');
              },
              (e) => {
                // Don't show a toast on the login screen.
                if (!(e instanceof digitalocean_api.XhrError)) {
                  this.displayError('Failed to delete server', e);
                }
              });
    });
  }

  private forgetSelectedServer() {
    const serverToForget = this.selectedServer;
    if (!isManualServer(serverToForget)) {
      const msg = 'cannot delete non-ManualServer';
      SentryErrorReporter.logError(msg);
      throw new Error(msg);
    }

    const confirmationTitle = 'Forget Server?';
    const confirmationText =
        'This action removes your server from the Outline Manager, but does not block proxy access to users.  You will still need to manually delete the Outline server from your host machine.';
    const confirmationButton = 'FORGET';
    this.appRoot.getConfirmation(confirmationTitle, confirmationText, confirmationButton, () => {
      this.appRoot.getServerView().closeServerSettings();
      serverToForget.forget();
      this.selectedServer = null;
      this.showIntro();
      this.displayNotification('Server forgotten');
    });
  }

  private setMetricsEnabled(metricsEnabled: boolean) {
    this.runningServer.setMetricsEnabled(metricsEnabled)
        .then(() => {
          // Change metricsEnabled property on polymer element to update display.
          this.appRoot.getServerView().metricsEnabled = metricsEnabled;
        })
        .catch((error) => {
          this.displayError('Error setting metrics enabled', error);
        });
  }

  private renameServer(newName: string): void {
    this.runningServer.setName(newName)
        .then(() => {
          this.appRoot.getServerView().serverName = newName;
        })
        .catch((error) => {
          this.displayError('Error renaming server', error);
        });
  }

  private cancelServerCreation(serverToCancel: server.Server): void {
    if (!isManagedServer(serverToCancel)) {
      const msg = 'cannot cancel non-ManagedServer';
      SentryErrorReporter.logError(msg);
      throw new Error(msg);
    }
    serverToCancel.getHost().delete().then(() => {
      this.showCreateServer();
    });
  }
}
