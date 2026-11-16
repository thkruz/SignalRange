import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'dotenv';

/**
 * What the served bundle was built with. In static mode (E2E_STATIC=1) the e2e build writes
 * `<dist>/e2e-build-flags.json` (booleans only); a missing file (bundle built before the stamp existed)
 * reads as all false. In dev-server mode the dev server is built from this shell's env plus the env files that
 * rspack.config.mts loads, so `devServerEnv` reproduces that: process.env wins, then `.env`, then `.env.production`.
 */
export interface BuildFlags {
  embedLicence: boolean;
  feedbackEdgeLive: boolean;
  supabaseLocal: boolean;
  userApiLocal: boolean;
}

const STATIC = process.env.E2E_STATIC === '1';
const DIST = process.env.E2E_DIST || 'dist-e2e';

const readEnvFile = (file: string): Record<string, string> => {
  if (!existsSync(file)) return {};
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
};

/**
 * The env the dev server's rspack config sees. rspack.config.mts calls dotenv (which never overrides an
 * existing variable) for `.env` first (development only; `pnpm run dev` sets NODE_ENV=development) and then
 * `.env.production`, so the first source to define a key wins: process.env, `.env`, `.env.production`.
 */
export const devServerEnv = (base: NodeJS.ProcessEnv = process.env, cwd = '.'): Record<string, string | undefined> => ({
  ...readEnvFile(`${cwd}/.env.production`),
  ...readEnvFile(`${cwd}/.env`),
  ...base,
});

export const bundleFlags = (): BuildFlags => {
  if (!STATIC) {
    const env = devServerEnv();
    return {
      embedLicence: Boolean(env.KT_EMBED_LICENSE),
      feedbackEdgeLive: env.PUBLIC_FEEDBACK_EDGE_LIVE === 'true',
      supabaseLocal: env.PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321',
      userApiLocal: env.PUBLIC_USER_API_URL === 'http://127.0.0.1:54322',
    };
  }
  const file = `${DIST}/e2e-build-flags.json`;
  const none: BuildFlags = { embedLicence: false, feedbackEdgeLive: false, supabaseLocal: false, userApiLocal: false };
  if (!existsSync(file)) return none;
  try {
    return { ...none, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<BuildFlags>) };
  } catch {
    return none;
  }
};
