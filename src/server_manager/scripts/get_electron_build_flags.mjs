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
import minimist from "minimist";
import url from "url";

export async function getElectronBuildFlags(platform, buildMode) {
  let buildFlags = [
    "--projectDir=build/server_manager/electron_app/static",
    "--config.asarUnpack=server_manager/web_app/images",
    "--publish=never",
    '--config.artifactName="Outline-Manager.${ext}"',
  ];

  switch (platform) {
    case "linux":
      buildFlags = ["--linux", "--config.linux.icon=icons/png", "--config.linux.category=Network", ...buildFlags];
      break;
    case "windows":
      buildFlags = ["--win", "--ia32", "--config.win.icon=icons/win/icon.ico", ...buildFlags];
      break;
    case "mac":
      buildFlags = ["--mac", "--config.mac.icon=icons/mac/icon.icns", ...buildFlags];
  }

  if (buildMode === "release") {
    // Publishing is disabled, updates are pulled from AWS. We use the generic provider instead of the S3
    // provider since the S3 provider uses "virtual-hosted style" URLs (my-bucket.s3.amazonaws.com)
    // which can be blocked by DNS or SNI without taking down other buckets.
    buildFlags = [
      ...buildFlags,
      "--config.generateUpdatesFilesForAllChannels=true",
      "--config.publish.provider=generic",
      `--config.publish.url=${process.env.RELEASES_REPOSITORY}`,
    ];
  }

  if (buildMode === "release" && platform === "windows") {
    buildFlags.push("--config.win.certificateSubjectName='Jigsaw Operations LLC'");
  }

  return buildFlags;
}

async function main() {
  const {_, buildMode} = minimist(process.argv);

  const platform = _[2];

  console.log((await getElectronBuildFlags(platform, buildMode)).join(" "));
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  (async function() {
    return main();
  })();
}
