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

import * as errors from 'restify-errors';

import { ShadowsocksManagerService } from './manager_service';
import { MockAccessKeyRepository } from './mocks/mocks';
import { AccessKey, AccessKeyRepository } from '../model/access_key';

describe('ShadowsocksManagerService', () => {
  // After processing the response callback, we should set
  // responseProcessed=true.  This is so we can detect that first the response
  // callback is invoked, followed by the next (done) callback.
  let responseProcessed = false;
  beforeEach(() => {
    responseProcessed = false;
  });
  afterEach(() => {
    expect(responseProcessed).toEqual(true);
  });

  it('lists access keys in order', (done) => {
    const repo = new MockAccessKeyRepository();
    const service = new ShadowsocksManagerService(repo);

    // Create 2 access keys with names.
    Promise.all([
      createNewAccessKeyWithName(repo, 'keyName1'),
      createNewAccessKeyWithName(repo, 'keyName2')
    ]).then((keys) => {
      // Verify that response returns keys in correct order with correct names.
      const res = {send: (httpCode, data) => {
        expect(httpCode).toEqual(200);
        expect(data.accessKeys.length).toEqual(2);
        expect(data.accessKeys[0].name).toEqual(keys[0].name);
        expect(data.accessKeys[0].id).toEqual(keys[0].id);
        expect(data.accessKeys[1].name).toEqual(keys[1].name);
        expect(data.accessKeys[1].id).toEqual(keys[1].id);
        responseProcessed = true;  // required for afterEach to pass.
      }};
      service.listAccessKeys({params: {}}, res, done);
    });
  });

  it('creates keys', (done) => {
    const repo = new MockAccessKeyRepository();
    const service = new ShadowsocksManagerService(repo);

    // Verify that response returns a key with the expected properties.
    const res = {send: (httpCode, data) => {
      expect(httpCode).toEqual(201);
      const expectedProperties = ['id', 'name', 'password', 'port', 'method', 'accessUrl'];
      expect(Object.keys(data).sort()).toEqual(expectedProperties.sort());
      responseProcessed = true;  // required for afterEach to pass.
    }};
    service.createNewAccessKey({params: {}}, res, done);
  });

  it('removes keys', (done) => {
    const repo = new MockAccessKeyRepository();
    const service = new ShadowsocksManagerService(repo);

    // Create 2 access keys with names.
    Promise.all([
      createNewAccessKeyWithName(repo, 'keyName1'),
      createNewAccessKeyWithName(repo, 'keyName2')
    ]).then((keys) => {
      const res = {send: (httpCode, data) => {
        expect(httpCode).toEqual(204);
        // expect that the only remaining key is the 2nd key we created.
        expect(getFirstAccessKey(repo).id === keys[1].id);
        responseProcessed = true;  // required for afterEach to pass.
      }};
      // remove the 1st key.
      service.removeAccessKey({params: {id: keys[0].id}}, res, done);
    });
  });

  it('renames keys', (done) => {
    const repo = new MockAccessKeyRepository();
    const service = new ShadowsocksManagerService(repo);
    const OLD_NAME = 'oldName';
    const NEW_NAME = 'newName';

    createNewAccessKeyWithName(repo, OLD_NAME).then((key) => {
      expect(getFirstAccessKey(repo).name === OLD_NAME);
      const res = {send: (httpCode, data) => {
        expect(httpCode).toEqual(204);
        expect(getFirstAccessKey(repo).name === NEW_NAME);
        responseProcessed = true;  // required for afterEach to pass.
      }};
      service.renameAccessKey({params: {id: key.id, name: NEW_NAME}}, res, done);
    });
  });

  it('Rename returns a 500 when the repository throws an exception', (done) => {
    const repo = new MockAccessKeyRepository();
    spyOn(repo, 'renameAccessKey').and.throwError('cannot write to disk');
    const service = new ShadowsocksManagerService(repo);

    createNewAccessKeyWithName(repo, 'oldName').then((key) => {
      const res = {send: (httpCode, data) => {}};
      service.renameAccessKey({params: {id: key.id, name: 'newName'}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });

  it('Create returns a 500 when the repository throws an exception', (done) => {
    const repo = new MockAccessKeyRepository();
    spyOn(repo, 'createNewAccessKey').and.throwError('cannot write to disk');
    const service = new ShadowsocksManagerService(repo);

    const res = {send: (httpCode, data) => {}};
    service.createNewAccessKey({params: {}}, res, (error) => {
      expect(error.statusCode).toEqual(500);
      responseProcessed = true;  // required for afterEach to pass.
      done();
    });
  });

  it('Remove returns a 500 when the repository throws an exception', (done) => {
    const repo = new MockAccessKeyRepository();
    spyOn(repo, 'removeAccessKey').and.throwError('cannot write to disk');
    const service = new ShadowsocksManagerService(repo);

    // Create 2 access keys with names.
    createNewAccessKeyWithName(repo, 'keyName1').then((key) => {
      const res = {send: (httpCode, data) => {}};
      service.removeAccessKey({params: {id: key.id}}, res, (error) => {
        expect(error.statusCode).toEqual(500);
        responseProcessed = true;  // required for afterEach to pass.
        done();
      });
    });
  });
});

function getFirstAccessKey(repo: AccessKeyRepository) {
  return repo.listAccessKeys().next().value;
}

function createNewAccessKeyWithName(
    repo: AccessKeyRepository, name: string): Promise<AccessKey> {
  return repo.createNewAccessKey().then((key) => {
    key.rename(name);
    return key;
  });
}