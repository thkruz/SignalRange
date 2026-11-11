import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentState, scenarioData } = vi.hoisted(() => ({
  getCurrentState: vi.fn(),
  scenarioData: { id: 'scn-1' },
}));

vi.mock('@app/sync/storage', () => ({ syncManager: { getCurrentState } }));
vi.mock('@app/scenario-manager', () => ({ ScenarioManager: { getInstance: () => ({ data: scenarioData }) } }));
vi.mock('@app/campaigns/campaign-manager', () => ({ CampaignManager: { getInstance: () => ({ getCampaignForScenario: () => ({ id: 'camp-1' }) }) } }));

import { captureCheckpoint, installTestHook } from '@app/testing/sr-test-hook';
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
});
