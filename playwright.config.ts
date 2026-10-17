import { defineConfig } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, fullyParallel: false, workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', grep: /@smoke/, use: { browserName: 'firefox' } },
    ...(process.env.PLAYWRIGHT_WEBKIT === '1' ? [{ name: 'webkit', grep: /@smoke/, use: { browserName: 'webkit' as const } }] : []),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'npm run dev -- --strictPort', url: baseURL, reuseExistingServer: !process.env.CI },
});
