# HOWTO re-generate `license.txt`

## Steps

- `cd` to the root of your clone of this repo
- Ensure `node_modules` is up to date and only include dependencies of the Electron app by running `npm ci && npm run action server_manager/web_app/build`
- `cd src/server_manager`
- `npx generate-license-file --input package.json --output web_app/ui_components/licenses/licenses.txt`
- `cd web_app/ui_components/licenses`
- `cat db-ip_license.txt >> licenses.txt`

Done!

## Check

To quickly look for non-compliant licenses:

```bash
yarn licenses list --prod|grep -Ev \(@\|VendorUrl:\|VendorName:\|URL:\)
```
