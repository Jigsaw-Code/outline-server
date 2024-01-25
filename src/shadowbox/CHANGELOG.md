# 1.7.3
- Features
  - Added `/access-keys/{id}` endpoint to look up a single access key. By @murka in https://github.com/Jigsaw-Code/outline-server/pull/1142 and https://github.com/Jigsaw-Code/outline-server/pull/1278.
  - Removed ulimit from image, so you can set the ulimit externally without further contraining the container. By @fortuna in https://github.com/Jigsaw-Code/outline-server/pull/1447.
  - Make temp file names longer, fixing https://github.com/Jigsaw-Code/outline-server/issues/1234 and making the server run on more platforms, including OpenBSD. By @fortuna in https://github.com/Jigsaw-Code/outline-server/pull/1464.



f5ac42c 1/17/2024 feat(server): add a new `PUT` method to create a key with a specific identifier (#1473)
57a30a2 1/12/2024 feat(server): add optional name/limit/password props for createNewAccessKey method (#1273)
4537fdd 1/10/2024 fix(server): make temp file names longer (#1464)
3d2c3db 11/15/2023 feat(server): remove ulimit (#1447)
e2b446d 3/29/2023 feat(server): add codeql security and quality queries and fix config (#1307)
508a5a2 2/28/2023 feat(server): add vulnerability analysis by CodeQL (#1271)
f7d15ac 1/27/2023 fix(server): use right TextFile interface path on FilesystemTextFile class (#1275)

# 1.7.2
- Fixes
  - Fix reporting of country metrics and improve logging output (https://github.com/Jigsaw-Code/outline-server/pull/1242)

# 1.7.1
- Fixes
  - Corner case of isPortUsed that could result in infinite restart loop (https://github.com/Jigsaw-Code/outline-server/pull/1238)
  - Prevent excessive logging (https://github.com/Jigsaw-Code/outline-server/pull/1232)

# 1.7.0

- Features
  - Add encryption cipher selection to create access key API (https://github.com/Jigsaw-Code/outline-server/pull/1002)
  - Make access key secrets longer (https://github.com/Jigsaw-Code/outline-server/pull/1098)
- Fixes
  - Race condition on concurrent API calls (https://github.com/Jigsaw-Code/outline-server/pull/995)
- Upgrades (https://github.com/Jigsaw-Code/outline-server/pull/1211)
  - Base image to `node:16.18.0-alpine3.16`
  - outline-ss-server from 1.3.5 to [1.4.0](https://github.com/Jigsaw-Code/outline-ss-server/releases/tag/v1.4.0)
  - Prometheus from 2.33.5 to [2.37.1](https://github.com/prometheus/prometheus/releases/tag/v2.37.1)
