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

const {makeConfig} = require('../base.webpack.js');

const baseConfig = makeConfig({
  defaultMode: 'development'
});

module.exports = function(config) {
  config.set({
    frameworks: ['jasmine'],
    files: [
      '**/*.spec.ts',
    ],
    preprocessors: {
      '**/*.spec.ts': ['webpack'],
    },
    reporters: ['progress'],
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadless'],
    singleRun: true,
    concurrency: Infinity,
    webpack: {
      module: baseConfig.module,
      resolve: baseConfig.resolve,
      plugins: baseConfig.plugins,
      mode: baseConfig.mode,
    }
  })
};
