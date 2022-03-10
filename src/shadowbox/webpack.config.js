/* eslint-disable @typescript-eslint/no-var-requires */
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

const path = require('path');
const webpack = require('webpack');

const config = {
  mode: 'production',
  entry: path.resolve(__dirname, './server/main.ts'),
  target: 'node',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, '../../build/shadowbox/app'),
  },
  module: {rules: [{test: /\.ts(x)?$/, use: 'ts-loader'}]},
  node: {
    // Use the regular node behavior, the directory name of the output file when run.
    __dirname: false,
  },
  plugins: [
    // WORKAROUND: some of our (transitive) dependencies use node-gently, which hijacks `require`.
    // Setting global.GENTLY to false makes these dependencies use standard require.
    new webpack.DefinePlugin({'global.GENTLY': false}),
  ],
  resolve: {extensions: ['.tsx', '.ts', '.js']},
};

module.exports = config;
