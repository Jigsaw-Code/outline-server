# Outline Server

![Build and Test](https://github.com/Jigsaw-Code/outline-server/actions/workflows/build_and_test_debug.yml/badge.svg?branch=master) [![Mattermost](https://badgen.net/badge/Mattermost/Outline%20Community/blue)](https://community.internetfreedomfestival.org/community/channels/outline-community) [![Reddit](https://badgen.net/badge/Reddit/r%2Foutlinevpn/orange)](https://www.reddit.com/r/outlinevpn/)

Outline Server is a tool to create and manage your own VPN servers using Shadowsocks proxies. If you prefer a graphical interface, you can use the [Outline Manager](https://github.com/Jigsaw-Code/outline-apps/).

**Components:**

- **Outline Server** ([`src/shadowbox`](src/shadowbox)): The core proxy server that runs a Shadowsocks instance. It provides a REST API for access key management.

- **Metrics Server** ([`src/metrics_server`](src/metrics_server)): A REST service for optional, anonymous metrics sharing.)

**Join the Outline Community** by signing up for the [IFF Mattermost](https://wiki.digitalrights.community/index.php?title=IFF_Mattermost)!

## Shadowsocks and Anti-Censorship

Outline's use of Shadowsocks means it benefits from ongoing improvements that strengthen its resistance against detection and blocking.

**Key Protections:**

- **AEAD ciphers** are mandatory.
- **Probing resistance** mitigates detection techniques.
- **Protection against replayed data.**
- **Variable packet sizes** to hinder identification.

[Read more](docs/shadowsocks.md) about Shadowsocks resistance against detection and blocking.

## Installation

**Prerequisites**

- [Docker](https://docs.docker.com/engine/install/) and [docker-compose](https://docs.docker.com/compose/install/)
- [Node](https://nodejs.org/en/download/) LTS (`lts/hydrogen`, version `18.16.0`)
- [NPM](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) (version `9.5.1`)

> [!NOTE]
> If you use `nvm`, switch to the correct Node version with `nvm use`.

1. **Install dependencies**

   ```sh
   npm install
   ```

1. **Start the server**

   ```sh
   npm run action shadowbox/server/start
   ```

   (For more build system details, see [docs/build.md](docs/build.md).)

1. **To clean up**

   ```sh
   npm run clean
   ```
