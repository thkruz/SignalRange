// One-shot development-mode build for static e2e serving (see scripts/e2e/serve-dist.mjs).
// E2E_DIST picks another output dir (a second bundle built with different PUBLIC_* flags, e.g. the feedback form).
// Same defines as `pnpm dev` (NODE_ENV=development keeps __AUTHORING__ and DEVELOPER hooks), no dev server/HMR.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../../rspack.config.mts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const DIST = process.env.E2E_DIST || 'dist-e2e';
// The e2e build empties its output dir (output.clean), so only the e2e dirs are allowed.
if (!/^dist-e2e(?:-[\w.-]+)?$/u.test(DIST)) throw new Error(`E2E_DIST must be dist-e2e or dist-e2e-<name>, got "${DIST}"`);

// Stamp of what this bundle was built with, booleans only (never the values). Specs that need a licensed or
// feedback-enabled bundle read it in static mode (e2e/utils/build-flags.ts). process.env here already includes
// the .env / .env.production values the base config loaded, so it matches what DefinePlugin bakes in.
const stampBuildFlags = {
  apply(compiler: { hooks: { afterEmit: { tap: (name: string, fn: () => void) => void } } }) {
    compiler.hooks.afterEmit.tap('e2e-build-flags', () => {
      const flags = {
        embedLicence: Boolean(process.env.KT_EMBED_LICENSE),
        feedbackEdgeLive: process.env.PUBLIC_FEEDBACK_EDGE_LIVE === 'true',
        supabaseLocal: process.env.PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321',
        userApiLocal: process.env.PUBLIC_USER_API_URL === 'http://127.0.0.1:54322',
      };
      const dir = path.resolve(root, DIST);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'e2e-build-flags.json'), `${JSON.stringify(flags, null, 2)}
`);
    });
  },
};

const config = {
  ...base,
  output: { ...(base as any).output, path: path.resolve(root, DIST) },
  // Cheapest map that still gives readable stacks.
  devtool: 'eval-cheap-module-source-map',
  devServer: undefined,
  plugins: [...((base as any).plugins ?? []), stampBuildFlags],
};

export default config;
