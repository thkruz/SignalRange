import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { DecisionGradedData, DecisionPendingData, Events } from '../../src/events/events';
import type { DecisionOption, EvidenceFactId } from '../../src/objectives/objective-types';

const dispatched: unknown[] = [];
const dispatchResult = { applied: [] as string[], skipped: [] as { key: string; reason: string }[], pointDelta: 0 };

vi.mock('../../src/objectives/consequence-dispatcher', () => ({
  ConsequenceDispatcher: class {
    dispatch(consequence: unknown) {
      dispatched.push(consequence);
      return { ...dispatchResult };
    }
    releaseAll() {}
  },
}));

const { DecisionManager, DEFAULT_DECISION_PENALTY } = await import('../../src/modal/decision-manager');

const facts: Partial<Record<EvidenceFactId, boolean>> = {};
const evidence = [{ id: 'cn-read', label: 'C/N observed', ready: true }];

const options: DecisionOption[] = [
  { label: 'Fault', correctWhen: { fact: 'equipment-fault-active', is: true }, consequence: { log: 'fault' } },
  {
    label: 'Interference',
    correctWhen: {
      all: [
        { fact: 'interference-active', is: true },
        { fact: 'crypto-intact', is: true },
      ],
    },
  },
  {
    label: 'Intrusion',
    correctWhen: { fact: 'crypto-intact', is: false },
    consequence: { auditEvent: { id: 'x', actor: 'op', action: 'esc', category: 'access', severity: 'warning' } },
  },
];

const register = (overrides: Partial<Parameters<typeof DecisionManager.prototype.register>[2]> = {}) =>
  DecisionManager.getInstance().register('obj-1', 2, {
    prompt: 'What is this?',
    options,
    readFact: (id) => facts[id] ?? false,
    evidenceStatus: () => evidence,
    ...overrides,
  });

const answer = (optionIndex: number): DecisionGradedData => {
  let graded: DecisionGradedData | null = null;
  const handler = (d: DecisionGradedData) => {
    graded = d;
  };
  EventBus.getInstance().on(Events.DECISION_GRADED, handler);
  EventBus.getInstance().emit(Events.DECISION_ANSWERED, { objectiveId: 'obj-1', conditionIndex: 2, optionIndex });
  EventBus.getInstance().off(Events.DECISION_GRADED, handler);
  if (!graded) throw new Error('no DECISION_GRADED emitted');
  return graded;
};

const resolve = () => EventBus.getInstance().emit(Events.DECISION_RESOLVED, { objectiveId: 'obj-1', conditionIndex: 2, totalAttempts: 1, totalPointsDeducted: 0 });

describe('DecisionManager', () => {
  beforeEach(() => {
    EventBus.destroy();
    DecisionManager.destroy();
    dispatched.length = 0;
    dispatchResult.pointDelta = 0;
    for (const key of Object.keys(facts)) delete facts[key as EvidenceFactId];
    evidence[0].ready = true;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    DecisionManager.destroy();
    EventBus.destroy();
    vi.restoreAllMocks();
  });

  it('registers once, raises a pending indicator, and is unresolved until Continue', () => {
    let pending: DecisionPendingData | null = null;
    EventBus.getInstance().on(Events.DECISION_PENDING, (d) => {
      pending = d;
    });
    register();
    register();
    const dm = DecisionManager.getInstance();
    expect(pending).toEqual({ objectiveId: 'obj-1', conditionIndex: 2 });
    expect(dm.has('obj-1', 2)).toBe(true);
    expect(dm.hasPending()).toBe(true);
    expect(dm.isResolved('obj-1', 2)).toBe(false);
  });

  it('grades the chosen option against the facts at answer time', () => {
    register();
    facts['interference-active'] = true;
    facts['crypto-intact'] = true;

    const wrong = answer(0);
    expect(wrong.correct).toBe(false);
    expect(wrong.pointsDeducted).toBe(DEFAULT_DECISION_PENALTY);
    expect(DecisionManager.getInstance().isResolved('obj-1', 2)).toBe(false);

    const right = answer(1);
    expect(right.correct).toBe(true);
    expect(right.evidenced).toBe(true);
    expect(right.attempts).toBe(2);
    expect(right.pointsDeducted).toBe(DEFAULT_DECISION_PENALTY);

    resolve();
    expect(DecisionManager.getInstance().isResolved('obj-1', 2)).toBe(true);
    expect(DecisionManager.getInstance().hasPending()).toBe(false);
  });

  it('the same options grade differently when the facts differ', () => {
    register();
    facts['crypto-intact'] = false;
    expect(answer(1).correct).toBe(false);
    expect(answer(2).correct).toBe(true);
  });

  it('charges partial credit for a correct call made before the evidence latched', () => {
    register({ pointPenalty: 10, partialCreditUnevidenced: 0.5 });
    facts['equipment-fault-active'] = true;
    evidence[0].ready = false;

    const graded = answer(0);
    expect(graded.correct).toBe(true);
    expect(graded.evidenced).toBe(false);
    expect(graded.missingEvidence).toEqual(['C/N observed']);
    expect(graded.pointsDeducted).toBe(5);
    expect(DecisionManager.getInstance().getRecords()[0].resolution.evidenced).toBe(false);
  });

  it('fires the chosen option consequence whether right or wrong, and applies its point delta', () => {
    register();
    facts['equipment-fault-active'] = true;
    facts['crypto-intact'] = true; // so "Intrusion" is wrong
    dispatchResult.pointDelta = 3;

    answer(2); // wrong, carries an auditEvent consequence
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({ auditEvent: { id: 'x' } });

    const right = answer(0); // right, carries a log consequence
    expect(dispatched).toHaveLength(2);
    expect(right.pointsDeducted).toBe(DEFAULT_DECISION_PENALTY + 3 + 3);
  });

  it('accepts any answer, with a warning, when no option is correct for the current facts', () => {
    register();
    facts['crypto-intact'] = true; // no fault, no interference, crypto fine: no option's rule holds
    const graded = answer(1);
    expect(graded.correct).toBe(true);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('no option is correct'));
  });

  it('DECISION_SHOW carries labels only, never rules or consequences', () => {
    register({ character: undefined });
    let shown: unknown = null;
    EventBus.getInstance().on(Events.DECISION_SHOW, (d) => {
      shown = d;
    });
    DecisionManager.getInstance().show('obj-1', 2);
    expect(shown).toMatchObject({ options: ['Fault', 'Interference', 'Intrusion'], evidence, pointPenalty: DEFAULT_DECISION_PENALTY });
    expect(JSON.stringify(shown)).not.toContain('correctWhen');
  });

  it('a dismissed decision becomes pending again and reopenPending shows it', () => {
    register();
    let shows = 0;
    EventBus.getInstance().on(Events.DECISION_SHOW, () => {
      shows += 1;
    });
    EventBus.getInstance().emit(Events.DECISION_DISMISSED, { objectiveId: 'obj-1', conditionIndex: 2 });
    DecisionManager.getInstance().reopenPending();
    expect(shows).toBe(1);
  });
});
