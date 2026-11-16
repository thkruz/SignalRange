import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentState, scenarioData } = vi.hoisted(() => ({
  getCurrentState: vi.fn(),
  scenarioData: { id: 'scn-1' },
}));

vi.mock('@app/sync/storage', () => ({ syncManager: { getCurrentState } }));
vi.mock('@app/scenario-manager', () => ({ ScenarioManager: { getInstance: () => ({ data: scenarioData }) } }));
vi.mock('@app/campaigns/campaign-manager', () => ({ CampaignManager: { getInstance: () => ({ getCampaignForScenario: () => ({ id: 'camp-1' }) }) } }));

import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { burstAdvance, captureCheckpoint, installTestHook } from '@app/testing/sr-test-hook';
import { ReplaySession } from '@app/user-account/replay-session';

const state = {
  objectiveStates: [
    { isCompleted: true, objective: { id: 'a' } },
    { isCompleted: false, objective: { id: 'b' } },
  ],
};

describe('sr-test-hook', () => {
  const nodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    getCurrentState.mockReturnValue(state);
    ReplaySession.end();
    delete window.__srTest;
    delete window.__SR_START_CHECKPOINT__;
  });

  afterEach(() => {
    process.env.NODE_ENV = nodeEnv;
    ReplaySession.end();
  });

  it('captureCheckpoint returns a detached copy with scenario, campaign and completed ids', () => {
    const cp = captureCheckpoint();

    expect(cp.scenarioId).toBe('scn-1');
    expect(cp.campaignId).toBe('camp-1');
    expect(cp.completedObjectiveIds).toEqual(['a']);
    expect(cp.state).toEqual(state);
    expect(cp.state).not.toBe(state);
  });

  it('installs window.__srTest and starts a replay from window.__SR_START_CHECKPOINT__ in development', () => {
    process.env.NODE_ENV = 'development';
    window.__SR_START_CHECKPOINT__ = { scenarioId: 'scn-1', state: state as never };
    installTestHook();

    expect(window.__srTest?.captureCheckpoint).toBeTypeOf('function');
    expect(ReplaySession.checkpointFor('scn-1')?.state).toBe(state);
    expect(ReplaySession.checkpointFor('other')).toBeNull();
  });

  it('does not start a replay when no checkpoint was supplied', () => {
    process.env.NODE_ENV = 'development';
    installTestHook();

    expect(window.__srTest).toBeDefined();
    expect(ReplaySession.isActive()).toBe(false);
  });

  it('is inert outside development builds', () => {
    process.env.NODE_ENV = 'production';
    window.__SR_START_CHECKPOINT__ = { scenarioId: 'scn-1', state: state as never };
    installTestHook();

    expect(window.__srTest).toBeUndefined();
    expect(ReplaySession.isActive()).toBe(false);
  });

  describe('advance', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      SimClock.reset();
    });

    function stubSim(): { advance: ReturnType<typeof vi.fn> } {
      SimClock.reset();
      const sim = {
        advance: vi.fn((frameMs: number) => {
          const steps = SimClock.consumeFrame(frameMs);
          for (let i = 0; i < steps; i++) SimClock.step();
        }),
      };
      vi.spyOn(SimulationManager, 'hasInstance').mockReturnValue(true);
      vi.spyOn(SimulationManager, 'getInstance').mockReturnValue(sim as never);
      return sim;
    }

    it('is exposed on window.__srTest', () => {
      process.env.NODE_ENV = 'development';
      installTestHook();
      expect(window.__srTest?.advance).toBe(burstAdvance);
    });

    it('advances the requested sim time and reports it', async () => {
      stubSim();
      const advanced = await burstAdvance(2000);
      expect(advanced).toBeGreaterThanOrEqual(2000);
      expect(advanced).toBeLessThan(2000 + 20 * 250);
    });

    it('returns early without spinning when the sim cannot step', async () => {
      const sim = stubSim();
      SimClock.pause('menu');
      expect(await burstAdvance(5000)).toBe(0);
      expect(sim.advance).not.toHaveBeenCalled();
    });

    it('returns 0 for no time or no simulation', async () => {
      expect(await burstAdvance(0)).toBe(0);
      vi.spyOn(SimulationManager, 'hasInstance').mockReturnValue(false);
      expect(await burstAdvance(1000)).toBe(0);
    });
  });
});
