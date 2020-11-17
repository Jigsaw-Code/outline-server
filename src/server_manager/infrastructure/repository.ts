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

export type KeyExtractor<Record, Key> = (r: Record) => Key;
export type KeyComparator<Key> = (k1: Key, k2: Key) => boolean;

/** A local storage backed container class of keyed records. */
export class LocalStorageRepository<Record, Key> {
  private readonly records: Record[] = [];  // TODO: Switch to map
  constructor(
      private storageKey: string, private storage: Storage,
      private keyExtractor: KeyExtractor<Record, Key>,
      private keyComparator: KeyComparator<Key> = (k1: Key, k2: Key) => k1 === k2) {
    const serialized = storage.getItem(storageKey);
    if (serialized != null) {
      this.records = JSON.parse(serialized);
    }
  }

  /**
   * Sets the record. If a record at that key does not exist, one will be
   * created. Otherwise, the existing record is updated.
   *
   * @param record - The record to be set.
   */
  set(record: Record): void {
    const key = this.keyExtractor(record);
    this.remove(key);
    this.records.push(record);
    this.save();
  }

  /**
   * Removes the record associated with the given key.
   *
   * @param key - The key of the record to remove.
   */
  remove(key: Key): void {
    const index = this.records.findIndex((record) => {
      const recordKey = this.keyExtractor(record);
      return this.keyComparator(recordKey, key);
    });
    if (index > -1) {
      this.records.splice(index, 1);
    }
    this.save();
  }

  /**
   * Retrieves the record at a given key. If no record at the given key exists,
   * undefined will be returned.
   *
   * @param key - The key of the record to retrieve.
   */
  get(key: Key): Record|undefined {
    return this.records.find((record) => {
      const recordKey = this.keyExtractor(record);
      return this.keyComparator(recordKey, key);
    });
  }

  /** Returns a list of all records in the repository. */
  list(): Record[] {
    return Array.from(this.records.values());
  }

  private save(): void {
    const serialized = JSON.stringify(this.list());
    this.storage.setItem(this.storageKey, serialized);
  }
}
