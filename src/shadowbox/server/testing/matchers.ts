// Copyright 2024 The Outline Authors
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

/**
 * Matchers defined in this module must be declared in this interface for
 * TypeScript to be happy.
 */
declare global {
  namespace jasmine {
    interface Matchers<T> {
      toHavePropertiesOf(expected: string[]): void;
    }
  }
}

/**
 * Custom Jasmine matchers.
 */
export const customMatchers: jasmine.CustomMatcherFactories = {
  // Compare two objects and returns true if actual contains all the
  // properties in the expected.
  toHavePropertiesOf: (util: jasmine.MatchersUtil): jasmine.CustomMatcher => {
    return {
      compare: (actual: Object, expected: string[]): jasmine.CustomMatcherResult => {
        const actualProperties = Object.keys(actual);
        const isEqual = util.equals(expected.sort(), actualProperties.sort());
        return {
          pass: isEqual,
          message:
            `Expected ${jasmine.pp(actual)}${isEqual ? '' : ' not'} ` +
            `to contain properties in ${jasmine.pp(expected)}`,
        };
      },
    };
  },
};
