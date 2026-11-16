import { existsSync, readFileSync } from 'node:fs';

/**
 * What the served bundle was built with. In static mode (E2E_STATIC=1) the e2e build writes
 * `<dist>/e2e-build-flags.json` (booleans only); a missing file (bundle built before the stamp existed)
 * reads as all false. In dev-server mode the dev server is built from this shell's env, so the env is the truth.
 */
export interface BuildFlags {
  embedLicence: boolean;
  feedbackEdgeLive: boolean;
  supabaseLocal: boolean;
  userApiLocal: boolean;
}

const STATIC = process.env.E2E_STATIC === '1';
const DIST = process.env.E2E_DIST || 'dist-e2e';

export const bundleFlags = (): BuildFlags => {
  if (!STATIC) {
    return {
      embedLicence: Boolean(process.env.KT_EMBED_LICENSE),
      feedbackEdgeLive: process.env.PUBLIC_FEEDBACK_EDGE_LIVE === 'true',
      supabaseLocal: process.env.PUBLIC_SUPABASE_URL === 'http://127.0.0.1:54321',
      userApiLocal: process.env.PUBLIC_USER_API_URL === 'http://127.0.0.1:54322',
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
