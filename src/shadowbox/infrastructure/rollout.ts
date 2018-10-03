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
  constructor(private instanceId: string) {}

  // Returns true if the given feature is rolled out for this instance.
  // Ratio is the ratio of instances that should have the feature active.
  isRolloutEnabled(rolloutId: string, ratio: number) {
    const hash = crypto.createHash('md5');
    hash.update(this.instanceId);
    hash.update(rolloutId);
    const buffer = hash.digest();
    return buffer[0] < (ratio * 256);
  }
}
