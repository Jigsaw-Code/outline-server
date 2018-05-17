# Outline Metrics Server

The Outline Metrics Server is built using [Google Cloud Functions](https://cloud.google.com/functions/), which lets us write a simple Node HTTP server.  By deploying this server to the uproxysite Google project, we gain permission to write to uproxysite's BigQuery tables.

## Requirements
* Install `gcloud` from https://cloud.google.com/sdk/docs/
* Node 6.11.1 or greater (for testing via Cloud Functions Emulator)

## Building
Run `yarn do metrics_server/build`

## Deploying
You must have access to the project `uproxysite`.

To deploy:
* Authenticate with gcloud: `gcloud auth login`
* Run the deploy script:
  * to deploy to test: `yarn do metrics_server/deploy_test`
  * to deploy to prod: `yarn do metrics_server/deploy_prod`

## Testing with the Cloud Functions Emulator
You can test with the Google Cloud Functions Emulator by running `yarn do metrics_server/test <test_data>`, e.g.:
```
yarn do metrics_server/test '{"serverId":"12345","startUtcMs":1502486354823,"endUtcMs":1502499314823,"userReports":[{"userId":"1","bytesTransferred":60,"countries":["US","NL"]},{"userId":"2","bytesTransferred":100,"countries":["UK"]}]}'
```

## Testing with Node
You can test the metrics server code using Node:

`cd build/metrics_server`

run `node`, then you can test the post_server_report module as follows:
```
post_server_report = require('./post_server_report.js');

serverReport = {
  serverId: "123",
  startUtcMs: 1502486354823,
  endUtcMs: 1502499314823,
  userReports: [
    {userId: "1", bytesTransferred: 60, countries: ["US", "NL"]},
    {userId: "2", bytesTransferred: 100, countries: ["CN"]}
  ]
}

post_server_report.postServerReport('uproxy_metrics_test', 'connections_v1', serverReport)
  .then(() => { console.log('success') })
  .catch((e) => { console.error('failure: ' + e) })
```

You can then view this inserted data at https://bigquery.cloud.google.com/table/uproxysite:uproxy_metrics_test.connections_v1
