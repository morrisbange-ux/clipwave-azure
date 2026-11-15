const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/', 'coverage/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  { files: ['public/**/*.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } } },
  { files: ['tests/**/*.js'], languageOptions: { globals: { ...globals.jest } } },
  { files: ['load/**/*.js'], languageOptions: { sourceType: 'module', globals: { __ENV: 'readonly' } } },
];
