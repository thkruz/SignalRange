// One-shot development-mode build for static e2e serving (see scripts/e2e/serve-dist.mjs).
// E2E_DIST picks another output dir (a second bundle built with different PUBLIC_* flags, e.g. the feedback form).
// Same defines as `pnpm dev` (NODE_ENV=development keeps __AUTHORING__ and DEVELOPER hooks), no dev server/HMR.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../rspack.config.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DIST = process.env.E2E_DIST || 'dist-e2e';
// The e2e build empties its output dir (output.clean), so only the e2e dirs are allowed.
if (!/^dist-e2e(?:-[\w.-]+)?$/u.test(DIST)) throw new Error(`E2E_DIST must be dist-e2e or dist-e2e-<name>, got "${DIST}"`);

const config = {
  ...base,
  output: { ...(base as any).output, path: path.resolve(root, DIST) },
  // Cheapest map that still gives readable stacks.
  devtool: 'eval-cheap-module-source-map',
  devServer: undefined,
};

export default config;
