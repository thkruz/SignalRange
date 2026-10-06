import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.mts';

/**
 * Vitest config for the phase 19.1 calibration snapshot: flies every scenario
 * headlessly and writes the ledger to test/calibration/. Not part of the unit
 * suite (it is minutes, not seconds). Run it with
 *
 *   npx vitest run --config vitest.calibration.config.mts
 *
 * then `node scripts/calibration/diff.mjs` to compare against the committed
 * ledger. It reuses the unit suite's jsdom env, aliases and setup.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['scripts/calibration/*.calibration.ts'],
    exclude: ['**/node_modules/**', 'dist/**'],
    coverage: { enabled: false },
    testTimeout: 30 * 60_000,
    maxWorkers: 1,
  },
});
