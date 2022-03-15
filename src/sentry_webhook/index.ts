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

import * as sentry from '@sentry/types';
import * as express from 'express';

import {
  postSentryEventToSalesforce,
  shouldPostEventToSalesforce,
} from './post_sentry_event_to_salesforce';

exports.postSentryEventToSalesforce = (req: express.Request, res: express.Response<string>) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }
  if (!req.body) {
    return res.status(400).send('Missing request body');
  }

  const sentryEvent: sentry.SentryEvent = req.body.event;
  if (!sentryEvent) {
    return res.status(400).send('Missing Sentry event');
  }
  if (!shouldPostEventToSalesforce(sentryEvent)) {
    return res.status(200).send();
  }
  // Use the request message if SentryEvent.message is unpopulated.
  sentryEvent.message = sentryEvent.message || req.body.message;
  postSentryEventToSalesforce(sentryEvent, req.body.project)
    .then(() => {
      res.status(200).send();
    })
    .catch((e) => {
      console.error(e);
      // Send an OK response to Sentry - they don't need to know about errors with posting to
      // Salesforce.
      res.status(200).send();
    });
};
