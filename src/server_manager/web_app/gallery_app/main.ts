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

import '../ui_components/outline-about-dialog';
import '../ui_components/outline-do-oauth-step';
import '../ui_components/outline-feedback-dialog';
import '../ui_components/outline-share-dialog';
import '../ui_components/outline-sort-span';
import '../ui_components/outline-survey-dialog';
import '../ui_components/outline-per-key-data-limit-dialog';
import '@polymer/paper-checkbox/paper-checkbox';

import {PaperCheckboxElement} from '@polymer/paper-checkbox/paper-checkbox';
import IntlMessageFormat from 'intl-messageformat';
import {css, customElement, html, LitElement, property} from 'lit-element';
import {OutlinePerKeyDataLimitDialog} from '../ui_components/outline-per-key-data-limit-dialog';

async function makeLocalize(language: string) {
  let messages: {[key: string]: string};
  try {
    messages = await (await fetch(`./messages/${language}.json`)).json();
  } catch (e) {
    window.alert(`Could not load messages for language "${language}"`);
  }
  return (msgId: string, ...args: string[]): string => {
    // tslint:disable-next-line:no-any
    const params = {} as {[key: string]: any};
    for (let i = 0; i < args.length; i += 2) {
      params[args[i]] = args[i + 1];
    }
    if (!messages || !messages[msgId]) {
      // Fallback that shows message id and params.
      return `${msgId}(${JSON.stringify(params, null, " ")})`;
    }
    // Ideally we would pre-parse and cache the IntlMessageFormat objects,
    // but it's ok here because it's a test app.
    const formatter = new IntlMessageFormat(messages[msgId], language);
    return formatter.format(params) as string;
  };
}

@customElement('outline-test-app')
export class TestApp extends LitElement {
  @property({type: String}) dir = 'ltr';
  @property({type: Function}) localize: (...args: string[]) => string;
  @property({type: Boolean}) savePerKeyDataLimitSuccessful = true;
  @property({type: Number}) keyDataLimit: number|undefined;
  private language = '';

  static get styles() {
    return css`
      :host {
        background: white;
        display: block;
        height: 100%;
        overflow-y: auto;
        padding: 10px;
        width: 100%;
      }
      .widget {
        display: block;
        padding: 20px;
      }
    `;
  }

  constructor() {
    super();
    console.log('Created');
    this.setLanguage('en');
  }

  async setLanguage(newLanguage: string) {
    if (newLanguage === this.language) {
      return;
    }
    this.localize = await makeLocalize(newLanguage);
    this.language = newLanguage;
  }

  // tslint:disable-next-line:no-any
  private select(querySelector: string): any {
    return this.shadowRoot.querySelector(querySelector);
  }

  private setKeyDataLimit(bytes: number) {
    if ((this.select('#perKeyDataLimitSuccessCheckbox') as PaperCheckboxElement).checked) {
      this.keyDataLimit = bytes;
      console.log(`Per Key Data Limit set to ${bytes} bytes!`);
      return true;
    }
    console.error('Per Key Data Limit failed to be set!');
    return false;
  }

  private removeKeyDataLimit() {
    if ((this.select('#perKeyDataLimitSuccessCheckbox') as PaperCheckboxElement).checked) {
      this.keyDataLimit = undefined;
      console.log('Per Key Data Limit Removed!');
      return true;
    }
    console.error('Per Key Data Limit failed to be removed!');
    return false;
  }

  render() {
    return html`
      <h1>Outline Manager Components Gallery</h1>
      ${this.pageControls}

      <div
        class="widget"
        id="key-settings-widget"
      >
        <h2>outline-per-key-data-limit-dialog</h2>
        <button
          @tap=${
        () => (this.select('outline-per-key-data-limit-dialog') as OutlinePerKeyDataLimitDialog)
                  .open(
                      'Key Name', this.keyDataLimit, this.setKeyDataLimit.bind(this),
                      this.removeKeyDataLimit.bind(this))}
        >
          Open Dialog
        </button>
        <paper-checkbox
           ?checked=${this.savePerKeyDataLimitSuccessful}
           @tap=${() => {
      this.savePerKeyDataLimitSuccessful = !this.savePerKeyDataLimitSuccessful;
    }}
           id="perKeyDataLimitSuccessCheckbox"
        >Save Successful</paper-checkbox>
        <outline-per-key-data-limit-dialog
          .localize=${this.localize}
          .language=${this.language}
          dir=${this.dir}
        ></outline-per-key-data-limit-dialog>
      </div>

      <div class="widget">
        <h2>outline-about-dialog</h2>
        <button @tap=${() => this.select('outline-about-dialog').open()}>Open Dialog</button>
        <outline-about-dialog .localize=${this.localize} dir=${
        this.dir} outline-version="1.2.3"></outline-about-dialog>
      </div>

      <div class="widget">
        <h2>outline-do-oauth-step</h2>
        <outline-do-oauth-step .localize=${this.localize} dir=${this.dir}></outline-do-oauth-step>
      </div>

      <div class="widget">
        <h2>outline-feedback-dialog</h2>
        <button @tap=${
        () => this.select('outline-feedback-dialog')
                  .open('Pre-populated message', false)}>Open Dialog</button>
        <outline-feedback-dialog .localize=${this.localize} dir=${
        this.dir}></outline-feedback-dialog>
      </div>

      <div class="widget">
        <h2>outline-share-dialog</h2>
        <button @tap=${
        () => this.select('outline-share-dialog')
                  .open('<ACCESS_KEY>', '<INVITE_URL>')}>Open Dialog</button>
        <outline-share-dialog .localize=${this.localize} dir=${this.dir}></outline-share-dialog>
      </div>

      <div class="widget">
        <h2>outline-sort-icon</h2>
        <outline-sort-span dir=${this.dir} direction=1 @tap=${() => {
      const el = this.select('outline-sort-span');
      el.direction *= -1;
    }}>Column Header</outline-sort-span>
      </div>

      <div class="widget">
        <h2>outline-survey-dialog</h2>
        <button @tap=${
        () => this.select('outline-survey-dialog')
                  .open('Survey title', 'https://getoutline.org')}>Open Dialog</button>
        <outline-survey-dialog .localize=${this.localize} dir=${this.dir}></outline-survey-dialog>
      </div>
    `;
  }

  get pageControls() {
    return html`<p>
      <label for="language">Language:</label><input type="text" id="language" value="${this.language}">
      <button @tap=${() => this.setLanguage((this.shadowRoot.querySelector('#language') as HTMLInputElement).value)
      }>Set Language</button>
    </p>
    <p>
      <label for="dir-select" @change=${(e: Event) => this.dir = (e.target as HTMLSelectElement).value
      }>Direction: <select id="dir-select">
        <option value="ltr" selected>LTR</option>
        <option value="rtl">RTL</option>
      </select>
    </p>`;
  }
}
