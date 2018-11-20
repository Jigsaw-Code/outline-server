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
import {parseManualServerConfig} from './management_urls';

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
  private runningServer: server.Server;

  constructor(
      private appRoot: Polymer, private readonly appUrl: string, private readonly version: string,
      private createDigitalOceanSession: DigitalOceanSessionFactory,
      private createDigitalOceanServerRepository: DigitalOceanServerRepositoryFactory,
      private manualServerRepository: server.ManualServerRepository,
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

    // The UI wants us to validate a server management URL.
    // "Reply" by setting a field on the relevant template.
    appRoot.addEventListener('ManualServerEdited', (event: PolymerEvent) => {
      let isValid = true;
      try {
        parseManualServerConfig(event.detail.userInput);
      } catch (e) {
        isValid = false;
      }
      const manualServerEntryEl = appRoot.getManualServerEntry();
      manualServerEntryEl.enableDoneButton = isValid;
    });

    appRoot.addEventListener('ManualServerEntered', (event: PolymerEvent) => {
      const userInput = event.detail.userInput;
      const manualServerEntryEl = appRoot.getManualServerEntry();
      this.createManualServer(userInput)
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
              if (userInput) {
                errorMessage += userInput;
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

    onUpdateDownloaded(this.displayAppUpdateNotification.bind(this));

    setClipboardHandler(this.clipboardHandler.bind(this));
  }

  private lastClipboardText: string;

  // TODO: ignore if server already added
  private clipboardHandler(text: string) {
    // Shorten, sanitise.
    text = text.substring(0, 1000).trim();

    // Debounce.
    if (this.lastClipboardText && text === this.lastClipboardText) {
      return;
    }
    this.lastClipboardText = text;

    console.log('scanning clipboard!');

    try {
      const config = parseManualServerConfig(text);
      console.log('valid!');
      this.appRoot.openConfirmInviteDialog(config);
    } catch (e) {
      // Don't alert the user; high false positive rate.
    }
  }

  start(): void {
    // Load manual servers from storage.
    this.manualServerRepository.listServers().then((manualServers) => {
      // Show any manual servers if they exist.
      if (manualServers.length > 0) {
        this.showManualServerIfHealthy(manualServers[0]);
        return;
      }

      // User has no manual servers - check if they are logged into DigitalOcean.
      const accessToken = this.digitalOceanTokenManager.getStoredToken();
      if (accessToken) {
        this.enterDigitalOceanMode(accessToken);
        return;
      }

      // User has no manual servers or DigitalOcean token.
      this.showIntro();
    });
  }

  // Show the DigitalOcean server creator or the existing server, if there's one.
  private enterDigitalOceanMode(accessToken: string) {
    const doSession = this.createDigitalOceanSession(accessToken);
    const authEvents = new events.EventEmitter();
    let cancelled = false;
    let activatingAccount = false;
    const cancelAccountStateVerification = () => {
      cancelled = true;
      this.clearCredentialsAndShowIntro();
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
              this.displayError('Failed to get DigitalOcean account information', error);
            }
          });
    };

    authEvents.on('account-update', (account: digitalocean_api.Account) => {
      if (cancelled) {
        return;
      }
      this.appRoot.adminEmail = account.email;
      if (account.status === 'active') {
        bringToFront();
        let maybeSleep = Promise.resolve();
        if (activatingAccount) {
          // Show the 'account active' screen for a few seconds if the account was activated during
          // this session.
          oauthUi.showAccountActive();
          maybeSleep = sleep(1500);
        }
        maybeSleep
            .then(() => {
              this.digitalOceanRepository = this.createDigitalOceanServerRepository(doSession);
              return this.digitalOceanRepository.listServers();
            })
            .then((serverList) => {
              // Check if this user already has a Shadowsocks server, if so show that.
              // This assumes we only allow one Shadowsocks server per DigitalOcean user.
              if (serverList.length > 0) {
                this.showManagedServer(serverList[0]);
              } else {
                this.showCreateServer();
              }
            })
            .catch((e) => {
              console.error('Could not fetch server list from DigitalOcean');
              this.showIntro();
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
          this.enterDigitalOceanMode(accessToken);
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
    // Reset UI
    this.appRoot.adminEmail = '';
    this.showIntro();
  }

  // Opens the screen to create a server.
  private showCreateServer() {
    const regionPicker = this.appRoot.getAndShowRegionPicker();
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
    this.appRoot.showProgress(serverName, showCancelButton);
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
            // The user deleted this server, no need to show an error or delete it again.
            return;
          }
          const errorMessage = managedServer.isInstallCompleted() ?
              'We are unable to connect to your Outline server at the moment.  This may be due to a firewall on your network or temporary connectivity issues with digitalocean.com.' :
              'There was an error creating your Outline server.  This may be due to a firewall on your network or temporary connectivity issues with digitalocean.com.';
          this.appRoot
              .showModalDialog(
                  null,  // Don't display any title.
                  errorMessage, ['Delete this server', 'Try again'])
              .then((clickedButtonIndex: number) => {
                if (clickedButtonIndex === 0) {  // user clicked 'Delete this server'
                  console.info('Deleting unreachable server');
                  managedServer.getHost().delete().then(() => {
                    this.showCreateServer();
                  });
                } else if (clickedButtonIndex === 1) {  // user clicked 'Try again'.
                  console.info('Retrying unreachable server');
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
          console.error('error from showManagedServer');
          return Promise.reject(e);
        });
  }

  // Show the server management screen.
  private showServer(selectedServer: server.Server): void {
    this.selectedServer = selectedServer;
    this.runningServer = selectedServer;

    // Show view and initialize fields from selectedServer.
    const view = this.appRoot.getServerView();
    view.serverId = selectedServer.getServerId();
    view.serverName = selectedServer.getName();
    view.serverHostname = selectedServer.getHostname();
    view.serverManagementPort = selectedServer.getManagementPort();
    view.serverCreationDate = selectedServer.getCreatedDate().toLocaleString(
        'en-US', {year: 'numeric', month: 'long', day: 'numeric'});

    if (isManagedServer(selectedServer)) {
      const host = selectedServer.getHost();
      view.monthlyCost = host.getMonthlyCost().usd;
      view.deleteEnabled = true;
      view.forgetEnabled = false;
      const monthlyOutboundTransferGb = host.getMonthlyOutboundTransferLimit().terabytes * 1000;
      view.monthlyOutboundTransferBytes = monthlyOutboundTransferGb * (2 ** 30);
    } else {
      // TODO(dborkan): consider using dom-if with restamp property
      // https://www.polymer-project.org/1.0/docs/api/elements/dom-if
      // or using template-repeat.  Then we won't have to worry about clearing
      // the server-view when we display a new server.  This should be fixed
      // once we support multiple servers.
      view.monthlyCost = undefined;
      view.monthlyOutboundTransferBytes = undefined;
      view.deleteEnabled = false;
      view.forgetEnabled = true;
    }

    view.metricsEnabled = selectedServer.getMetricsEnabled();
    this.appRoot.showServerView();
    this.showMetricsOptInWhenNeeded(selectedServer, view);

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
      runningServer.getDataUsage().then(
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
  public createManualServer(userInput: string): Promise<void> {
    let serverConfig: server.ManualServerConfig;
    try {
      serverConfig = parseManualServerConfig(userInput);
    } catch (e) {
      // This shouldn't happen because the UI validates the URL before enabling the DONE button.
      return Promise.reject(new Error(`could not parse server config: ${e.message}`));
    }

    return this.manualServerRepository.addServer(serverConfig).then((manualServer) => {
      return manualServer.isHealthy().then((isHealthy) => {
        if (isHealthy) {
          this.showServer(manualServer);
          return Promise.resolve();
        } else {
          // Remove inaccessible manual server from local storage.
          manualServer.forget();
          console.error('Manual server installed but unreachable.');
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
      console.error(msg);
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
      const msg = 'cannot forget non-ManualServer';
      console.error(msg);
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
      console.error(msg);
      throw new Error(msg);
    }
    serverToCancel.getHost().delete().then(() => {
      this.showCreateServer();
    });
  }
}
