import { defineConfig } from '@playwright/test';
import path from 'node:path';

const outputDir = process.env.BROWSER_TEST_OUTPUT_DIR || './test-results';
const browsers = (process.env.BROWSER_TEST_BROWSERS || 'chromium').split(',');
if (browsers.some(browser => !['chromium', 'firefox', 'webkit'].includes(browser))) throw new Error('Unsupported browser test project');

// Test the deployed Docker build; never start a host Web/Core server.
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [[process.env.BROWSER_TEST_REPORTER === 'dot' ? 'dot' : 'list'], ['json', { outputFile: path.join(outputDir, 'results.json') }]],
  outputDir,
  preserveOutput: 'never',
  projects: browsers.map(browserName => ({ name: browserName, use: { browserName } })),
  use: {
    baseURL: process.env.BROWSER_TEST_BASE_URL || 'http://localhost:8080',
    viewport: { width: 1600, height: 1000 },
    screenshot: 'off', video: 'off', trace: 'off',
  },
});
