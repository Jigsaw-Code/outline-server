# Outline Manager

## Running

To run the Outline Manager Electron app:

```
npm run action server_manager/electron_app/start
```

To run the Outline Manager Electron app with a development build (code not minified):

```
BUILD_ENV=development npm run action server_manager/electron_app/start
```

## Development Server

To run the Outline Manager as a web app on the browser and listen for changes:

```
npm run action server_manager/web_app/start
```

## Gallery Server for UI Development

We have a server app to for quickly iterating on UI components. To spin it up, run

```
npm run action server_manager/web_app/start_gallery
```

Changes to UI components will be hot reloaded into the gallery.

## Debug an existing binary

You can run an existing binary in debug mode by setting `OUTLINE_DEBUG=true`.
This will enable the Developer menu on the application window.

## Packaging

To build the app binary:

```
npm run action server_manager/electron_app/build ${PLATFORM} -- --buildMode=[debug,release]
```

Where `${PLATFORM}` is one of `linux`, `mac`, `windows`.

The per-platform standalone apps will be at `build/electron_app/static/dist`.

- Windows: zip files. Only generated if you have [wine](https://www.winehq.org/download) installed.
- Linux: tar.gz files.
- macOS: dmg files if built from macOS, zip files otherwise.

## Error reporting

To enable error reporting through [Sentry](https://sentry.io/) for local builds, run:

```bash
export SENTRY_DSN=[Sentry development API key]
npm run action server_manager/electron_app/start
```

## CI Environment Variables

For your CI to run smoothly, you'll need the following in your ENV:

- `SENTRY_DSN` - [url required](https://docs.sentry.io/product/sentry-basics/dsn-explainer/) to enable sentry integration. Same across all platforms.
- `RELEASES_REPOSITORY` - the username and repository name of the repository you're pushing releases to. In our case, `Jigsaw-Code/outline-releases`
- `RELEASES_DEPLOY_KEY` - an ssh secret key for the matching releases repository public deploy key - [how to set this up](https://docs.github.com/en/developers/overview/managing-deploy-keys#setup-2)
