import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['**/test/**/*.(spec|test).ts?(x)', '**/test/**/*.(spec|test).js?(x)'],
    exclude: ['node_modules/', 'dist/', 'src/engine/', 'e2e/'],
    coverage: {
      provider: 'v8',
      exclude: ['node_modules/', 'dist/', 'src/engine/', 'src/engine/ootk/'],
      reportsDirectory: 'coverage',
    },
    setupFiles: ['./vitest.setup.ts'],
    deps: {
      inline: ['uuid', 'ootk'],
    },
  },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, './src/engine'),
    },
  },
});
