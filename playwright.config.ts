import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.LL_PORT ?? 4173);
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off', screenshot: 'off', acceptDownloads: true },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: { command: `node scripts/serve.mjs ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: true, timeout: 30_000 },
});
