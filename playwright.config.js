// @ts-check
const { defineConfig } = require('@playwright/test');

const external = process.env.BASE_URL;
const port = Number(process.env.E2E_PORT || 3100);

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external || `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: external ? undefined : {
    command: 'node src/server.js',
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(port), LOCAL_UPLOAD_DIR: 'test-results/uploads', AUTH_RATE_LIMIT: '1000' },
  },
});
