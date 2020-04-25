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

import * as clipboard from 'clipboard-polyfill';

export class ShareDialogApp {
  constructor(private root: polymer.Base) {
    this.root.$.copyButton.addEventListener('tap', (event: CustomEvent) => {
      const dt = new clipboard.DT();
      dt.setData('text/plain', this.root.$.selectableText.innerText);
      dt.setData('text/html', this.root.$.selectableText.innerHTML);
      clipboard.write(dt);
      this.root.$.copyText.hidden = false;
    });
  }

  start(accessKey: string, s3InviteUrl: string) {
    this.root.acessKey = accessKey;
    this.root.s3Url = s3InviteUrl;
    // TODO(fortuna): Instead of passing a pre-made outline-share-dialog, we should create and
    // insert it here instead. This way we don't need to reset state, which is cleaner.
    this.root.$.copyText.setAttribute('hidden', true);
    this.root.$.dialog.open();
  }
}
