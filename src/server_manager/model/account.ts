// Copyright 2020 The Outline Authors
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
import {CloudProviderId} from "./cloud";

export class AccountId {
  /** The cloud provider specific account identifier. */
  cloudSpecificId: string;

  /** The cloud provider enum. */
  cloudProviderId: CloudProviderId;
}

export interface Account {
  /**
   * The Account identifier that encapsulates the cloud provider (e.g.
   * DigitalOcean, GCP) and cloud specific account identifier.
   */
  getId(): AccountId;

  /**
   * The human readable account name to be displayed to the user. Ideally this
   * would be the email address or username used to log into the cloud
   * provider.
   */
  getDisplayName(): Promise<string>;

  /** The cloud provider API credentials. */
  getCredentials(): object;

  /** Disconnects the cloud provider account and revokes credentials. */
  disconnect(): void;
}
