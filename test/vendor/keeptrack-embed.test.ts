import { createKeepTrackEmbed, EMBED_API_VERSION, EmbedError } from '@app/vendor/keeptrack-embed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import lock from '../../keeptrack-embed.lock.json';

/** SignalRange's own SPA shell, which the Workers SPA fallback serves for an unknown /keeptrack/... path. */
const SPA_SHELL = '<!doctype html><html><head><title>SignalRange</title></head><body><div id="app"></div></body></html>';

describe('vendored KeepTrack embed SDK', () => {
  beforeEach(() => {
    // jsdom has no WebGL2; the SDK checks for it before it checks the page.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as unknown as RenderingContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('matches the API version pinned in keeptrack-embed.lock.json', () => {
    expect(EMBED_API_VERSION).toBe(lock.apiVersion);
  });

  it('turns an SPA-fallback response into an ASSETS_MISSING boot error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(SPA_SHELL, { status: 200 }));

    const err = await createKeepTrackEmbed({ container: document.createElement('div'), src: '/keeptrack/index.html' }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmbedError);
    expect((err as EmbedError).code).toBe('ASSETS_MISSING');
    expect((err as EmbedError).message).toContain('not a KeepTrack page');
  });
});
