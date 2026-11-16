/**
 * Phase 35 rt-s24-F4 follow-up: round trips for the managers added to the
 * checkpoint manager states (link budget, fault injector, decisions) and the
 * collector/restore wiring that carries them. Hardware faults, interference
 * and anchors are covered in test/objectives/objective-anchor.test.ts and the
 * nats-eu S8 checkpoint test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { natsEuSandboxData } from '../../src/campaigns/nats-eu/sandbox';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { FaultInjector } from '../../src/faults/fault-injector';
import { LinkBudgetManager } from '../../src/link-budget/link-budget-manager';
import { DecisionManager } from '../../src/modal/decision-manager';
import type { DecisionOption } from '../../src/objectives/objective-types';
import { ScenarioManager } from '../../src/scenario-manager';
import { collectManagerStates, restoreManagerStates } from '../../src/scenarios/checkpoint-manager-states';

const options: DecisionOption[] = [{ label: 'Fault', correctWhen: { fact: 'equipment-fault-active', is: true } }];
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

beforeEach(() => {
  ScenarioManager.getInstance().settings = natsEuSandboxData.settings;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  LinkBudgetManager.destroy();
  DecisionManager.destroy();
  FaultInjector.resetInstance();
  EventBus.destroy();
  vi.restoreAllMocks();
});

describe('LinkBudgetManager checkpoint state', () => {
  it('carries the committed margin and nothing derived', () => {
    const manager = LinkBudgetManager.getInstance();
    manager.commitLink(manager.getConfig()!.thresholdCNRDb + 4.5);
    const saved = roundTrip(manager.getCheckpointState());
    expect(saved.appliedMarginDb).toBeCloseTo(4.5, 9);

    LinkBudgetManager.destroy();
    const fresh = LinkBudgetManager.getInstance();
    expect(fresh.state.appliedMarginDb).toBeNull();
    fresh.restoreCheckpointState(saved);
    expect(fresh.state.appliedMarginDb).toBeCloseTo(4.5, 9);
    fresh.restoreCheckpointState({ appliedMarginDb: Number.NaN });
    expect(fresh.state.appliedMarginDb).toBeNull();
  });
});

describe('FaultInjector checkpoint state', () => {
  it('restores injected faults and resumes the id counter', () => {
    const injector = FaultInjector.getInstance();
    const id = injector.injectTemplate('KEY_EXPIRATION_WARNING', 'GW-01');
    const saved = roundTrip(injector.getCheckpointState());
    expect(saved.faults).toHaveLength(1);
    expect(saved.counter).toBe(1);

    FaultInjector.resetInstance();
    const fresh = FaultInjector.getInstance();
    expect(fresh.isActive(id)).toBe(false);
    fresh.restoreCheckpointState(saved);
    expect(fresh.isActive(id)).toBe(true);
    expect(fresh.getActiveFaults('GW-01')).toHaveLength(1);
    // The next template fault gets a fresh id, not a collision
    expect(fresh.injectTemplate('KEY_EXPIRATION_WARNING', 'GW-01')).not.toBe(id);
    expect(fresh.faultCount).toBe(2);
  });

  it('skips faults with an expiry: a run-clock instant means nothing after a restore', () => {
    const injector = FaultInjector.getInstance();
    injector.inject('timed', { target: 'rx-payload', groundStationId: 'GW-01', state: {}, expiresAt: 5_000 } as never);
    expect(injector.getCheckpointState().faults).toEqual([]);
  });
});

describe('DecisionManager checkpoint state', () => {
  function decideBeforeCheckpoint(): void {
    DecisionManager.getInstance().register('obj-1', 2, { prompt: 'What is this?', options, readFact: () => true, evidenceStatus: () => [] });
    EventBus.getInstance().emit(Events.DECISION_ANSWERED, { objectiveId: 'obj-1', conditionIndex: 2, optionIndex: 0 });
    EventBus.getInstance().emit(Events.DECISION_RESOLVED, { objectiveId: 'obj-1', conditionIndex: 2, totalAttempts: 1, totalPointsDeducted: 0 });
  }

  it('keeps decisions made before the checkpoint in the completion summary', () => {
    decideBeforeCheckpoint();
    const saved = roundTrip(DecisionManager.getInstance().getCheckpointState());
    expect(saved.records).toHaveLength(1);

    DecisionManager.destroy();
    const fresh = DecisionManager.getInstance();
    expect(fresh.getRecords()).toEqual([]);
    fresh.restoreCheckpointState(saved);
    const records = fresh.getRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ objectiveId: 'obj-1', conditionIndex: 2, prompt: 'What is this?', attempts: 1 });
    expect(records[0].resolution.correct).toBe(true);
    // Saving again after a restore does not lose them
    expect(fresh.getCheckpointState().records).toHaveLength(1);
  });

  it('a live decision wins over a restored record with the same key, and reset drops them', () => {
    decideBeforeCheckpoint();
    const saved = roundTrip(DecisionManager.getInstance().getCheckpointState());
    DecisionManager.destroy();
    const fresh = DecisionManager.getInstance();
    fresh.restoreCheckpointState(saved);
    decideBeforeCheckpoint();
    expect(fresh.getRecords()).toHaveLength(1);
    fresh.reset();
    expect(fresh.getRecords()).toEqual([]);
  });
});

describe('collector and restore wiring', () => {
  it('collects and restores the new sections, and an older checkpoint without them is a no-op', () => {
    const lb = LinkBudgetManager.getInstance();
    lb.commitLink(lb.getConfig()!.thresholdCNRDb + 2);
    const states = roundTrip(collectManagerStates());
    expect(states.linkBudget?.appliedMarginDb).toBeCloseTo(2, 9);
    expect(states.decisions).toBeUndefined();
    expect(states.hardwareFaults).toBeUndefined();

    LinkBudgetManager.destroy();
    const fresh = LinkBudgetManager.getInstance();
    restoreManagerStates({ v: 1 });
    expect(fresh.state.appliedMarginDb).toBeNull();
    restoreManagerStates(states);
    expect(fresh.state.appliedMarginDb).toBeCloseTo(2, 9);
  });

  it('one failing section does not stop the others', () => {
    const lb = LinkBudgetManager.getInstance();
    vi.spyOn(lb, 'restoreCheckpointState').mockImplementation(() => {
      throw new Error('boom');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    DecisionManager.getInstance();
    restoreManagerStates({
      v: 1,
      linkBudget: { appliedMarginDb: 1 },
      decisions: {
        records: [
          {
            objectiveId: 'o',
            conditionIndex: 0,
            prompt: 'p',
            attempts: 1,
            pointsDeducted: 0,
            resolution: { optionIndex: 0, label: 'l', correct: true, evidenced: true, missingEvidence: [] },
          },
        ],
      },
    });
    expect(DecisionManager.getInstance().getRecords()).toHaveLength(1);
  });
});
