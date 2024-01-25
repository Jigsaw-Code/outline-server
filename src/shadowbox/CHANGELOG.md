# 1.8.0
This release is about empowering developers and administrators with more sophisticated tools for automating key management and distribution, ensuring a more customizable service experience.

Features
  - API extensions
    - **Single Access Key Retrieval**: Added `/access-keys/{id}` endpoint to look up a single access key. By @murka in https://github.com/Jigsaw-Code/outline-server/pull/1142 and https://github.com/Jigsaw-Code/outline-server/pull/1278.
    - **Rich Access Key Creation Options**: Add name, limit and password properties to access key creation method. By @murka in https://github.com/Jigsaw-Code/outline-server/pull/1273
    - **Key ID Customization**: Add new `PUT` method to create a key with a specific identifier. Together with the change to specify other properties on key creation, this enables export and import of keys. It also enables the
creation of on-demand keys by key distribution systems in a way that preserves the user ID for usage tracking, or to use custom id schemes (like a encoding a user id + device). By @sbruens in https://github.com/Jigsaw-Code/outline-server/pull/1473
  - Performance and Compatibility Enhancements
    - **Flexible Ulimit Settings**: We've removed the ulimit setting from our Docker image. This change grants you the freedom to adjust the ulimit externally, optimizing the performance of the Outline VPN container without unnecessary constraints.
By @fortuna in https://github.com/Jigsaw-Code/outline-server/pull/1447.


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
