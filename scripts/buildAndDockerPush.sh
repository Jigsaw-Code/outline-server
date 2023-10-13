#!/bin/sh
npm run action shadowbox/docker/build &&
docker tag outline/shadowbox bennyhils/outline &&
docker push bennyhils/outline
