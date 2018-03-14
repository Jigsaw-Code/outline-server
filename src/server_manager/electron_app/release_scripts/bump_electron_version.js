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

// Increments the "version" field in the Outline Manager Electron app's
// config.json file.

const fs = require('fs');
const semver = require('semver');

const configFilename = process.argv[2];
const bumpType = process.argv[3];
if (!configFilename || !bumpType) {
  console.error('usage: node bump_electron_version.js <configFilename> <[major|minor|patch]>');
  process.exit(1);
} else if (!(new Set(['major', 'minor', 'patch'])).has(bumpType)) {
  console.error('bumpType must be major, minor, or patch');
  process.exit(1);
}

// Read the config file.
const configText = fs.readFileSync(configFilename, {encoding: 'utf8'});
const configObj = JSON.parse(configText);

// Write new config file.
configObj.version = semver.inc(configObj.version, bumpType);
const newConfigJson = JSON.stringify(configObj, null, 2);
fs.writeFileSync(configFilename, newConfigJson, {encoding: 'utf8'});
console.log('Updated ' + configFilename + ' to version ' + configObj.version);
