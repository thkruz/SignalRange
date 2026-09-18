import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Build-time flags from rspack DefinePlugin. Tests always run as the OSS edition.
  define: {
    __IS_PRIVATE__: 'false',
    __AUTHORING__: 'false',
  },
  test: {
    /*
     * Cap fork concurrency. The default (one fork per logical core) makes the
     * initial worker burst exceed what Windows will commit on a many-core box,
     * and forks die semi-randomly with "Zone Allocation failed - process out of
     * memory", which would fail the pre-push run. 12 forks bounds peak memory;
     * CI runners (2-4 cores) are unaffected. (keeptrack-space 0a878970)
     */
    maxWorkers: Math.min(12, Math.max(1, os.availableParallelism() - 1)),
    globals: true,
    environment: 'jsdom',
    include: ['**/test/**/*.(spec|test).ts?(x)', '**/test/**/*.(spec|test).js?(x)'],
    // External plugin tests belong to their own repos; `pnpm run plugin -- test <name>`
    // runs them through vitest.external.config.mts.
    exclude: ['node_modules/', 'dist/', 'src/engine/', 'e2e/', 'src/plugins-external/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      // Measure the app, not the harness. Without an explicit include, v8 only
      // reports files a test happened to import, which flatters the numbers.
      include: ['src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        'dist/**',
        'test/**',
        'e2e/**',
        // Vendored engine and its bundled ootk copy are not ours to cover.
        'src/engine/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        // Private submodule has its own repo and its own tests.
        'src/private/**',
        // Installed external plugins are third-party code with their own tests.
        'src/plugins-external/**',
      ],
      // Keep the report when the run fails, so a red suite still shows what it
      // did and did not reach.
      reportOnFailure: true,
      /*
       * Baselined 2026-09-12 against actuals of statements 72.94 / branches
       * 59.81 / functions 73.61 / lines 73.96, set just below each so normal
       * variation does not trip the gate. This is a ratchet: raise it as
       * coverage climbs, never lower it to make a run pass.
       */
      thresholds: {
        statements: 72,
        branches: 59,
        functions: 73,
        lines: 73,
      },
    },
    setupFiles: ['./vitest.setup.ts'],
    // `deps.inline` for uuid and ootk was a pre-vitest-1 workaround. Verified
    // unnecessary on vitest 4 (full suite green without it), so it is gone
    // rather than moved to its modern `server.deps.inline` spelling.
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './src/engine'),
      '@private': path.resolve(__dirname, './src/private/app'),
      '@plugins-external': path.resolve(__dirname, './src/plugins-external'),
    },
  },
});
