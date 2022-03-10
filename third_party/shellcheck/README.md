# Outline Shellcheck Wrapper

This directory is used to lint our scripts using [Shellcheck](https://www.shellcheck.net/). To ensure consistency across developer systems, the included script

- Attempts to identify the developer's OS (Linux, macOS, or Windows)
- Downloads a pinned version of Shellcheck into `./download`
- Checks the archive hash
- Extracts the executable
- Runs the executable

The executable is cached on the developer's system after the first download. To clear the cache, run `rm download` (or `npm run clean` in the repository root).
