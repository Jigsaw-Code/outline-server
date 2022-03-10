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

export interface Clock {
  // Returns the current time in milliseconds from the epoch.
  now(): number;
  setInterval(callback: () => void, intervalMs: number): void;
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }

  setInterval(callback, intervalMs: number): void {
    setInterval(callback, intervalMs);
  }
}

// Fake clock where you manually set what is "now" and can trigger the scheduled callbacks.
// Useful for tests.
export class ManualClock implements Clock {
  public nowMs = 0;
  private callbacks = [] as (() => void)[];

  now(): number {
    return this.nowMs;
  }

  setInterval(callback, _intervalMs): void {
    this.callbacks.push(callback);
  }

  async runCallbacks() {
    for (const callback of this.callbacks) {
      await callback();
    }
  }
}
