/**
 * M18: the capped diagnosis effect applies only when a scenario has a plant evidence log.
 * Campaigns 1-5 have none, so their scores stay identical.
 */

import type { ObjectiveState } from '@app/objectives';
import { type DiagnosticSummary, diagnosticPercentEffect } from '@app/physical/diagnostic-scorer';
import { buildFieldDiagnosis, describeFieldDiagnosis, plantHasFault, TRIP_RULE_TEXT } from '@app/scoring/field-diagnosis';
import { ScoreCalculator } from '@app/scoring/score-calculator';
import { describe, expect, it } from 'vitest';

function summary(over: Partial<DiagnosticSummary> = {}): DiagnosticSummary {
  return {
    relevantTests: 3,
    usefulNegatives: 0,
    irrelevantTests: 1,
    supportedFixes: 1,
    unsupportedFixes: 0,
    unsupportedSpares: 0,
    wrongCauseActions: 0,
    wrongCauseRuleIds: [],
    firstCorrectActionS: 90,
    timeToCauseS: 65,
    trips: 0,
    spotted: false,
    ...over,
  };
}

function objectives(): ObjectiveState[] {
  return [
    { isCompleted: true, objective: { id: 'a', points: 60 } },
    { isCompleted: true, objective: { id: 'b', points: 40 } },
    { isCompleted: false, objective: { id: 'c', points: 99 } },
  ] as unknown as ObjectiveState[];
}

describe('M18 percent caps', () => {
  it('gives +2% per credited negative, capped at +10%', () => {
    expect(diagnosticPercentEffect(summary({ usefulNegatives: 2 }), 100)).toMatchObject({ bonusPct: 4, bonus: 4, penalty: 0 });
    expect(diagnosticPercentEffect(summary({ usefulNegatives: 40 }), 100)).toMatchObject({ bonusPct: 10, bonus: 10 });
  });

  it('takes -5% per unsupported fix, capped at -20%', () => {
    expect(diagnosticPercentEffect(summary({ unsupportedFixes: 1 }), 200)).toMatchObject({ penaltyPct: 5, penalty: 10 });
    expect(diagnosticPercentEffect(summary({ unsupportedFixes: 9 }), 200)).toMatchObject({ penaltyPct: 20, penalty: 40 });
  });

  it('floors to whole points and never goes negative on zero base', () => {
    expect(diagnosticPercentEffect(summary({ usefulNegatives: 1 }), 30).bonus).toBe(0);
    expect(diagnosticPercentEffect(summary({ unsupportedFixes: 3 }), 0)).toMatchObject({ bonus: 0, penalty: 0 });
  });
});

describe('M18 score integration', () => {
  it('leaves the breakdown identical when no diagnostic effect is passed (campaigns 1-5)', () => {
    const six = ScoreCalculator.calculate(objectives(), 100, 5, 2, 3, 4);
    const seven = ScoreCalculator.calculate(objectives(), 100, 5, 2, 3, 4, undefined);
    expect(seven).toEqual(six);
    expect('diagnosticBonus' in six).toBe(false);
    expect('diagnosticPenalty' in six).toBe(false);
    expect(six.totalScore).toBe(100 + 20 - 5 - 2 - 3 - 4);
    expect(six).toEqual({
      basePoints: 100,
      timeBonus: 20,
      quizPenalties: 5,
      timePenalties: 2,
      hintPenalties: 3,
      decisionPenalties: 4,
      totalScore: 106,
      objectiveBreakdown: [{ points: 60 }, { points: 40 }],
      timeRemainingSeconds: 100,
    });
  });

  it('adds the capped bonus and subtracts the capped penalty when a diagnosis is supplied', () => {
    const effect = diagnosticPercentEffect(summary({ usefulNegatives: 3, unsupportedFixes: 1 }), 100);
    const score = ScoreCalculator.calculate(objectives(), 0, 0, 0, 0, 0, effect);
    expect(score).toMatchObject({ diagnosticBonus: 6, diagnosticPenalty: 5, totalScore: 101 });
  });

  it('builds no diagnosis without a plant evidence log', () => {
    expect(buildFieldDiagnosis({ field: null, config: () => null }, 100)).toBeNull();
    expect(buildFieldDiagnosis({ field: { evidence: null, plant: {} as never }, config: () => ({ parts: [], connectors: [], cables: [], faults: [] }) as never }, 100)).toBeNull();
    expect(buildFieldDiagnosis({ field: { evidence: {} as never, plant: {} as never }, config: () => null }, 100)).toBeNull();
  });
});

describe('no-fault scenarios', () => {
  it('replaces the time-to-cause line when the shift had no fault', () => {
    const d = describeFieldDiagnosis(summary({ timeToCauseS: null }), 100, [], false);
    expect(d.lines[0]).toBe('Time to cause: nothing to find. This shift had no fault.');
    expect(d.lines.join(' ')).not.toContain('not established');
  });

  it('sees a fault in the plant faults, an injected fault event or an armed impairment', () => {
    const base = { parts: [], connectors: [], cables: [] } as never as Parameters<typeof plantHasFault>[0];
    expect(plantHasFault(base)).toBe(false);
    expect(plantHasFault({ ...base, faults: [{ id: 'f' } as never] })).toBe(true);
    expect(plantHasFault({ ...base, events: [{ id: 'e', startAfterObjectiveId: 'o', actions: [{ kind: 'inject-fault', fault: {} as never }] }] })).toBe(true);
    expect(plantHasFault({ ...base, events: [{ id: 'e', startAfterObjectiveId: 'o', actions: [{ kind: 'link-impairment', impairmentId: 'i', active: true }] }] })).toBe(true);
    expect(plantHasFault({ ...base, events: [{ id: 'e', startAfterObjectiveId: 'o', actions: [{ kind: 'set-flag', key: 'k', value: 1 }] }] })).toBe(false);
  });
});

describe('M18 debrief text', () => {
  it('lists time to cause, tests, negatives, lucky swaps, spares and trips, and explains the score effect', () => {
    const d = describeFieldDiagnosis(summary({ usefulNegatives: 2, unsupportedFixes: 1, unsupportedSpares: 1, trips: 2 }), 100);
    const text = d.lines.join('\n');
    expect(text).toContain('Time to cause: 1 min 05 s');
    expect(text).toContain('Relevant tests: 3');
    expect(text).toContain('Credited negative tests: 2');
    expect(text).toContain('Lucky swaps: 1');
    expect(text).toContain('Trips outside: 2');
    expect(d.scoreNotes.join('\n')).toContain('Bonus +4');
    expect(d.scoreNotes.join('\n')).toContain('Penalty -5');
    expect(d.scoreNotes).toContain(TRIP_RULE_TEXT);
  });

  it('says so when the cause was never established and the score did not move', () => {
    const d = describeFieldDiagnosis(summary({ timeToCauseS: null }), 100);
    expect(d.lines[0]).toContain('not established');
    expect(d.scoreNotes[0]).toBe('Your diagnosis did not change the score.');
  });
});
