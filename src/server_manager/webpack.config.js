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
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const config = {
  mode: 'production',
  entry: [
    require.resolve('@webcomponents/webcomponentsjs/webcomponents-loader.js'),
    path.resolve(__dirname, './web_app/ui_components/style.css'),
    path.resolve(__dirname, './web_app/main.ts'),
  ],
  target: 'electron-renderer',
  devtool: 'inline-source-map',
  output: {
    path: path.resolve(__dirname, '../../build/server_manager/web_app/static'),
    filename: 'main.js'
  },
  module: {
    rules: [
      {
        test: /\.ts(x)?$/,
        exclude: /node_modules/,
        use: [
          'ts-loader',
          './src/server_manager/css-in-js-rtl-loader',
        ],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: [
          './src/server_manager/css-in-js-rtl-loader',
        ],
      },
      {
        test: /\.css?$/,
        use: [
          'style-loader',
          'css-loader',
        ],
      }
    ]
  },
  resolve: {extensions: ['.tsx', '.ts', '.js']},
  plugins: [
    new webpack.DefinePlugin({
      // Hack to protect against @sentry/electron not having process.type defined.
      'process.type': JSON.stringify('renderer'),
      // Statically link the Roboto font, rather than link to fonts.googleapis.com
      'window.polymerSkipLoadingFontRoboto': JSON.stringify(true),
    }),
    new CopyPlugin(
        [
          {from: 'index.html', to: '.'},
          {from: 'images', to: 'images'},
          {from: 'messages', to: 'messages'},
        ],
        {context: __dirname}),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, './index.html'),
    }),
  ],
};

module.exports = config;