// Copyright 2023 The Outline Authors
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

import {ClientRequest} from 'http';
import * as https from 'https';

import {postSentryEventToSalesforce} from './post_sentry_event_to_salesforce';
import {SentryEvent} from './event';

// NOTE: Jasmine's `toHaveBeenCalledWith` infers parameters for overloads
// incorrectly. See https://github.com/DefinitelyTyped/DefinitelyTyped/issues/42455.
function expectToHaveBeenCalledWith(spy: jasmine.Spy, expected: unknown) {
  expect(spy.calls.argsFor(0)[0]).toEqual(expected);
}

const BASIC_EVENT: SentryEvent = {
  user: {email: 'foo@bar.com'},
  message: 'my message',
};

describe('postSentryEventToSalesforce', () => {
  let mockRequest: jasmine.SpyObj<ClientRequest>;
  let requestSpy: jasmine.Spy;

  beforeEach(() => {
    mockRequest = jasmine.createSpyObj('request', ['on', 'write', 'end']);
    requestSpy = spyOn(https, 'request').and.returnValue(mockRequest);
  });

  it('sends the correct data for a basic prod event', () => {
    postSentryEventToSalesforce(BASIC_EVENT, 'outline-clients');

    const expectedOptions = {
      host: 'webto.salesforce.com',
      path: '/servlet/servlet.WebToCase',
      protocol: 'https:',
      method: 'post',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    };

    expectToHaveBeenCalledWith(requestSpy, expectedOptions);
    expectToHaveBeenCalledWith(
      mockRequest.write,
      'orgid=00D0b000000BrsN' +
        '&recordType=0120b0000006e8i' +
        '&email=foo%40bar.com' +
        '&00N0b00000BqOA4=' +
        '&description=my%20message' +
        '&00N5a00000DXxmr=I%20am%20using%20the%20Outline%20client%20application%20on%20my%20mobile%20or%20desktop%20device'
    );
    expect(mockRequest.end).toHaveBeenCalled();
  });

  it('sends the correct data for a basic dev event', () => {
    postSentryEventToSalesforce(BASIC_EVENT, 'outline-clients-dev');

    const expectedOptions = {
      host: 'google-jigsaw--jigsawuat.sandbox.my.salesforce.com',
      path: '/servlet/servlet.WebToCase',
      protocol: 'https:',
      method: 'post',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    };

    expectToHaveBeenCalledWith(requestSpy, expectedOptions);
    expectToHaveBeenCalledWith(
      mockRequest.write,
      'orgid=00D750000004dFg' +
        '&recordType=0123F000000MWTS' +
        '&email=foo%40bar.com' +
        '&00N3F000002Rqhq=' +
        '&description=my%20message' +
        '&00N75000000wYiX=I%20am%20using%20the%20Outline%20client%20application%20on%20my%20mobile%20or%20desktop%20device'
    );
    expect(mockRequest.end).toHaveBeenCalled();
  });

  it('sends correctly converted tags', () => {
    const event: SentryEvent = {
      user: {email: 'foo@bar.com'},
      message: 'my message',
      tags: [
        ['category', 'no-server'],
        ['subject', 'test subject'],
        ['os.name', 'Mac OS X'],
        ['sentry:release', 'test version'],
        ['build.number', '0.0.0-debug'],
        ['accessKeySource', 'test source'],
        ['unknown:tag', 'foo'],
      ],
    };

    postSentryEventToSalesforce(event, 'outline-clients');

    expectToHaveBeenCalledWith(
      mockRequest.write,
      'orgid=00D0b000000BrsN' +
        '&recordType=0120b0000006e8i' +
        '&email=foo%40bar.com' +
        '&00N0b00000BqOA4=' +
        '&description=my%20message' +
        '&00N5a00000DXxmr=I%20am%20using%20the%20Outline%20client%20application%20on%20my%20mobile%20or%20desktop%20device' +
        '&00N5a00000DXy19=I%20need%20an%20access%20key' +
        '&subject=test%20subject' +
        '&00N5a00000DXxmo=MacOS' +
        '&00N5a00000DXxmq=test%20version' +
        '&00N5a00000DXy64=0.0.0-debug' +
        '&00N5a00000DXxms=test%20source'
    );
    expect(mockRequest.end).toHaveBeenCalled();
  });
});
