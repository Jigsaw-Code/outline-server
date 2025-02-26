import { LitElement, html, css } from 'lit'
import { customElement, state, property } from 'lit/decorators.js';

import makeLibrary, { type Server } from '../../library';

@customElement('server-details')
export class MainPage extends LitElement {
  @property({ type: String }) url: string;

  @state() server?: Server;

  constructor(url: string) {
    super();
    this.url = url;
  }

  get client() {
    return makeLibrary(this.url);
  }

  static styles = css`
    :host {
      font-family: system-ui;
    }

    dt {
      font-weight: bold;
    }
  `;

  async connectedCallback() {
    super.connectedCallback();

    const { data } = await this.client.getServer();

    this.server = data;
  }

  render() {
    if (!this.server) {
      return html`Loading...`;
    }

    return html`
      <dl>
        ${Object.entries(this.server).map(([key, value]) => html`
          <dt>${key}</dt>
          <dd>${value}</dd>
        `)}
      </dl>
    `;
  }
}
