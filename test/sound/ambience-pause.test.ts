import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMenuPause } from '../../src/game-menu/menu-pause';
import { Ambience } from '../../src/sound/ambience';

vi.mock('@app/sound/sound-manager', () => ({ default: { getInstance: () => ({ setMenuPaused: vi.fn() }) } }));

const contexts: ContextStub[] = [];
class ContextStub {
  state = 'running';
  currentTime = 42;
  destination = {};
  sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  suspend = vi.fn(async () => {
    this.state = 'suspended';
  });
  resume = vi.fn(async () => {
    this.state = 'running';
  });
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  decodeAudioData = vi.fn(async () => ({ duration: 30 }));
  constructor() {
    contexts.push(this);
  }
  createGain() {
    return {
      gain: { value: 1, setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
      connect() {
        return this;
      },
    };
  }
  createBufferSource() {
    const source = { buffer: null, loop: false, start: vi.fn(), stop: vi.fn(), connect: (gain: unknown) => gain };
    this.sources.push(source);
    return source;
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  contexts.length = 0;
  vi.stubGlobal('AudioContext', ContextStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
  );
});
afterEach(() => {
  setMenuPause('game-menu', false);
  setMenuPause('profile', false);
  Ambience.destroy();
  vi.runOnlyPendingTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ambience pause', () => {
  it('suspends loops, ignores menu input, and resumes only after every menu hold is released', async () => {
    Ambience.getInstance().start();
    await vi.waitFor(() => expect(contexts[0].sources).toHaveLength(1));
    const ctx = contexts[0];
    setMenuPause('game-menu', true);
    expect(ctx.state).toBe('suspended');
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(ctx.resume).not.toHaveBeenCalled();
    setMenuPause('profile', true);
    setMenuPause('game-menu', false);
    expect(ctx.state).toBe('suspended');
    setMenuPause('profile', false);
    expect(ctx.state).toBe('running');
    expect(ctx.currentTime).toBe(42);
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].start).toHaveBeenCalledTimes(1);
  });

  it('keeps late-loading layers silent and prevents thunder while paused', async () => {
    setMenuPause('game-menu', true);
    const ambience = Ambience.getInstance();
    ambience.start();
    ambience.setLayer('storm', 1);
    await vi.waitFor(() => expect(contexts[0].sources).toHaveLength(2));
    expect(contexts[0].state).toBe('suspended');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    setMenuPause('game-menu', false);
    expect(contexts[0].state).toBe('running');
    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetch).toHaveBeenCalledWith('/sfx/thunder-indoor.mp3');
  });
});
