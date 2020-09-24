#! /bin/bash

INFO_FILE_CHANNEL=$(jq -r '.version' src/server_manager/package.json | cut -s -d'-' -f2)
if [[ -z "${INFO_FILE_CHANNEL}" ]]; then
  INFO_FILE_CHANNEL=latest
fi
echo "${INFO_FILE_CHANNEL}"