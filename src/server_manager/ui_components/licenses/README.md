# HOWTO re-generate `license.txt`

## Requirements

* `yarn`
* `https://github.com/Jigsaw-Code/bower-disclaimer`

## Steps

* `cd` to the root of your clone of this repo
* Ensure `bower_components` and `node_modules` are up to date and only include dependencies of the Electron app by running `yarn run clean && yarn && yarn do yarn do server_manager/web_app/build`
* `cd src/server_manager`
* `yarn licenses generate-disclaimer --prod > /tmp/yarn`
* `node <path to your bower-disclaimer repo root>/build > /tmp/bower`
* `cat /tmp/{yarn,bower} > ui_components/licenses/licenses.txt`

Done!

## Check

To quickly test for non-compliant licenses:

```bash
yarn licenses list --prod|grep License:|sort -u
```
