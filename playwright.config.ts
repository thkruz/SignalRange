import { defineConfig, devices } from '@playwright/test';

// SR_DEV_PORT lets a second worktree run its own dev server and specs beside the main tree's :3000.
const BASE_URL = `http://127.0.0.1:${process.env.SR_DEV_PORT || '3000'}`;

// E2E_STATIC=1 serves a prebuilt dev-mode bundle (dist-e2e/) from a zero-dependency static server instead of
// `rspack serve`. It builds only when dist-e2e is missing or E2E_REBUILD=1. See CLAUDE.md "E2E".
const STATIC = process.env.E2E_STATIC === '1';
const PORT = process.env.SR_DEV_PORT || '3000';
const STATIC_COMMAND = `node -e "const fs=require('fs');if(process.env.E2E_REBUILD==='1'||!fs.existsSync('dist-e2e/index.html'))process.exit(require('child_process').spawnSync('pnpm run build:e2e',{stdio:'inherit',shell:true}).status||0)" && node scripts/e2e/serve-dist.mjs --port ${PORT} --dir dist-e2e`;

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
      testIgnore: /gallery\//u,
    },
    // Dev gallery contact-sheet shots: no simulation timing, safe at high worker counts
    // (npx playwright test --project=gallery --workers=4)
    {
      name: 'gallery',
      testMatch: /gallery\/.*\.spec\.ts/u,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
    },
  ],
  webServer: {
    command: STATIC ? STATIC_COMMAND : 'pnpm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: STATIC ? 300000 : 120000,
  },
});
