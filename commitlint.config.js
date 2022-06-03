module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'devtools',
        'devtools/build',
        'docs',
        'manager',
        'manager/electron',
        'manager/web',
        'metrics_server',
        'sentry_webhook',
        'server',
      ],
    ],
  },
};
