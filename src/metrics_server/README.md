# Outline Metrics Server

The Outline Metrics Server is a [Google App Engine](https://cloud.google.com/appengine) project that writes feature and connections metrics to BigQuery, as reported by opted-in Outline servers.

## API

### Endpoints

The metrics server deploys two services: `dev`, used for development testing and debugging; and `prod`, used for production metrics. The `dev` environment is deployed to `https://dev.metrics.getoutline.org`; the `prod` environment is deployed to `https://prod.metrics.getoutline.org`. Each environment posts metrics to its own BigQuery dataset (see `config_[dev|prod].json`).

### URLs

The metrics server supports two URL paths:

- `POST /connections`: report server data usage broken down by user.

  ```
  {
    serverId: string,
    startUtcMs: number,
    endUtcMs: number,
    userReports: [{
        countries: string[],
        asn: number,
        bytesTransferred: number,
        tunnelTimeSec: number,
    }]
  }
  ```

- `POST /features`: report feature usage.

  ```
  {
      serverId: string,
      serverVersion: string,
      timestampUtcMs: number,
      dataLimit: {
          enabled: boolean
          perKeyLimitCount: number
      }
  }
  ```

## Requirements

- [Google Cloud SDK](https://cloud.google.com/sdk/)

## Build

```sh
task metrics_server:build
```

## Run

Run a local development metrics server:

```sh
task metrics_server:start
```

## Deploy

- Authenticate with `gcloud`:
  ```sh
  gcloud auth login
  ```
- To deploy to dev:
  ```sh
  task metrics_server:deploy:dev
  ```
- To deploy to prod:
  ```sh
  task metrics_server:deploy:prod
  ```
  Once deployed, you will need to manually migrate all traffic to the new version via the Google Cloud console.

## Test

- Unit test
  ```sh
  task metrics_server:test
  ```
- Integration test
  ```sh
  task metrics_server:integration_test
  ```
