# Outline Metrics Server

The Outline Metrics Server is a [Google Cloud Function](https://cloud.google.com/functions/) which writes to BigQuery usage data received from Outline servers.

## Requirements

* [Google Cloud SDK](https://cloud.google.com/sdk/)

## Build

```sh
yarn do metrics_server/build
```

## Deploy

* Authenticate with `gcloud`:
  ```sh
  gcloud auth login
  ```
* To deploy to test:
  ```sh
  yarn do metrics_server/deploy_test
  ```
* To deploy to prod:
  ```sh
  yarn do metrics_server/deploy_prod
  ```

## Test

We can test the function locally with the [Cloud Functions Emulator](https://cloud.google.com/functions/docs/emulator).

**Note: The emulator is not actively maintained is very temperamental!**

Because the emulator explicitly requests Node.js 6.x (it refuses to even install on other versions), we have not added it to our `package.json`. If you use a Node version manager such as [NVM](https://github.com/creationix/nvm), it is easy to switch temporarily to Node.js 6.x:
```sh
nvm install 6
yarn global add @google-cloud/functions-emulator
```

`yarn do metrics_server/test` builds and spins up a local server. It accepts one argument, which it forwards to the function, e.g.:
```
export TIMESTAMP=$(date +%s%3N)
yarn do metrics_server/test '{"serverId":"12345","startUtcMs":'$TIMESTAMP',"endUtcMs":'$(($TIMESTAMP+1))',"userReports":[{"userId":"1","bytesTransferred":60,"countries":["US","NL"]},{"userId":"2","bytesTransferred":100,"countries":["UK"]}]}'
```

After running, you can view the inserted data in BigQuery, e.g.:
```sql
SELECT * FROM [uproxysite:uproxy_metrics_test.connections_v1] ORDER BY endTimestamp DESC LIMIT 10;
```

**Note: The emulator ignores the response code: if the function returns 400 or 500, the command will appear to run successfully!**

Troubleshooting:
* If you run into errors like `could not load the default credentials`, try this command:
  ```sh
  gcloud auth application-default login
  ```
* Many errors can be "fixed" by clearing the emulator's config, e.g.:
  * `functions clear`
  * kill any running server, e.g. `pkill -f functions`
  * clear `~/.config/configstore/@google-cloud`
