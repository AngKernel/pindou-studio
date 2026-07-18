import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'local-only.spec.ts',
  fullyParallel: false,
  timeout: 60_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3200',
    url: 'http://127.0.0.1:3200',
    env: { NEXT_PUBLIC_DEPLOYMENT_MODE: 'local-only' },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
