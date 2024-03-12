# How to Contribute

We'd love to accept your patches and contributions to this project. There are
just a few small guidelines you need to follow.

## Before you begin

### Contributor License Agreement

Contributions to this project must be accompanied by a Contributor License
Agreement. You (or your employer) retain the copyright to your contribution,
this simply gives us permission to use and redistribute your contributions as
part of the project. Head over to <https://cla.developers.google.com/> to see
your current agreements on file or to sign a new one.

You generally only need to submit a CLA once, so if you've already submitted one
(even if it was for a different project), you probably don't need to do it
again.

### Code reviews

All submissions, including submissions by project members, require review. We
use GitHub pull requests for this purpose. Consult
[GitHub Help](https://help.github.com/articles/about-pull-requests/) for more
information on using pull requests.

## Build Actions

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
