import { defineConfig } from '@playwright/test';

// Test the deployed Docker build; never start a host Web/Core server.
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: './test-results/results.json' }]],
  outputDir: './test-results',
  use: {
    baseURL: process.env.BROWSER_TEST_BASE_URL || 'http://localhost:8080',
    browserName: 'chromium',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'off', video: 'off', trace: 'off',
  },
});
