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

function escapeHtml(html: string) {
  const el = document.createElement('div');
  el.innerText = html;
  return el.innerHTML;
}

@customElement('outline-test-app')
export class TestApp extends LitElement {
  @property() language = 'en';
  @property() dir = 'ltr';

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
  }

  render() {
    return html`
      <h1>Outline Manager Components Gallery</h1>
      <label for="dir-select" @change=${this.__changeDirection}>Direction: <select id="dir-select">
        <option value="ltr" selected>LTR</option>
        <option value="rtl">RTL</option>
      </select>
      
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
  
  localize(msgId: string, ...args: string[]): string {
    // TODO(fortuna): Use the actual messages.
    const parts = [] as string[];
    for (let i = 0; i < args.length; i += 2) {
      parts.push(`${escapeHtml(args[i])}: ${escapeHtml(args[i + 1])}`);
    }
    return `${msgId}(${parts.join(', ')})`;
  }

  private __changeDirection(e: Event) {
    this.dir = (e.target as HTMLSelectElement).value;
  }

  openDialog(selector: string) {
    (this.shadowRoot.querySelector(selector) as unknown as Dialog).open();
  }
}
