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
import * as errors from '../infrastructure/errors';
import {Account} from '../model/account';
import {AccountManager} from '../model/account_manager';
import {CloudProviderId} from '../model/cloud';
import {DigitalOceanAccount} from './digitalocean_app/digitalocean_account';
import * as server from '../model/server';
import {isManagedServer} from '../model/server';

import {DigitalOceanConnectAccountApp} from './digitalocean_app/connect_account_app';
import {DigitalOceanCreateServerApp} from './digitalocean_app/create_server_app';
import {DisplayServer, DisplayServerRepository, makeDisplayServer} from './display_server';
import {parseManualServerConfig} from './management_urls';
import {AppRoot} from './ui_components/app-root.js';
import {OutlineIntroStep} from './ui_components/outline-intro-step';
import {OutlineNotificationManager} from './ui_components/outline-notification-manager';
import {ServerView} from './ui_components/outline-server-view.js';
import {ShadowboxSettings} from "./shadowbox_server";
import {OutlineManageServerApp} from "./outline_app/manage_server_app";

// The Outline DigitalOcean team's referral code:
//   https://www.digitalocean.com/help/referral-program/
const UNUSED_DIGITALOCEAN_REFERRAL_CODE = '5ddb4219b716';

export class App {
  private digitalOceanAccount: DigitalOceanAccount;

  private selectedServer: server.Server;
  private serverBeingCreated: server.ManagedServer;
  private notificationManager: OutlineNotificationManager;

  constructor(
      private appRoot: AppRoot, private readonly version: string,
      private domainEvents: EventEmitter,
      private shadowboxSettings: ShadowboxSettings,
      private manualServerRepository: server.ManualServerRepository,
      private displayServerRepository: DisplayServerRepository,
      private accountManager: AccountManager) {
    this.notificationManager = this.appRoot.getNotificationManager();
    const digitalOceanConnectAccountApp =
        this.appRoot.initializeDigitalOceanConnectAccountApp(accountManager, domainEvents, shadowboxSettings);
    this.accountManager.initializeCloudProviders(digitalOceanConnectAccountApp);

    appRoot.setAttribute('outline-version', this.version);

    // DigitalOcean event listeners
    appRoot.addEventListener(
        OutlineIntroStep.EVENT_DIGITALOCEAN_CARD_TAPPED,
        (event: CustomEvent) => this.appRoot.getAndShowDigitalOceanConnectAccountApp().start());
    appRoot.addEventListener(
        DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECTED, async (event: CustomEvent) => {
          const account = event.detail.account as DigitalOceanAccount;
          this.appRoot.adminEmail = await account.getDisplayName();
          this.onServersRefreshed(false, account);
          this.refreshDigitalOceanServers(account);
        });
    appRoot.addEventListener(
        DigitalOceanConnectAccountApp.EVENT_ACCOUNT_CONNECT_CANCELLED,
        (event: CustomEvent) => this.showIntro());
    appRoot.addEventListener(
        DigitalOceanCreateServerApp.EVENT_SERVER_CREATED,
        (event: CustomEvent) => this.syncServerCreationToUi(event.detail.server));
    appRoot.addEventListener(
        DigitalOceanCreateServerApp.EVENT_SERVER_CREATE_CANCELLED,
        (event: CustomEvent) => this.showIntro());
    appRoot.addEventListener('DoSignOutRequested', () => {
      this.digitalOceanAccount.disconnect();
      this.appRoot.adminEmail = '';
      this.clearCredentialsAndShowIntro(CloudProviderId.DigitalOcean);
    });

    // OutlineIntroStep event listeners
    appRoot.addEventListener(
        OutlineIntroStep.EVENT_AWS_CARD_TAPPED,
        (event: CustomEvent) => this.appRoot.handleManualServerSelected('aws'));
    appRoot.addEventListener(
        OutlineIntroStep.EVENT_GCP_CARD_TAPPED,
        (event: CustomEvent) => this.appRoot.handleManualServerSelected('gcp'));
    appRoot.addEventListener(
        OutlineIntroStep.EVENT_GENERIC_CLOUD_PROVIDER_CARD_TAPPED,
        (event: CustomEvent) => this.appRoot.handleManualServerSelected('generic'));

    // OutlineManageServerApp event listeners
    appRoot.addEventListener(
        OutlineManageServerApp.EVENT_SERVER_RENAMED,
        (event: CustomEvent) => this.syncAndShowServer(this.selectedServer));
    appRoot.addEventListener(
        OutlineManageServerApp.EVENT_SERVER_REMOVED,
        (event: CustomEvent) => this.onServerRemoved());

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

    appRoot.addEventListener('SubmitFeedback', (event: CustomEvent) => {
      const detail = event.detail;
      try {
        sentry.captureEvent({
          message: detail.userFeedback,
          user: {email: detail.userEmail},
          tags: {category: detail.feedbackCategory, cloudProvider: detail.cloudProvider}
        });
        this.notificationManager.showNotification('notification-feedback-thanks');
      } catch (e) {
        console.error(`Failed to submit feedback: ${e}`);
        this.notificationManager.showError('error-feedback');
      }
    });

    appRoot.addEventListener('SetLanguageRequested', (event: CustomEvent) => {
      this.setAppLanguage(event.detail.languageCode, event.detail.languageDir);
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
    this.notificationManager = this.appRoot.getNotificationManager();
    this.showIntro();
    await this.syncDisplayServersToUi();

    const manualServersPromise = this.manualServerRepository.listServers();

    const digitalOceanAccount = await this.accountManager.loadDigitalOceanAccount();
    let managedServersPromise = Promise.resolve([]);
    if (digitalOceanAccount) {
      this.appRoot.adminEmail = await digitalOceanAccount.getDisplayName();
      managedServersPromise = this.digitalOceanAccount.listServers();
    }

    const [manualServers, managedServers] =
        await Promise.all([manualServersPromise, managedServersPromise]);
    const installedManagedServers = managedServers.filter(server => server.isInstallCompleted());
    this.serverBeingCreated = managedServers.find(server => !server.isInstallCompleted());
    const servers = manualServers.concat(installedManagedServers);

    this.syncServersToDisplay(servers);
    this.onServersRefreshed(true);
  }

  // Returns promise which fulfills when the server is created successfully,
  // or rejects with an error message that can be displayed to the user.
  createManualServer(userInput: string): Promise<void> {
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
        this.notificationManager.showNotification('notification-server-exists', 5000);
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

  private async refreshDigitalOceanServers(account: DigitalOceanAccount): Promise<void> {
    try {
      this.digitalOceanAccount = account;
      const servers = await this.digitalOceanAccount.listServers();
      this.syncServersToDisplay(servers);
    } catch (error) {
      console.error('Could not fetch server list from DigitalOcean');
      this.showIntro();
    }
  }

  private onServerRemoved() {
    this.removeServerFromDisplay(this.appRoot.selectedServer);
    this.appRoot.selectedServer = null;
    this.selectedServer = null;
    this.showIntro();
  }

  private async onServersRefreshed(onStartup: boolean, account?: Account) {
    try {
      const displayServer =
          this.appRoot.doServerList.find((displayServer: DisplayServer) => displayServer.isManaged);
      if (!!this.serverBeingCreated) {
        // Show the server creation progress screen to disallow
        // simultaneously creating multiple servers.
        this.showServerCreationProgress();
        this.waitForManagedServerCreation();
      } else if (!onStartup) {
        // Show the create server app.
        this.showCreateServer(account);
      } else if (displayServer && onStartup) {
        // Show the last "managed" server detail screen on startup.
        this.showServerFromRepository(displayServer);
      }
    } catch (error) {
      console.log(error);
      this.clearCredentialsAndShowIntro(CloudProviderId.DigitalOcean);
      bringToFront();
    }
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
      this.notificationManager.showError(messageKey, placeholder, unsyncedServerNames);
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
      console.log(`Could not find display server with ID ${displayServerId}`);
      displayServer = await makeDisplayServer(server);
      console.log(displayServer);
      this.displayServerRepository.addServer(displayServer);

      this.syncDisplayServersToUi();

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

      this.appRoot.doServerList = displayServers.filter(displayServer => displayServer.cloudProviderId === CloudProviderId.DigitalOcean);
      this.appRoot.manualServerList = displayServers.filter(displayServer => !displayServer.isManaged);
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
      if (!!this.digitalOceanAccount &&
          displayServer.cloudProviderId === CloudProviderId.DigitalOcean) {
        // Fetch the servers from memory to prevent a leak that happens due to polling when creating
        // a new object for a server whose creation has been cancelled.
        const managedServers = await this.digitalOceanAccount.listServers(false);
        server = managedServers.find(
            (managedServer) => managedServer.getManagementApiUrl() === apiManagementUrl);
        if (server) {
          return server;
        }
      }
    } else {
      server =
          this.manualServerRepository.findServer({'apiUrl': apiManagementUrl, 'certSha256': ''});
    }
    return server;
  }

  private syncServerCreationToUi(server: server.ManagedServer) {
    this.syncServerToDisplay(server);

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
    // // Set name to the default server name for this region. Because the server
    // // is still being created, the getName REST API will not yet be available.
    // const regionId = this.serverBeingCreated.getHost().getRegionId();
    // const serverName = this.makeLocalizedServerName(regionId);

    return {
      // Use the droplet ID until the API URL is available.
      id: this.serverBeingCreated.getHost().getId(),
      name: this.serverBeingCreated.getName(),
      cloudProviderId: this.serverBeingCreated.getHost().getCloudProviderId(),
      isManaged: true
    };
  }

  private async showServerFromRepository(displayServer: DisplayServer): Promise<void> {
    const server = await this.getServerFromRepository(displayServer);
    if (!!server) {
      this.showServerIfHealthy(server, displayServer);
    }
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

  private showServerIfHealthy(server: server.Server, displayServer: DisplayServer) {
    server.isHealthy().then((isHealthy) => {
      if (isHealthy) {
        // Sync the server display in case it was previously unreachable.
        this.syncServerToDisplay(server).then(() => {
          this.selectedServer = server;
          this.displayServerRepository.storeLastDisplayedServerId(displayServer.id);
          this.appRoot.showManageServerApp(server, displayServer);
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
          if (serverView.isServerManaged && !!this.digitalOceanAccount) {
            serverExistsPromise =
                this.digitalOceanAccount.listServers().then((managedServers) => {
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
              this.notificationManager.showError(
                  'error-server-removed', 'serverName', displayServer.name);
              this.removeServerFromDisplay(displayServer);
              this.selectedServer = null;
              this.appRoot.selectedServer = null;
              this.showIntro();
            }
          });
        };
        this.selectedServer = server;
        this.appRoot.selectedServer = displayServer;
        this.appRoot.showManageServerApp(server, displayServer);
      }
    });
  }

  // Shows the intro screen with overview and options to sign in or sign up.
  private showIntro() {
    this.appRoot.showIntro();
  }

  private displayAppUpdateNotification() {
    this.notificationManager.showNotification('notification-app-update', 60000);
  }

  // Clears the credentials and returns to the intro screen.
  private async clearCredentialsAndShowIntro(cloudProviderId: CloudProviderId) {
    // Remove display servers from storage.
    const displayServers = await this.displayServerRepository.listServers();
    displayServers.filter((displayServer) => displayServer.cloudProviderId === cloudProviderId)
        .map((displayServer) => this.removeServerFromDisplay(displayServer));

    if (!!this.appRoot.selectedServer && this.appRoot.selectedServer.isManaged) {
      this.appRoot.selectedServer = null;
      this.showIntro();
    } else if (!this.appRoot.selectedServer) {
      this.showIntro();
    }
  }

  private showCreateServer(account: Account): void {
    const cloudProviderId = account.getId().cloudProviderId;
    if (cloudProviderId === CloudProviderId.DigitalOcean) {
      this.appRoot.getAndShowDigitalOceanCreateServerApp().start(account);
    } else {
      console.log(`Cannot find create server app associated with cloud provider: ${cloudProviderId}`);
      this.showIntro();
    }
  }

  private showServerCreationProgress() {
    // Set selected server, needed for cancel button.
    console.log('setting app.ts selected server');
    console.log(this.serverBeingCreated);
    this.selectedServer = this.serverBeingCreated;
    this.appRoot.selectedServer = this.getDisplayServerBeingCreated();
    console.log('setting app selected server');
    console.log(this.appRoot.selectedServer);
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
                    this.showCreateServer(this.digitalOceanAccount);
                  });
                } else if (clickedButtonIndex === 1) {  // user clicked 'Try again'.
                  console.info('Retrying unreachable server');
                  this.waitForManagedServerCreation(true);
                }
              });
        });
  }

  // Syncs a healthy `server` to the display and shows it.
  private async syncAndShowServer(server: server.Server, timeoutMs = 250) {
    const displayServer = await this.syncServerToDisplay(server);
    await this.syncDisplayServersToUi();
    this.selectedServer = server;
    this.displayServerRepository.storeLastDisplayedServerId(displayServer.id);
    this.appRoot.showManageServerApp(server, displayServer);
  }

  private getS3InviteUrl(accessUrl: string, isAdmin = false) {
    // TODO(alalama): display the invite in the user's preferred language.
    const adminParam = isAdmin ? '?admin_embed' : '';
    return `https://s3.amazonaws.com/outline-vpn/invite.html${adminParam}#${
        encodeURIComponent(accessUrl)}`;
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
      this.showCreateServer(this.digitalOceanAccount);
    });
  }

  private setAppLanguage(languageCode: string, languageDir: string) {
    this.appRoot.setLanguage(languageCode, languageDir);
    document.documentElement.setAttribute('dir', languageDir);
    window.localStorage.setItem('overrideLanguage', languageCode);
  }
}
