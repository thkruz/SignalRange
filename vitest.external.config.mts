import { defineConfig } from 'vitest/config';
import baseConfig from './vitest.config.mts';

/**
 * Vitest config for EXTERNAL plugin tests. The main config excludes
 * src/plugins-external/** from the host suite (third-party tests run in their
 * own repos); `pnpm run plugin -- test <name>` uses this config to run one
 * plugin's tests with the same jsdom env, aliases, and setup, scoped to that
 * folder. Coverage thresholds are the host's concern, not the plugin's.
 *
 * Spread, not mergeConfig: mergeConfig concatenates arrays, which would keep
 * the base exclude of src/plugins-external and leave nothing to run.
 */
export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['src/plugins-external/**/?(*.)+(test|spec).?(m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', 'dist/**'],
    coverage: { enabled: false },
  },
});
