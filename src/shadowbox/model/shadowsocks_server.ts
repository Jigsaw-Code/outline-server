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

// Parameters required to identify and authenticate connections to a Shadowsocks server.
export interface ShadowsocksServer {
  // Updates the server to accept only the given service configs.
  update(config: ShadowsocksConfig): Promise<void>;
}

/** Represents the overall Shadowsocks configuration with multiple services. */
export interface ShadowsocksConfig {
  services: ShadowsocksService[];
}

/* Represents a Shadowsocks service with its listeners and keys. */
export interface ShadowsocksService {
  listeners: ShadowsocksListener[];
  keys: ShadowsocksAccessKey[];
}

/* Represents a single listener for a Shadowsocks service. */
export interface ShadowsocksListener {
  type: string;
  address: string;
}

/* Represents an access key for a Shadowsocks service. */
export interface ShadowsocksAccessKey {
  id: string;
  cipher: string;
  secret: string;
}
