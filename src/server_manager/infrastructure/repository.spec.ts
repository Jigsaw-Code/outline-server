// Copyright 2020 The Outline Authors
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

import {LocalStorageRepository} from './repository';
import {InMemoryStorage} from './memory_storage';

const STORAGE_KEY = 'test';

interface Record {
  id: string;
  data: string;
}

describe('LocalStorageRepository', () => {
  it('set saves record when record does not exist', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    const record = { id: 'one', data: '1000' };
    repository.set(record);

    const actual = storage.getItem(STORAGE_KEY);
    const expected = JSON.stringify([record]);
    expect(expected).toEqual(actual);
  });
  it('set overwrites record when record exists', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    const record = { id: 'one', data: '1000' };
    const recordUpdated = { id: 'one', data: '1001' };
    repository.set(record);
    repository.set(recordUpdated);

    const actual = storage.getItem(STORAGE_KEY);
    const expected = JSON.stringify([recordUpdated]);
    expect(expected).toEqual(actual);
  });
  it('remove deletes record when record exists', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    const record = { id: 'one', data: '1000' };
    repository.set(record);
    repository.remove('one');

    const actual = storage.getItem(STORAGE_KEY);
    const expected = JSON.stringify([]);
    expect(expected).toEqual(actual);
  });
  it('remove does nothing when record does not exists', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    repository.remove('one');

    const actual = storage.getItem(STORAGE_KEY);
    const expected = JSON.stringify([]);
    expect(expected).toEqual(actual);
  });
  it('get returns record when record exists', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    const record = { id: 'one', data: '1000' };
    repository.set(record);

    const actual = JSON.stringify(repository.get('one'));
    const expected = JSON.stringify(record);
    expect(expected).toEqual(actual);
  });
  it('get returns undefined when record does not exist', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    expect(undefined).toEqual(repository.get('one'));
  });
  it('list returns empty list when empty', () => {
    const storage = new InMemoryStorage();
    const repository = new LocalStorageRepository(STORAGE_KEY, storage, (record: Record) => record.id);
    expect([]).toEqual(repository.list());
  });
});

