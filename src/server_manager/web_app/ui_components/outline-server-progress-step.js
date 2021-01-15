/*
  Copyright 2018 The Outline Authors

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/
import '@polymer/polymer/polymer-legacy.js';

import '@polymer/paper-progress/paper-progress.js';
import '@polymer/paper-button/paper-button.js';
import './cloud-install-styles.js';
import './outline-progress-spinner.js';
import './outline-step-view.js';
import './style.css';
import {Polymer} from '@polymer/polymer/lib/legacy/polymer-fn.js';
import {html} from '@polymer/polymer/lib/utils/html-tag.js';

Polymer({
  _template: html`
    <style include="cloud-install-styles"></style>

    <style>
      :host {
        text-align: center;
      }
      .card {
        margin-top: 72px;
        box-shadow: 0 0 2px 0 rgba(0, 0, 0, 0.14), 0 2px 2px 0 rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.2);
        border-radius: 2px;
        color: var(--light-gray);
        background: var(--background-contrast-color);
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .servername {
        margin: 24px 0 72px 0;
        text-align: center;
      }
      .card p {
        font-size: 14px;
        color: var(--light-gray);
      }
      outline-progress-spinner {
        margin-top: 72px;
      }
      paper-button {
        width: 100%;
        border: 1px solid var(--light-gray);
        border-radius: 2px;
        color: var(--light-gray);
      }
    </style>

    <outline-step-view display-action="">
      <span slot="step-title">[[localize('setup-do-title')]]</span>
      <span slot="step-description">[[localize('setup-do-description')]]</span>
      <span slot="step-action">
        <paper-button id="cancelButton" hidden\$="{{!showCancelButton}}" on-tap="handleCancelTapped">[[localize('cancel')]]</paper-button>
      </span>
      <div class="card">
        <outline-progress-spinner></outline-progress-spinner>
        <div class="servername">
          <p>{{serverName}}</p>
        </div>
        <paper-progress id="bar" class="transiting"></paper-progress>
      </div>
    </outline-step-view>
`,

  is: 'outline-server-progress-step',

  properties: {
    serverName: String,
    showCancelButton: Boolean,
    updateIntervalId: Number,
    localize: Function,
  },

  startAnimation: function() {
    if (this.updateIntervalId) {
      this.stop();
    }
    this.$.bar.value = 0;
    const expected = 90;     // seconds
    const uncertainty = 30;  // seconds
    const startTime = Date.now() / 1000;
    // For smoothness, this should match the CSS transition duration.
    const updateInterval = 1.0;  // seconds.
    this.updateIntervalId = setInterval(() => {
      const elapsed = Date.now() / 1000 - startTime;
      // This heuristic happens to correspond to a Weibull distribution.
      const k = expected / uncertainty;
      const lambda = expected / Math.pow(Math.log(2), 1 / k);
      const conditionalMedian =
          lambda * Math.pow(Math.pow(elapsed / lambda, k) + Math.log(2), 1 / k);
      this.$.bar.value = 100 * (elapsed / conditionalMedian);
    }, updateInterval * 1000);
  },

  stopAnimation: function() {
    if (!this.updateIntervalId) {
      return;
    }
    clearInterval(this.updateIntervalId);
    this.updateIntervalId = null;
  },

  handleCancelTapped: function() {
    this.fire('CancelServerCreationRequested');
  }
});
