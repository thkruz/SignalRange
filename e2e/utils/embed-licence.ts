import { existsSync } from 'node:fs';

/**
 * The KeepTrack embed only renders when the bundle was built with `KT_EMBED_LICENSE` set
 * (the licence is a build-time constant; without it the app falls back to GeoMap and
 * `#gt-embed-anchor` / `#kt-embed-host` never exist). Specs that need the embed skip on
 * this condition. To run them: export KT_EMBED_LICENSE, rebuild with `E2E_REBUILD=1`, run.
 */
export const EMBED_SKIP_REASON = 'KeepTrack embed needs a licensed build: set KT_EMBED_LICENSE (build time and in this shell)';

export const embedAvailable = (): boolean => existsSync('public/keeptrack/index.html') && Boolean(process.env.KT_EMBED_LICENSE);
