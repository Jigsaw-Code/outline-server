// Copyright 2022 The Outline Authors
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
import minimist from 'minimist';
import url from 'url';

export async function getElectronBuildFlags(platform, buildMode) {
  let buildFlags = [
    '--projectDir=build/server_manager/electron_app/static',
    '--config=../../../../src/server_manager/electron_app/electron_builder.json',
    '--publish=never',
  ];

  switch (platform) {
    case 'linux':
      buildFlags = ['--linux', ...buildFlags];
      break;
    case 'windows':
      buildFlags = ['--win', '--ia32', ...buildFlags];
      break;
    case 'macos':
      buildFlags = ['--mac', ...buildFlags];
  }

  if (buildMode === 'release') {
    buildFlags = [
      ...buildFlags,
      '--config.generateUpdatesFilesForAllChannels=true',
      '--config.publish.provider=generic',
      '--config.publish.url=https://s3.amazonaws.com/outline-releases/manager/',
    ];
  }

  return buildFlags;
}

async function main() {
  const {_, buildMode} = minimist(process.argv);

  const platform = _[2];

  console.log((await getElectronBuildFlags(platform, buildMode)).join(' '));
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  (async function () {
    return main();
  })();
}
