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

import * as crypto from 'crypto';

// Utility to help with partial rollouts of new features.
export class RolloutTracker {
  private forcedRollouts = new Map<string, boolean>();

  constructor(private instanceId: string) {}

  // Forces a rollout to be enabled or disabled.
  forceRollout(rolloutId: string, enabled: boolean) {
    this.forcedRollouts.set(rolloutId, enabled);
  }

  // Returns true if the given feature is rolled out for this instance.
  // `percentage` is between 0 and 100 and represents the percentage of
  // instances that should have the feature active.
  isRolloutEnabled(rolloutId: string, percentage: number) {
    if (this.forcedRollouts.has(rolloutId)) {
      return this.forcedRollouts.get(rolloutId);
    }
    if (percentage < 0 || percentage > 100) {
      throw new Error(`Expected 0 <= percentage <= 100. Found ${percentage}`);
    }
    if (Math.floor(percentage) !== percentage) {
      throw new Error(`Expected percentage to be an integer. Found ${percentage}`);
    }
    const hash = crypto.createHash('md5');
    hash.update(this.instanceId);
    hash.update(rolloutId);
    const buffer = hash.digest();
    return 100 * buffer[0] < percentage * 256;
  }
}
