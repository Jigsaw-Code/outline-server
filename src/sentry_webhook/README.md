# Outline Sentry Webhook

The Outline Sentry webhook is a [Google Cloud Function](https://cloud.google.com/functions/) that receives a Sentry event and posts it to Salesforce.

## Requirements

- [Google Cloud SDK](https://cloud.google.com/sdk/)
- Access to Outline's Sentry account.

## Build

```sh
npm run action sentry_webhook/build
```

## Deploy

Authenticate with `gcloud`:

```sh
gcloud auth login
```

To deploy:

```sh
npm run action sentry_webhook/deploy
```

## Configure Sentry Webhooks

- Log in to Outline's [Sentry account](https://sentry.io/outlinevpn/)
- Select a project (outline-client, outline-client-dev, outline-server, outline-server-dev).
  - Note that this process must be repeated for all Sentry projects.
- Enable the WebHooks plugin at `https://sentry.io/settings/outlinevpn/<project>/plugins/`
- Set the webhook endpoint at `https://sentry.io/settings/outlinevpn/<project>/plugins/webhooks/`
- Configure alerts to invoke the webhook at `https://sentry.io/settings/outlinevpn/<project>/alerts/`
- Create rules to trigger the webhook at `https://sentry.io/settings/outlinevpn/<project>/alerts/rules/`
