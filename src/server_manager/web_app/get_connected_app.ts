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

export class GetConnectedApp {
  constructor(private dialog: polymer.Base) {
    // Get connected is not a Polymer component, so we use `querySelector()` instead of `dialog.$`.
    dialog.querySelector('#closeGetConnectedButton')
        .addEventListener('tap', (event: CustomEvent) => {
          dialog.close();
          if (dialog.children.length > 1) {
            const oldIframe = dialog.children[0];
            dialog.removeChild(oldIframe);
          }
        });
  }

  start(inviteUrl: string) {
    if (this.dialog.children.length > 1) {
      return;  // The iframe is already loading.
    }
    // Reset the iframe's state, by replacing it with a newly constructed
    // iframe. Unfortunately the location.reload API does not work in our case due to
    // this Chrome error:
    // "Blocked a frame with origin "outline://web_app" from accessing a cross-origin frame."
    const iframe = document.createElement('iframe');
    iframe.onload = () => {
      this.dialog.open();
    };
    iframe.src = inviteUrl;
    this.dialog.insertBefore(iframe, this.dialog.children[0]);
  }
}
