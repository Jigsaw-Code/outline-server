import {LocalStorageRepository} from "../infrastructure/repository";
import {Account, AccountData} from "./account";
import {GcpAccount} from "../providers/gcp/model/gcp_account";
import {CloudProvider} from "./cloud";
import {OAuthCredential, performOauth} from "../providers/gcp/oauth_client";
import {GcpRestApiClient, GcpRestApiProviderService, ListProjectsResponse} from "../providers/gcp/rest_api_client";

export class Accounts {
  constructor(private accountRepository: LocalStorageRepository<AccountData, string>) {
  }

  async connectGcpAccount(): Promise<GcpAccount> {
    const credential = await performOauth();
    const oauthCredential = new OAuthCredential(credential.access_token, credential.refresh_token);
    const projectIds = await this.listGcpOutlineProjects(oauthCredential);
    const projectId = projectIds[0];
    const account = {
      id: projectId,  // TODO: Maybe this should include the cloud provider ID and an instance ID
      displayName: projectId,
      provider: CloudProvider.GCP,
      credential: oauthCredential,
    };
    return this.toGcpAccount(account);
  }

  async list(): Promise<Account[]> {
    const accounts = this.accountRepository.list();
    return Promise.all(accounts
        .filter(account => account.provider === CloudProvider.GCP)
        .map(async (account) => this.toGcpAccount(account)));
  }

  private async toGcpAccount(account: AccountData) {
    const oauthCredential = account.credential as OAuthCredential;
    await oauthCredential.refresh();    // TODO: Move this to CloudServiceProvider
    const cloudProviderService = new GcpRestApiProviderService(account.id, oauthCredential);
    return new GcpAccount(account, this.accountRepository, cloudProviderService);
  }

  private async listGcpOutlineProjects(oauthCredential: OAuthCredential): Promise<string[]> {
    const gcpRestApiClient = new GcpRestApiClient("", oauthCredential);
    const listProjectsResponse: ListProjectsResponse = await gcpRestApiClient.listProjects();
    return listProjectsResponse.projects?.map(project => project.projectId);
  }
}
