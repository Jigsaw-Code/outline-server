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
import * as https from 'https';

// Defines the Salesforce form field names.
interface SalesforceFormFields {
  orgId: string;
  recordType: string;
  email: string;
  description: string;
  category: string;
  cloudProvider: string;
  sentryEventUrl: string;
  os: string;
  version: string;
  type: string;
}

// Defines the Salesforce form values.
interface SalesforceFormValues {
  orgId: string;
  recordType: string;
}

const SALESFORCE_DEV_HOST = 'google-jigsaw--uat.my.salesforce.com';
const SALESFORCE_PROD_HOST = 'webto.salesforce.com';
const SALESFORCE_PATH = '/servlet/servlet.WebToCase';
const SALESFORCE_FORM_FIELDS_DEV: SalesforceFormFields = {
  orgId: 'orgid',
  recordType: 'recordType',
  email: 'email',
  description: 'description',
  category: '00N3F000002Rqho',
  cloudProvider: '00N3F000002Rqhs',
  sentryEventUrl: '00N3F000002Rqhq',
  os: '00N3F000002cLcN',
  version: '00N3F000002cLcI',
  type: 'type',
};
const SALESFORCE_FORM_FIELDS_PROD: SalesforceFormFields = {
  orgId: 'orgid',
  recordType: 'recordType',
  email: 'email',
  description: 'description',
  category: '00N0b00000BqOA2',
  cloudProvider: '00N0b00000BqOA7',
  sentryEventUrl: '00N0b00000BqOA4',
  os: '00N0b00000BqOfW',
  version: '00N0b00000BqOfR',
  type: 'type',
};
const SALESFORCE_FORM_VALUES_DEV: SalesforceFormValues = {
  orgId: '00D3F000000DDDH',
  recordType: '0123F000000MWTS',
};
const SALESFORCE_FORM_VALUES_PROD: SalesforceFormValues = {
  orgId: '00D0b000000BrsN',
  recordType: '0120b0000006e8i',
};

// Returns whether a Sentry event should be sent to Salesforce by checking that it contains an
// email address.
export function shouldPostEventToSalesforce(event: sentry.SentryEvent): boolean {
  return !!event.user && !!event.user.email;
}

// Posts a Sentry event to Salesforce using predefined form data. Assumes
// `shouldPostEventToSalesforce` has returned true for `event`.
export function postSentryEventToSalesforce(
  event: sentry.SentryEvent,
  project: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Sentry development projects are marked with 'dev', i.e. outline-client-dev.
    const isProd = project.indexOf('-dev') === -1;
    const salesforceHost = isProd ? SALESFORCE_PROD_HOST : SALESFORCE_DEV_HOST;
    const formFields = isProd ? SALESFORCE_FORM_FIELDS_PROD : SALESFORCE_FORM_FIELDS_DEV;
    const formValues = isProd ? SALESFORCE_FORM_VALUES_PROD : SALESFORCE_FORM_VALUES_DEV;
    const isClient = project.indexOf('client') !== -1;
    const formData = getSalesforceFormData(
      formFields,
      formValues,
      event,
      event.user!.email!,
      isClient,
      project
    );
    const req = https.request(
      {
        host: salesforceHost,
        path: SALESFORCE_PATH,
        protocol: 'https:',
        method: 'post',
        headers: {
          // The production server will reject requests that do not specify this content type.
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Failed to post form data, response status: ${res.statusCode}`));
        }
      }
    );
    req.on('error', (err) => {
      reject(new Error(`Failed to submit form: ${err}`));
    });
    req.write(formData);
    req.end();
  });
}

// Returns a URL-encoded string with the Salesforce form data.
function getSalesforceFormData(
  formFields: SalesforceFormFields,
  formValues: SalesforceFormValues,
  event: sentry.SentryEvent,
  email: string,
  isClient: boolean,
  project: string
): string {
  const form = [];
  form.push(encodeFormData(formFields.orgId, formValues.orgId));
  form.push(encodeFormData(formFields.recordType, formValues.recordType));
  form.push(encodeFormData(formFields.email, email));
  form.push(encodeFormData(formFields.sentryEventUrl, getSentryEventUrl(project, event.event_id)));
  form.push(encodeFormData(formFields.description, event.message));
  form.push(encodeFormData(formFields.type, isClient ? 'Outline client' : 'Outline manager'));
  if (event.tags) {
    const tags = getTagsMap(event.tags);
    form.push(encodeFormData(formFields.category, tags.get('category')));
    form.push(encodeFormData(formFields.os, tags.get('os.name')));
    form.push(encodeFormData(formFields.version, tags.get('sentry:release')));
    if (!isClient) {
      form.push(encodeFormData(formFields.cloudProvider, tags.get('cloudProvider')));
    }
  }
  return form.join('&');
}

function encodeFormData(field: string, value?: string) {
  return `${encodeURIComponent(field)}=${encodeURIComponent(value || '')}`;
}

// Although SentryEvent.tags is declared as an index signature object, it is actually an array of
// arrays i.e. [['key0': 'value0'], ['key1': 'value1']]. Converts the tags to a Map of strings.
function getTagsMap(tags: {[key: string]: string}) {
  const tagsMap = new Map<string, string>();
  for (const i of Object.keys(tags)) {
    try {
      const tagEntry = tags[i];
      tagsMap.set(tagEntry[0], tagEntry[1]);
    } catch (e) {
      console.error('Failed to process tag entry');
    }
  }
  return tagsMap;
}

function getSentryEventUrl(project: string, eventId?: string) {
  if (!eventId) {
    return '';
  }
  return `https://sentry.io/outlinevpn/${project}/events/${eventId}`;
}
