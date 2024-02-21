module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['devtools', 'devtools/build', 'docs', 'metrics_server', 'sentry_webhook', 'server'],
    ],
  },
};
