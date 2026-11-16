import { afterEach, describe, expect, it, vi } from 'vitest';
import { SelectionProgressCache } from '../../src/user-account/selection-progress-cache';
import type { ScenariosProgressResponse } from '../../src/user-account/types';

const progress = (id: string) => ({ scenarios: [{ scenarioId: id }] }) as ScenariosProgressResponse;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((answer) => {
    resolve = answer;
  });
  return { promise, resolve };
};
afterEach(() => vi.restoreAllMocks());

describe('shared selection progress', () => {
  it('shares the downloaded checkpoint with mission loading and discards it on account changes', async () => {
    const saved = { scenarioId: 'one', state: {}, savedAt: '2026-11-07' } as any;
    const source = { getAllScenariosProgress: vi.fn(), checkpointExists: vi.fn(), getCheckpoint: vi.fn(async () => saved) };
    const cache = new SelectionProgressCache(async () => source);
    cache.setAccount('a');
    const [preview, mission] = await Promise.all([cache.getSavedCheckpoint('one'), cache.getSavedCheckpoint('one')]);
    expect(preview).toBe(mission);
    expect(source.getCheckpoint).toHaveBeenCalledOnce();
    cache.setAccount(null);
    expect(await cache.getSavedCheckpoint('one')).toBeNull();
    cache.setAccount('b');
    await cache.getSavedCheckpoint('one');
    expect(source.getCheckpoint).toHaveBeenCalledTimes(2);
  });
  it('reuses in-flight prefetch and cached progress/checkpoints between menus', async () => {
    const answer = deferred<ScenariosProgressResponse>();
    const source = { getAllScenariosProgress: vi.fn(() => answer.promise), checkpointExists: vi.fn(async () => false) };
    const cache = new SelectionProgressCache(async () => source);
    cache.setAccount('player-a');
    const prefetch = cache.prefetch(['one', 'two']);
    const missionProgress = cache.getProgress();
    const missionCheckpoint = cache.getCheckpoint('one');
    answer.resolve(progress('one'));
    await prefetch;
    await expect(missionProgress).resolves.toEqual(progress('one'));
    await expect(missionCheckpoint).resolves.toBe(false);
    await cache.prefetch(['one', 'two']);
    expect(source.getAllScenariosProgress).toHaveBeenCalledTimes(1);
    expect(source.checkpointExists).toHaveBeenCalledTimes(2);
  });

  it('returns stale data immediately and refreshes it in the background', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100);
    const refresh = deferred<ScenariosProgressResponse>();
    const source = { getAllScenariosProgress: vi.fn().mockResolvedValueOnce(progress('old')).mockReturnValue(refresh.promise), checkpointExists: vi.fn() };
    const cache = new SelectionProgressCache(async () => source, 1000);
    await cache.getProgress();
    now.mockReturnValue(1200);
    await expect(cache.getProgress()).resolves.toEqual(progress('old'));
    await expect(cache.getProgress()).resolves.toEqual(progress('old'));
    expect(source.getAllScenariosProgress).toHaveBeenCalledTimes(2);
    refresh.resolve(progress('new'));
    await vi.waitFor(async () => expect(await cache.getProgress()).toEqual(progress('new')));
  });

  it('discards a previous account response and makes no guest requests', async () => {
    const old = deferred<ScenariosProgressResponse>();
    const source = { getAllScenariosProgress: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(progress('b')), checkpointExists: vi.fn() };
    const cache = new SelectionProgressCache(async () => source);
    cache.setAccount('player-a');
    const pending = cache.getProgress();
    const rejection = expect(pending).rejects.toThrow('Progress changed');
    await Promise.resolve();
    cache.setAccount(null);
    old.resolve(progress('a'));
    await rejection;
    await expect(cache.getProgress()).resolves.toBeNull();
    await expect(cache.getCheckpoint('one')).resolves.toBe(false);
    cache.setAccount('player-b');
    await expect(cache.getProgress()).resolves.toEqual(progress('b'));
    expect(source.getAllScenariosProgress).toHaveBeenCalledTimes(2);
    expect(source.checkpointExists).not.toHaveBeenCalled();
  });

  it('invalidates progress and checkpoint availability after writes', async () => {
    const source = { getAllScenariosProgress: vi.fn(async () => progress('one')), checkpointExists: vi.fn(async () => true) };
    const cache = new SelectionProgressCache(async () => source);
    await cache.prefetch(['one']);
    cache.invalidate();
    await cache.prefetch(['one']);
    expect(source.getAllScenariosProgress).toHaveBeenCalledTimes(2);
    expect(source.checkpointExists).toHaveBeenCalledTimes(2);
  });

  it('allows retry after a failed initial request', async () => {
    const source = { getAllScenariosProgress: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(progress('one')), checkpointExists: vi.fn() };
    const cache = new SelectionProgressCache(async () => source);
    await expect(cache.getProgress()).rejects.toThrow('offline');
    await expect(cache.getProgress()).resolves.toEqual(progress('one'));
  });
});
