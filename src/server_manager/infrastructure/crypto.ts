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

import * as forge from 'node-forge';

// Keys are in OpenSSH format
export class KeyPair {
  public: string;
  private: string;
}

// Generates an RSA keypair using forge
export function generateKeyPair(): KeyPair {
  const pair = forge.pki.rsa.generateKeyPair({bits: 2048});
  // trim() the string because forge adds a trailing space to
  // public keys which really messes things up later.
  return {
    public: forge.ssh.publicKeyToOpenSSH(pair.publicKey, '').trim(),
    private: forge.ssh.privateKeyToOpenSSH(pair.privateKey, '').trim()
  };
}
