import { describe, expect, it, vi } from 'vitest';
import type { CampaignData } from '../../src/campaigns/campaign-types';
import { findContinueMission } from '../../src/game-menu/continue-mission';
import type { Checkpoint, ScenarioProgress } from '../../src/user-account/types';

const campaigns = [{ id: 'one', scenarios: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }] as CampaignData[];
const progress = [
  { scenarioId: 'a', lastPlayed: '2026-11-01', completedAt: '2026-11-01', score: 100 },
  { scenarioId: 'b', lastPlayed: '2026-11-03' },
  { scenarioId: 'c', lastPlayed: '2026-11-02' },
] as ScenarioProgress[];
describe('continue mission', () => {
  it('finds the most recent unfinished checkpoint and falls back when one is missing', async () => {
    const probe = vi.fn(async (id: string) => id === 'c');
    const load = vi.fn(async () => ({ scenarioId: 'c', state: {} }) as Checkpoint);
    const result = await findContinueMission(progress, campaigns, probe, load);
    expect(result?.mission.id).toBe('c');
    expect(probe.mock.calls).toEqual([['b'], ['c']]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('makes no checkpoint requests for unavailable campaigns', async () => {
    const probe = vi.fn();
    expect(await findContinueMission(progress, [], probe, vi.fn())).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });
  it('finds an autosaved checkpoint even when no progress row exists', async () => {
    const saved = { scenarioId: 'b', savedAt: '2026-11-07', state: {} } as Checkpoint;
    const next = await findContinueMission(
      [],
      campaigns,
      async (id) => id === 'b',
      async () => saved
    );
    expect(next?.mission.id).toBe('b');
    expect(next?.checkpoint).toBe(saved);
  });
  it('resumes a replay whose completedAt is retained but score was reset', async () => {
    const replay = [{ ...progress[0], score: 0 }];
    const next = await findContinueMission(
      replay,
      campaigns,
      async (id) => id === 'a',
      async () => ({ state: {}, savedAt: '2026-11-07' }) as Checkpoint
    );
    expect(next?.mission.id).toBe('a');
    expect(next?.checkpoint).not.toBeNull();
  });
  it('uses checkpoint time rather than stale progress dates to select the most recent save', async () => {
    const next = await findContinueMission(
      progress,
      campaigns,
      async () => true,
      async (id) => ({ state: {}, savedAt: id === 'b' ? '2026-11-01' : '2026-11-07' }) as Checkpoint
    );
    expect(next?.mission.id).toBe('c');
  });
  it('offers the next unlocked mission in the most recently played campaign when there is no save', async () => {
    const catalog = [
      ...campaigns,
      { id: 'two', scenarios: [{ id: 'd' }, { id: 'e', prerequisiteScenarioIds: ['d'] }, { id: 'f', prerequisiteScenarioIds: ['e'] }] },
    ] as CampaignData[];
    const latest = [{ scenarioId: 'd', lastPlayed: '2026-11-07', completedAt: '2026-11-07', score: 100 }] as ScenarioProgress[];
    const probe = vi.fn(async () => false);
    const next = await findContinueMission(latest, catalog, probe, vi.fn());
    expect(next?.mission.id).toBe('e');
    expect(next?.checkpoint).toBeNull();
    expect(probe).not.toHaveBeenCalledWith('f');
  });
  it('does not resume a finished checkpoint or a disabled mission', async () => {
    const catalog = [
      {
        id: 'one',
        scenarios: [
          { id: 'a', objectives: [{ id: 'required' }] },
          { id: 'b', isDisabled: true },
        ],
      },
    ] as CampaignData[];
    const saved = { state: { objectiveStates: [{ objective: { id: 'required' }, isCompleted: true }] } } as Checkpoint;
    const probe = vi.fn(async () => true);
    expect(await findContinueMission([], catalog, probe, async () => saved)).toBeNull();
    expect(probe).not.toHaveBeenCalledWith('b');
  });
});
