import { defineConfig } from '@playwright/test';

/**
 * Perf-only config (Phase 3, P3-WP0). The main playwright.config.ts uses the
 * default testMatch (*.spec.ts / *.test.ts), so `*.perf.ts` never runs in CI.
 * Run: SR_DEV_PORT=3200 pnpm dev   then
 *      PERF_N=1000 pnpm exec playwright test -c e2e/perf/playwright.perf.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: '*.perf.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60 * 1000,
  reporter: [['list']],
});
