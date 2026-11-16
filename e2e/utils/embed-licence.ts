import { existsSync } from 'node:fs';
import { bundleFlags } from './build-flags';

/**
 * The KeepTrack embed only renders when the bundle was built with `KT_EMBED_LICENSE` set
 * (the licence is a build-time constant; without it the app falls back to GeoMap and
 * `#gt-embed-anchor` / `#kt-embed-host` never exist). Specs that need the embed skip on
 * this condition. Static mode reads the build stamp of the served bundle (see build-flags.ts); dev-server
 * mode reads this shell's env. To run them: export KT_EMBED_LICENSE (or put it in .env), fetch public/keeptrack,
 * rebuild with `E2E_REBUILD=1`, run.
 */
export const EMBED_SKIP_REASON =
  'KeepTrack embed needs public/keeptrack/index.html and a bundle built with KT_EMBED_LICENSE set: provide both, then rebuild with E2E_REBUILD=1 (static mode checks <dist>/e2e-build-flags.json, dev-server mode checks the KT_EMBED_LICENSE env)';

export const embedAvailable = (): boolean => existsSync('public/keeptrack/index.html') && bundleFlags().embedLicence;
