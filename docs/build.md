# Build Actions

We have a very simple build system based on package.json scripts that are called using `npm run`
and a thin wrapper for what we call build "actions".

We've defined a package.json script called `action` whose parameter is a relative path:

```sh
npm run action $ACTION
```

This command will define a `run_action()` function and call `${ACTION}.action.sh`, which must exist.
The called action script can use `run_action` to call its dependencies. The $ACTION parameter is
always resolved from the project root, regardless of the caller location.

The idea of `run_action` is to keep the build logic next to where the relevant code is.
It also defines two environmental variables:

- `ROOT_DIR`: the root directory of the project, as an absolute path.
- `BUILD_DIR`: where the build output should go, as an absolute path.

> [!TIP]
> To find all the actions in this project, run `npm run action:list`
