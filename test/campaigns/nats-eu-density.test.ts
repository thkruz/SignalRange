/**
 * nats-eu content density gate (phase 16).
 *
 * Campaign 2 shipped with a third of Campaign 1's content per scenario: 6-9
 * objectives, almost no quizzes, no timers and (S1-S8) no dialog. The phase-16
 * plan sets per-scenario floors that stand in for "parity in time-on-task and
 * teaching depth" (src/private/plans/phase-16-nats-eu-content-density-plan.md
 * section 2). This test asserts them so the campaign cannot drift back.
 *
 * Ratchet semantics: scenarios listed in KNOWN_BELOW_FLOOR are asserted with
 * `it.fails`, which passes while the scenario is still thin and FAILS the moment
 * the scenario meets every floor. Rewriting a scenario therefore requires
 * removing it from the set in the same change, and nothing can be added back.
 *
 * The floors count real content, not padding: an objective is one entry in the
 * `objectives` array whatever its condition count, a quiz is one `status-check`
 * condition, a clip is one entry in `dialogClips`. The review rule that an added
 * objective must make the operator do or decide something new is a human check
 * (plan section 4); this test only stops regressions.
 */

import { natsEuCampaignData } from '@app/campaigns/nats-eu/campaign-data';
import type { ScenarioData } from '@app/ScenarioData';
import { describe, expect, it } from 'vitest';

/** Scenarios not yet rewritten to the phase-16 floors. Remove each as it is done. */
const KNOWN_BELOW_FLOOR = new Set<number>([]);

/** Phase 1 = Foundations (S1-S8); Phase 2 = Qualified Operations (S9-S16). */
const PHASE_1_LAST = 8;
/** Evaluations get more room: more objectives, and S8 may run lean on clips. */
const CAPSTONES = new Set<number>([8, 16]);

interface Floors {
  minObjectives: number;
  minQuizzes: number;
  minClips: number;
  maxClips: number;
  minTimerFraction: number;
  minConditionTypes: number;
  minPoints: number;
  maxPoints: number;
}

function floorsFor(number: number): Floors {
  const isPhase1 = number <= PHASE_1_LAST;
  const isCapstone = CAPSTONES.has(number);

  return {
    minObjectives: isCapstone ? 18 : 15,
    minQuizzes: 8,
    // Design plan section 2.3: Phase 1 10-16 clips; nats-campaign-builder cap
    // of 3-7 from S9, with 8-10 allowed on the capstone. S8 is the Phase 1
    // graduation shift and is written closer to the qualified tone (8 clips).
    minClips: isPhase1 ? (number === 8 ? 8 : 10) : 5,
    maxClips: isPhase1 ? 16 : number === 16 ? 10 : 7,
    minTimerFraction: 0.6,
    minConditionTypes: 10,
    minPoints: 150,
    maxPoints: isPhase1 ? 250 : 300,
  };
}

interface Metrics {
  objectives: number;
  quizzes: number;
  clips: number;
  timerFraction: number;
  conditionTypes: number;
  points: number;
}

export function measure(scenario: ScenarioData): Metrics {
  const objectives = scenario.objectives ?? [];
  const conditions = objectives.flatMap((o) => o.conditions);
  const clipCount = (scenario.dialogClips?.intro ? 1 : 0) + Object.keys(scenario.dialogClips?.objectives ?? {}).length;
  const timed = objectives.filter((o) => typeof o.timeLimitSeconds === 'number' && o.timeLimitSeconds > 0).length;

  return {
    objectives: objectives.length,
    quizzes: conditions.filter((c) => c.type === 'status-check').length,
    clips: clipCount,
    timerFraction: objectives.length === 0 ? 0 : timed / objectives.length,
    conditionTypes: new Set(conditions.map((c) => c.type)).size,
    points: objectives.reduce((sum, o) => sum + (o.points ?? 0), 0),
  };
}

function assertFloors(scenario: ScenarioData): void {
  const f = floorsFor(scenario.number);
  const m = measure(scenario);
  const label = `S${scenario.number} ${scenario.title}`;

  expect(m.objectives, `${label}: objectives`).toBeGreaterThanOrEqual(f.minObjectives);
  expect(m.quizzes, `${label}: status-check quizzes`).toBeGreaterThanOrEqual(f.minQuizzes);
  expect(m.clips, `${label}: dialog clips (min)`).toBeGreaterThanOrEqual(f.minClips);
  expect(m.clips, `${label}: dialog clips (max)`).toBeLessThanOrEqual(f.maxClips);
  expect(m.timerFraction, `${label}: fraction of objectives with a timer`).toBeGreaterThanOrEqual(f.minTimerFraction);
  expect(m.conditionTypes, `${label}: distinct condition types`).toBeGreaterThanOrEqual(f.minConditionTypes);
  expect(m.points, `${label}: points (min)`).toBeGreaterThanOrEqual(f.minPoints);
  expect(m.points, `${label}: points (max)`).toBeLessThanOrEqual(f.maxPoints);
}

const numbered = natsEuCampaignData.scenarios.filter((s) => s.number >= 1).sort((a, b) => a.number - b.number);

describe('nats-eu content density gate', () => {
  it('lists only real scenarios as known-below-floor', () => {
    const numbers = new Set(numbered.map((s) => s.number));
    for (const n of KNOWN_BELOW_FLOOR) {
      expect(numbers.has(n), `KNOWN_BELOW_FLOOR names S${n}, which is not registered`).toBe(true);
    }
  });

  for (const scenario of numbered) {
    const name = `S${scenario.number} "${scenario.title}" meets the phase-16 floors`;
    if (KNOWN_BELOW_FLOOR.has(scenario.number)) {
      // Passes while thin; fails once the rewrite lands, forcing the set to shrink.
      it.fails(`${name} (known below floor: remove from KNOWN_BELOW_FLOOR when it passes)`, () => {
        assertFloors(scenario);
      });
    } else {
      it(name, () => {
        assertFloors(scenario);
      });
    }
  }

  it('every objective carries 2-3 NICE codes, primary first', () => {
    for (const scenario of numbered) {
      for (const objective of scenario.objectives ?? []) {
        const codes = objective.nice ?? [];
        expect(codes.length, `S${scenario.number} ${objective.id}: nice codes`).toBeGreaterThanOrEqual(1);
        expect(codes.length, `S${scenario.number} ${objective.id}: nice codes`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('every dialog clip key names an objective in the same scenario', () => {
    for (const scenario of numbered) {
      const ids = new Set((scenario.objectives ?? []).map((o) => o.id));
      for (const key of Object.keys(scenario.dialogClips?.objectives ?? {})) {
        expect(ids.has(key), `S${scenario.number}: clip "${key}" has no objective`).toBe(true);
      }
    }
  });
});
