# Outline Manager

## Running

To run the Outline Manager:
```
yarn do server_manager/electron_app/run
```

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
