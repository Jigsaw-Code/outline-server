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

import {RolloutTracker} from './rollout';

describe('RolloutTracker', () => {
  describe('isRolloutEnabled', () => {
    it('throws on out of range percentages', () => {
      const tracker = new RolloutTracker('instance-id');
      expect(() => tracker.isRolloutEnabled('rollout-id', -1)).toThrowError();
      expect(() => tracker.isRolloutEnabled('rollout-id', 101)).toThrowError();
    });
    it('throws on fractional percentage', () => {
      const tracker = new RolloutTracker('instance-id');
      expect(() => tracker.isRolloutEnabled('rollout-id', 0.1)).toThrowError();
      expect(() => tracker.isRolloutEnabled('rollout-id', 50.1)).toThrowError();
    });
    it('returns false on 0%', () => {
      const tracker = new RolloutTracker('instance-id');
      expect(tracker.isRolloutEnabled('rollout-id', 0)).toBeFalsy();
    });
    it('returns true on 100%', () => {
      const tracker = new RolloutTracker('instance-id');
      expect(tracker.isRolloutEnabled('rollout-id', 100)).toBeTruthy();
    });
    it('returns true depending on percentage', () => {
      const tracker = new RolloutTracker('instance-id');
      expect(tracker.isRolloutEnabled('rollout-id', 9)).toBeFalsy();
      expect(tracker.isRolloutEnabled('rollout-id', 10)).toBeTruthy();
    });
  });
  describe('forceRollout', () => {
    it('forces rollout', () => {
      const tracker = new RolloutTracker('instance-id');
      tracker.forceRollout('rollout-id', true);
      expect(tracker.isRolloutEnabled('rollout-id', 0)).toBeTruthy();
      tracker.forceRollout('rollout-id', false);
      expect(tracker.isRolloutEnabled('rollout-id', 100)).toBeFalsy();
    });
  });
});
