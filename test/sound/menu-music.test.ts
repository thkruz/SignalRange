import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPreferences } from '../../src/sound/audio-preferences';
import { MenuMusic } from '../../src/sound/menu-music';

const contexts: ContextStub[] = [];
class ContextStub {
  state = 'suspended';
  currentTime = 0;
  destination = {};
  gain = { value: 0, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
  sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; loop: boolean }[] = [];
  constructor() {
    contexts.push(this);
  }
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  decodeAudioData = vi.fn(async () => ({ duration: 68 }));
  createGain() {
    return { gain: this.gain, connect: vi.fn() };
  }
  createBufferSource() {
    const source = { buffer: null, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    this.sources.push(source);
    return source;
  }
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
beforeEach(() => {
  vi.useFakeTimers();
  contexts.length = 0;
  localStorage.clear();
  AudioPreferences.destroy();
  vi.stubGlobal('AudioContext', ContextStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
  );
});
afterEach(() => {
  MenuMusic.destroy();
  AudioPreferences.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('menu music', () => {
  it('reuses a single gapless source across menu and mission transitions', async () => {
    const music = MenuMusic.getInstance();
    music.setActive(true);
    music.setActive(true);
    await flush();
    const ctx = contexts[0];
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].loop).toBe(true);
    expect(ctx.gain.setValueAtTime).toHaveBeenLastCalledWith(0.45 * AudioPreferences.getInstance().volume('music'), 0);
    expect(ctx.gain.linearRampToValueAtTime).not.toHaveBeenCalled();
    music.setActive(false);
    expect(ctx.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 2.5);
    await vi.advanceTimersByTimeAsync(2600);
    expect(ctx.state).toBe('suspended');
    music.setActive(true);
    await flush();
    expect(ctx.state).toBe('running');
    expect(ctx.sources).toHaveLength(1);
  });
  it('cancels an old fade-out suspension when returning quickly', async () => {
    const music = MenuMusic.getInstance();
    music.setActive(true);
    await flush();
    music.setActive(false);
    music.setActive(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(contexts[0].state).toBe('running');
  });
  it('persists an independent music volume and honors master mute', async () => {
    AudioPreferences.getInstance().set({ masterVolume: 0 });
    MenuMusic.getInstance().setActive(true);
    expect(contexts).toHaveLength(0);
    AudioPreferences.getInstance().set({ masterVolume: 0.5, musicVolume: 0.4, sfx: false, ambience: false });
    await flush();
    expect(contexts[0].gain.setValueAtTime.mock.lastCall?.[0]).toBeCloseTo(0.09);
    AudioPreferences.destroy();
    expect(AudioPreferences.getInstance().prefs.musicVolume).toBe(0.4);
  });
  it('does not resume a mission soundtrack after the tab becomes visible', async () => {
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const music = MenuMusic.getInstance();
    music.setActive(true);
    await flush();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(contexts[0].state).toBe('suspended');
    music.setActive(false);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(contexts[0].state).toBe('suspended');
  });
  it('does not start a late download after disposal', async () => {
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    MenuMusic.getInstance().setActive(true);
    MenuMusic.destroy();
    finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as Response);
    await flush();
    expect(contexts[0].sources).toHaveLength(0);
    expect(contexts[0].close).toHaveBeenCalledOnce();
  });
});
