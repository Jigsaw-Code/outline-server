# Outline Manager

## Running

To run the Outline Manager Electron app:
```
yarn do server_manager/electron_app/run
```

## Development Server

To run the manager as a web app and listen for changes:

```
yarn workspace outline-manager run webpack-dev-server --config=browser.webpack.js --open
```

## Debug an existing binary

You can run an existing binary in debug mode by setting `OUTLINE_DEBUG=true`.
This will enable the Developer menu on the application window.

## Packaging

To build the app binary:
```
yarn do server_manager/electron_app/package_${PLATFORM}
```

Where `${PLATFORM}` is one of `linux`, `macos`, `only_windows`.

The per-platform standalone apps will be at `build/electron_app/static/dist`.

- Windows: zip files. Only generated if you have [wine](https://www.winehq.org/download) installed.
- Linux: tar.gz files.
- macOS: dmg files if built from macOS, zip files otherwise.

## Releases

To perform a release, use
```
yarn do server_manager/electron_app/release
```

This will perform a clean and reinstall all dependencies to make sure the build is not tainted.

## Error reporting

To enable error reporting through [Sentry](https://sentry.io/) for local builds, run:
``` bash
export SENTRY_DSN=[Sentry development API key]
yarn do server_manager/electron_app/run
```

Release builds on CI are configured with a production Sentry API key.
