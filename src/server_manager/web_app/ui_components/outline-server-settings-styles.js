/*
  Copyright 2020 The Outline Authors

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

import {html} from '@polymer/polymer/lib/utils/html-tag.js';
import {unsafeCSS} from 'lit-element';

//  outline-server-settings-styles
//  This file holds common styles for outline-server-settings and outline-validated-input
const styleElement = document.createElement('dom-module');
styleElement.appendChild(html`
<style>
  /* Skip processing these with postcss-rtl as it incorrectly parses the border-color
      in the paper-input-container-underline-focus mixin.
      https://github.com/vkalinichev/postcss-rtl/issues/50 */
  /* rtl:begin:ignore */
  paper-input {
    /* Matches the max width of outline-validated-input  */
    max-width: 545px;
    /* Removes extra padding added by children of paper-input */
    margin-top: -8px;
    /* Create space for error messages */
    margin-bottom: 14px;
    --paper-input-container-label-focus: {
      color: var(--primary-green);
    };
    --paper-input-container-underline-focus: {
      border-color: var(--primary-green);
    };
    --paper-input-container-label: {
      font-size: 14px;
      line-height: 22px;
    };
    --paper-input-container-color: var(--medium-gray);
    --paper-input-container-input: {
      color: #fff;
    };
    --paper-input-container-invalid-color: #f28b82;
  }
  /* rtl:end:ignore */

  paper-input[readonly] {
    --paper-input-container-underline: {
      display: none;
    };
    --paper-input-container-underline-focus: {
      display: none;
    };
    --paper-input-container-underline-disabled: {
      display: none;
    };
    --paper-input-container-disabled: {
      opacity: 1;
    };
  }
  paper-input:not([readonly]) {
    width: 60%;
  }
  paper-dropdown-menu {
    border: 1px solid var(--medium-gray);
    border-radius: 4px;
    max-width: 150px;
    --paper-input-container: {
      padding: 0 4px;
      text-align: center;
    };
    --paper-input-container-input: {
      color: var(--medium-gray);
      font-size: 14px;
    };
    --paper-dropdown-menu-ripple: {
      display: none;
    };
    --paper-input-container-underline: {
      display: none;
    };
    --paper-input-container-underline-focus: {
      display: none;
    };
  }
  paper-listbox paper-item {
    font-size: 14px;
  }
  paper-listbox paper-item:hover {
    cursor: pointer;
    background-color: #eee;
  }
  paper-checkbox {
    /* We want the ink to be the color we're going to, not coming from */
    --paper-checkbox-checked-color: var(--primary-green);
    --paper-checkbox-checked-ink-color: var(--dark-gray);
    --paper-checkbox-unchecked-color: var(--light-gray);
    --paper-checkbox-unchecked-ink-color: var(--primary-green);
  }

  .content {
    flex-grow: 1;
  }
  .setting {
    padding: 24px;
    align-items: flex-start;
  }
  .setting:not(:first-child) {
    margin-top: 8px;
  }
  .setting-icon,
  img.setting-icon {
    margin-inline-end: 24px;
    color: #fff;
    opacity: 0.87;
    filter: grayscale(100%);
  }
  .setting > div {
    width: 100%;
  }
  .setting h3 {
    margin: 0 0 16px 0;
    padding: 0;
    color: #fff;
    font-size: 16px;
    width: 100%;
  }
  .setting p {
    margin-bottom: 12px;
    width: 60%;
    color: var(--medium-gray);
  }
  .sub-section {
    background: var(--border-color);
    padding: 16px;
    margin: 24px 0;
    display: flex;
    align-items: center;
    border-radius: 2px;
  }
  .sub-section iron-icon {
    margin-inline-end: 16px;
  }
  .selection-container {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .selection-container > .content {
    flex: 4;
  }
  .selection-container > paper-dropdown-menu {
    flex: 1;
  }
  .selection-container paper-checkbox {
    margin-inline-end: 4px;
  }
</style>`);

styleElement.register('outline-server-settings-styles');
const settingsStyleCss = styleElement.querySelector('template').content.textContent;
export const SETTINGS_STYLES = unsafeCSS(settingsStyleCss);
