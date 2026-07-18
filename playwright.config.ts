import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const projects: NonNullable<PlaywrightTestConfig['projects']> = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
];

if (process.platform === 'win32') {
  projects.push({
    name: 'msedge',
    use: { ...devices['Desktop Edge'], channel: 'msedge' },
  });
}

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: 'local-only.spec.ts',
  fullyParallel: false,
  timeout: 60_000,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects,
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    env: {
      NEXT_PUBLIC_DEPLOYMENT_MODE: 'cloud',
      NEXT_PUBLIC_BEAD_CLOUD_API_URL: 'http://127.0.0.1:8787',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
