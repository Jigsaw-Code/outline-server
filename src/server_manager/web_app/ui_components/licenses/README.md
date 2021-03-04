# HOWTO re-generate `license.txt`

## Requirements

* `yarn`

## Steps

* `cd` to the root of your clone of this repo
* Ensure `node_modules` is up to date and only include dependencies of the Electron app by running `yarn run clean && yarn && yarn do server_manager/web_app/build`
* `cd src/server_manager/web_app/ui_components/licenses`
* `yarn workspace outline-manager licenses generate-disclaimer --prod > licenses.txt`
* `cat db-ip_license.txt >> licenses.txt`

Done!

## Check

To quickly look for non-compliant licenses:

```bash
yarn licenses list --prod|grep -Ev \(@\|VendorUrl:\|VendorName:\|URL:\)
```
