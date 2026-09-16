import { defineConfig, devices } from '@playwright/test';
import { env } from './config/env';

export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap concurrency to 2 workers: running more of the heavier lot-block files side by side was
  // slowing each one down enough to skew timing comparisons. Extra tests queue and start as soon
  // as a worker frees up.
  workers: 2,
  reporter: [['html', { open: 'never' }], ['list'], ['./utils/testRunReporter.ts']],

  use: {
    baseURL: env.baseUrl,
    colorScheme: 'dark',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },

  // Folder where Playwright saves traces/screenshots/videos for each test
  outputDir: 'test-results',

  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: env.browserChannel, // uses the real Chrome installed on the system
        headless: env.headless,
      },
    },
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: env.browserChannel, // uses the real Chrome installed on the system
        headless: env.headless,
      },
      dependencies: ['setup'],
    },
  ],
});
