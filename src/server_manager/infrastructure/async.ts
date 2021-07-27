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

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface Waker {
  resolve: (value: void | PromiseLike<void>) => void;
  reject: (e: Error) => void;
}

/**
 * Represents a value that can change over time, with a generator that
 * exposes changes to the value.
 * 
 * Watchers are not guaranteed to see every intermediate value, but are
 * guaranteed to see the last value in a series of updates.
 */
export class ValueStream<T> {
  private static readonly CLOSE = new Error('Stop sending or receiving change events');
  private wakers: Waker[] = [];
  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(newValue: T) {
    if (this.wakers === null) {
      throw new Error('Cannot change a closed value stream');
    }
    this.value = newValue;
    const wakers = this.wakers;
    this.wakers = [];
    wakers.forEach(({resolve}) => resolve());
  }

  close() {
    const finalWakers = this.wakers;
    this.wakers = null;
    finalWakers.forEach(({reject}) => reject(ValueStream.CLOSE));
  }

  async *watch(): AsyncGenerator<T, void> {
    try {
      yield this.value;
      while (this.wakers !== null) {
        await new Promise<void>((resolve, reject) => {
          this.wakers.push({resolve, reject});
        });
        yield this.value;
      }  
    } catch (e) {
      if (e !== ValueStream.CLOSE) {
        throw e;
      }
    }
  }
}
