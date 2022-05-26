module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'metrics_server',
        'sentry_webhook',
        'server_manager',
        'server_manager/electron_app',
        'server_manager/web_app',
        'shadowbox',
        'devtools',
        'docs',
      ],
    ],
  },
};
