import IntlMessageFormat from 'intl-messageformat';

import '../ui_components/outline-about-dialog';
import '../ui_components/outline-do-oauth-step';
import '../ui_components/outline-feedback-dialog';
import '../ui_components/outline-survey-dialog';


import {css, customElement, html, LitElement, property} from 'lit-element';

interface Dialog {
  open(): void;
}

interface FeedbackDialog {
  open(prepopulatedMessage: string, showInstallationFailed: boolean): void;
}

async function makeLocalize(language: string) {
  let messages: any;
  try {
    messages = await (await fetch(`./messages/${language}.json`)).json();
  } catch (e) {
    window.alert(`Could not load messages for language "${language}"`);
  }
  return (msgId: string, ...args: string[]): string => {
    const params = {} as any;
    for (let i = 0; i < args.length; i += 2) {
      params[args[i]] = args[i + 1];
    }
    console.log(`localize(${msgId}, ${JSON.stringify(params)})`);
    if (!messages) {
      // Fallback that shows message id and params.
      return `${msgId}(${JSON.stringify(params, null, " ")})`;
    }
    // Ideally we would pre-parse ang cache the IntlMessageFormat objects,
    // but it's ok here because it's a test app.
    console.log(messages[msgId]);
    const formatter = new IntlMessageFormat(messages[msgId], language);
    return formatter.format(params) as string;
  };
}

@customElement('outline-test-app')
export class TestApp extends LitElement {
  @property({type: String}) dir = 'ltr';
  @property({type: Function}) localize: Function;
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

  render() {
    return html`
      <h1>Outline Manager Components Gallery</h1>
      ${this.pageControls}
      
      <div class="widget">
        <h2>outline-about-dialog</h2>
        <button @tap=${() => this.openDialog('outline-about-dialog')}>Open Dialog</button>
        <outline-about-dialog .localize=${this.localize} dir=${this.dir} outline-version="1.2.3"></outline-about-dialog>
      </div>
      
      <div class="widget">
        <h2>outline-do-oauth-step</h2>
        <outline-do-oauth-step .localize=${this.localize} dir=${this.dir}></outline-do-oauth-step>
      </div>

      <div class="widget">
        <h2>outline-feedback-dialog</h2>
        <button @tap=${() => (this.shadowRoot.querySelector('outline-feedback-dialog') as unknown as FeedbackDialog
        ).open('Pre-populated message', false)}>Open Dialog</button>
        <outline-feedback-dialog .localize=${this.localize} dir=${this.dir}></outline-feedback-dialog>
      </div>

      <div class="widget">
        <h2>outline-survey-dialog</h2>
        <button @tap=${() => this.openDialog('outline-survey-dialog')}>Open Dialog</button>
        <!-- TODO(fortuna): the input title is not being localized. Should it? -->
        <outline-survey-dialog .localize=${this.localize} dir=${this.dir}
            title="Survey Title"
            survey-link="https://getoutline.org"
        ></outline-survey-dialog>
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

  async setLanguage(newLanguage: string) {
    if (newLanguage === this.language) {
      return;
    }
    this.localize = await makeLocalize(newLanguage);
    this.language = newLanguage;    
  }

  openDialog(selector: string) {
    (this.shadowRoot.querySelector(selector) as unknown as Dialog).open();
  }
}
