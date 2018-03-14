#!/bin/bash -eux
#
# Copyright 2018 The Outline Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Get INCREMENT_TYPE
if (( $# <= 0 )); then
  echo "usage: ./release_action.sh [major|minor|patch]"
  exit 1;
fi
readonly INCREMENT_TYPE=$1

readonly MODULE_DIR=$(dirname $0)
readonly SCRIPTS_DIR=$MODULE_DIR/release_scripts/
readonly CONFIG_FILE=$MODULE_DIR/config.json

# Check that we are on the latest $BRANCH_FOR_RELEASE branch with no changes.
readonly BRANCH_FOR_RELEASE="master"
if [[ $(git rev-parse --abbrev-ref HEAD) != "$BRANCH_FOR_RELEASE" ]]; then
 echo "Must be on $BRANCH_FOR_RELEASE branch"
 exit 1
fi
if [[ $(git diff) != "" ]]; then
  echo "Must have no local changes"
  exit 1
fi
git pull origin $BRANCH_FOR_RELEASE

# Create a new branch for this release - will be deleted after this script is
# run regardless of whether the release is successful or not.
readonly BRANCH_NAME="release-$(date "+%Y%m%d-%H%M%S")"
git checkout -b $BRANCH_NAME

# Set trap to return to $BRANCH_FOR_RELEASE branch and delete temporary branch.
function finish {
  git checkout $BRANCH_FOR_RELEASE
  git branch -D $BRANCH_NAME
}
trap finish EXIT

function getConfigVersion {
  echo $(node $SCRIPTS_DIR/get_config_version.js $CONFIG_FILE)
}

# Update electron_app/config.json and store old and new versions.
readonly OLD_VERSION=$(getConfigVersion)
node $SCRIPTS_DIR/bump_electron_version.js $CONFIG_FILE $INCREMENT_TYPE
readonly NEW_VERSION=$(getConfigVersion)

# Create packages and copy them into releases directory.
yarn run clean
yarn
do_action server_manager/electron_app/package
cp -f ${BUILD_DIR}/server_manager/electron_app/static/dist/*.* releases/

# Update releases/release_data.json
sed -i "" "s/$OLD_VERSION/$NEW_VERSION/g" releases/release_data.json

# Push to github
git add .
git commit -m "new release"
git push origin $BRANCH_NAME
readonly TAG_NAME="v$NEW_VERSION"
git tag $TAG_NAME
git push origin $TAG_NAME

# Open a pull request in github.
readonly GITHUB_URL="https://github.com/Jigsaw-Code/outline-server/compare/$BRANCH_NAME?expand=1"
open $GITHUB_URL
