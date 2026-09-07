import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: env.baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },

  // Folder where Playwright saves traces/screenshots/videos for each test
  outputDir: 'test-results',

  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: env.browserChannel, // uses the real Chrome installed on the system
        headless: env.headless,
      },
    },
  ],
});
