import { defineConfig, devices } from '@playwright/test';

// SR_DEV_PORT lets a second worktree run its own dev server and specs beside the main tree's :3000.
const BASE_URL = `http://127.0.0.1:${process.env.SR_DEV_PORT || '3000'}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    // 127.0.0.1 (not localhost) so another dev server bound to IPv6 ::1:3000
    // cannot shadow the rspack server, which binds the IPv4/dual stack.
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
