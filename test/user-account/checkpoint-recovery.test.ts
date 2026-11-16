import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkpointRecovery } from '../../src/user-account/checkpoint-recovery';
import { SelectionProgressCache } from '../../src/user-account/selection-progress-cache';
import type { Checkpoint } from '../../src/user-account/types';

const saved = (account = 'one', second = 1): Checkpoint => ({
  id: 'mission',
  userId: account,
  appId: 'signalrange',
  scenarioId: 'mission',
  version: '1',
  state: { scenarioTimeRemaining: 90 },
  savedAt: new Date(second * 1000).toISOString(),
  createdAt: '',
  updatedAt: '',
});
beforeEach(() => localStorage.clear());
describe('checkpoint recovery', () => {
  it('prefers a new interruption copy even while the server result is cached', async () => {
    const source = { getAllScenariosProgress: vi.fn(), checkpointExists: vi.fn(), getCheckpoint: vi.fn().mockResolvedValue(saved()) };
    const cache = new SelectionProgressCache(async () => source);
    cache.setAccount('one');
    expect(await cache.getSavedCheckpoint('mission')).toEqual(saved());
    checkpointRecovery.write(saved('one', 3));
    expect(await cache.getSavedCheckpoint('mission')).toEqual(saved('one', 3));
    expect(source.getCheckpoint).toHaveBeenCalledTimes(1);
  });
  it('survives a new cache instance offline and stays isolated by account', async () => {
    checkpointRecovery.write(saved());
    const source = {
      getAllScenariosProgress: vi.fn(),
      checkpointExists: vi.fn().mockRejectedValue(new Error('offline')),
      getCheckpoint: vi.fn().mockRejectedValue(new Error('offline')),
    };
    const cache = new SelectionProgressCache(async () => source);
    cache.setAccount('one');
    expect(await cache.getCheckpoint('mission')).toBe(true);
    expect(await cache.getSavedCheckpoint('mission')).toEqual(saved());
    cache.setAccount('two');
    await expect(cache.getSavedCheckpoint('mission')).rejects.toThrow('offline');
    cache.setAccount(null);
    expect(await cache.getSavedCheckpoint('mission')).toBeNull();
  });
  it('uses the newer checkpoint and does not clear a newer pending save on an old response', () => {
    const first = saved('one', 1);
    const second = saved('one', 2);
    checkpointRecovery.write(first);
    checkpointRecovery.write(second);
    checkpointRecovery.acknowledge(first);
    expect(checkpointRecovery.read('one', 'mission')?.pending).toBe(true);
    expect(checkpointRecovery.newer(first, second)).toEqual(second);
    checkpointRecovery.acknowledge(second);
    expect(checkpointRecovery.read('one', 'mission')?.pending).toBe(false);
    checkpointRecovery.clear('one', 'mission');
    expect(checkpointRecovery.read('one', 'mission')).toBeNull();
  });
});
