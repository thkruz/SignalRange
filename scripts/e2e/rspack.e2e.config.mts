// One-shot development-mode build for static e2e serving (see scripts/e2e/serve-dist.mjs).
// E2E_DIST picks another output dir (a second bundle built with different PUBLIC_* flags, e.g. the feedback form).
// Same defines as `pnpm dev` (NODE_ENV=development keeps __AUTHORING__ and DEVELOPER hooks), no dev server/HMR.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../rspack.config.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const config = {
  ...base,
  output: { ...(base as any).output, path: path.resolve(root, process.env.E2E_DIST || 'dist-e2e') },
  // Cheapest map that still gives readable stacks.
  devtool: 'eval-cheap-module-source-map',
  devServer: undefined,
};

export default config;
