# Outline Metrics Server

The Outline Metrics Server is built using [Google Cloud Functions](https://cloud.google.com/functions/), which lets us write a simple Node HTTP server.  By deploying this server to the uproxysite Google project, we gain permission to write to uproxysite's BigQuery tables.

## Requirements
* Install `gcloud` from https://cloud.google.com/sdk/docs/
* Node 6.11.1 or greater (for testing via Cloud Functions Emulator)

## Building

```sh
yarn do metrics_server/build
```

## Deploying

Requirements:
* You must have access to the project `uproxysite`.

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

## Testing

We can test the function locally with the [Cloud Functions Emulator](https://cloud.google.com/functions/docs/emulator).

**Note: The emulator is not actively maintained is very temperamental!**

### Requirements

Because the emulator requires Node.js 6.x we have not added it to our `package.json`:
* Assuming you use [NVM](https://github.com/creationix/nvm), install and switch (temporarily) to Node.js 6.x:
  ```sh
  nvm install 6
  ```
* Install the emulator globally:
  ```sh
  yarn global add @google-cloud/functions-emulator
  ```

### Test

* Sample command:
  ```
  export TIMESTAMP=$(date +%s%3N)
  yarn do metrics_server/test '{"serverId":"12345","startUtcMs":'$TIMESTAMP',"endUtcMs":'$(($TIMESTAMP+1))',"userReports":[{"userId":"1","bytesTransferred":60,"countries":["US","NL"]},{"userId":"2","bytesTransferred":100,"countries":["UK"]}]}'
  ```
* You can then view this inserted data at https://bigquery.cloud.google.com/table/uproxysite:uproxy_metrics_test.connections_v1, e.g.:
  ```sql
  SELECT * FROM [uproxysite:uproxy_metrics_test.connections_v1] ORDER BY endTimestamp DESC LIMIT 10;
  ```

**Note: The emulator ignores the response code: if the function returns 400 or 500, the command will appear to run successfully!**

### Troubleshooting

* If you run into errors like `could not load the default credentials`, try this command:
  ```sh
  gcloud auth application-default login
  ```
* Many errors can be "fixed" by clearing the emulator's config, e.g.:
  * `functions clear`
  * kill any running server, e.g. `pkill -f functions`
  * clear `~/.config/configstore/@google-cloud`
