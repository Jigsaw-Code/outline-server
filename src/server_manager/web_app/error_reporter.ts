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

import * as Raven from 'raven-js';

import * as errors from '../infrastructure/errors';

// TODO(dborkan): This class contains a lot of duplication from the client but
//                has the Cordova specific logic removed. Consider combining
//                these into 1 shared library if possible.
// tslint:disable-next-line:no-namespace
export namespace SentryErrorReporter {
  export class IllegalStateError extends errors.OutlineError {
    constructor(message?: string) {
      super(message);
    }
  }

  export function init(sentryDsn: string, appVersion: string): void {
    if (Raven.isSetup()) {
      throw new IllegalStateError('Error reporter already initialized.');
    }
    // Breadcrumbs for console logging and XHR may include PII such as the server IP address,
    // secret API prefix, or shadowsocks access credentials. Only enable DOM breadcrumbs to receive
    // UI click data.
    const autoBreadcrumbOptions = {
      dom: true,
      console: false,
      location: false,
      xhr: false,
    };
    Raven.config(sentryDsn, {autoBreadcrumbs: autoBreadcrumbOptions, release: appVersion})
        .install();
    try {
      // tslint:disable-next-line:no-any
      window.addEventListener('unhandledrejection', (event: any) => {
        Raven.captureException(event.reason);
      });
    } catch (e) {
      // window.addEventListener not available, i.e. not running in a browser
      // environment.
      // TODO: refactor this code so the try/catch isn't necessary and the
      // unhandledrejection listener can be tested.
    }
  }

  export function report(userFeedback: string, feedbackCategory: string, userEmail?: string): void {
    if (!Raven.isSetup()) {
      throw new IllegalStateError('Error reporter not initialized.');
    }
    Raven.setUserContext({email: userEmail || ''});
    Raven.captureMessage(userFeedback, {tags: {category: feedbackCategory}});
    Raven.setUserContext();  // Reset the user context, don't cache the email
  }

  // Logs an info message to be sent to Sentry when `report` is called.
  export function logInfo(message: string): void {
    log({message, level: 'info'});
  }

  // Logs an error message to be sent to Sentry when `report` is called.
  export function logError(message: string): void {
    log({message, level: 'error'});
  }

  function log(breadcrumb: Raven.Breadcrumb) {
    Raven.captureBreadcrumb(breadcrumb);
  }
}
