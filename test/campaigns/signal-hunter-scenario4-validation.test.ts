/**
 * Campaign 5 (Signal Hunter) scenario 4 "Prove It" (phase 18 F) - wiring,
 * the reference-versus-hostile plan (the allied terminal far enough from the
 * hostile that a closed ellipse excludes it), the decision's grading, and
 * headless solves proving the calibration fix, the hostile fix, and the
 * ellipse threshold.
 */
import { signalHunterScenario4Data } from '@app/campaigns/signal-hunter/scenario4';
import { SCENARIOS } from '@app/scenario-manager';
import { greatCircleKm } from '@app/services/geolocation-service';
import { describe, expect, it } from 'vitest';
import {
  correctOptionsUnder,
  eventOf,
  expectInsideAreaOfInterest,
  expectReachable,
  expectRoutedThroughTp1,
  expectWellFormedObjectives,
  objectiveOf,
  relayedIfHz,
} from './signal-hunter-validation-helpers';

const scenario = signalHunterScenario4Data;
const reference = eventOf(scenario, 'cannon-reference');
const hostile = eventOf(scenario, 'curry-hostile');

describe('signal-hunter scenario 4: wiring', () => {
  it('closes the arc after Cold Trail', () => {
    expect(SCENARIOS.filter((s) => s.id === 'signal-hunter-scenario4')).toHaveLength(1);
    expect(scenario.number).toBe(4);
    expect(scenario.prerequisiteScenarioIds).toEqual(['signal-hunter-scenario3']);
    expect(scenario.settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-5/scenario-4?content-only=true&dark=true');
  });
});

describe('signal-hunter scenario 4: a known terminal and a hostile on one transponder', () => {
  it('both carriers route through TP-1; the reference is continuous at Cannon, the hostile cycles', () => {
    for (const event of [reference, hostile]) {
      expectRoutedThroughTp1(scenario, event);
      expectInsideAreaOfInterest(scenario, event);
    }
    expect(relayedIfHz(reference)).toBe(1372e6);
    expect(relayedIfHz(hostile)).toBe(1354e6);
    expect(reference.onSeconds).toBe(reference.periodSeconds);
    expect(reference.startTime).toBe(0);
    expect(reference.emitter!.latitude).toBeCloseTo(34.383, 3); // Cannon AFB, printed in the package
    expect(reference.emitter!.longitude).toBeCloseTo(-103.322, 3);
    expect(hostile.onSeconds).toBeLessThan(hostile.periodSeconds / 2);
  });

  it('the hostile sits far enough from Cannon that the graded ellipse cannot contain the base', () => {
    const separationKm = greatCircleKm(
      { lat: reference.emitter!.latitude, lon: reference.emitter!.longitude },
      { lat: hostile.emitter!.latitude, lon: hostile.emitter!.longitude }
    );
    const fixErrorKm = objectiveOf(scenario, 'fix-the-hostile').conditions[0].params!.maxErrorKm!;
    const ellipseKm = objectiveOf(scenario, 'prove-it').conditions.find((c) => c.type === 'geolocation-ellipse-within')!.params!.maxSemiMajorKm!;

    expect(separationKm).toBeGreaterThan(50);
    expect(separationKm).toBeGreaterThan(fixErrorKm + ellipseKm + 10);
  });
});

describe('signal-hunter scenario 4: objectives', () => {
  it('is well formed and totals 100 points', () => {
    expectWellFormedObjectives(scenario, 100);
  });

  it('calibrates on the reference, clears, fixes the hostile alone, closes the ellipse, then calls and files', () => {
    const order = [
      'find-both-carriers',
      'capture-the-reference',
      'fix-the-reference',
      'read-the-calibration',
      'clear-and-hunt',
      'fix-the-hostile',
      'prove-it',
      'make-the-call',
      'file-the-proof',
    ];

    for (let i = 1; i < order.length; i++) {
      expect(objectiveOf(scenario, order[i]).prerequisiteObjectiveIds, order[i]).toEqual([order[i - 1]]);
    }
    expect(objectiveOf(scenario, 'capture-the-reference').conditions[0].params!.interferenceEventId).toBe('cannon-reference');
    expect(objectiveOf(scenario, 'clear-and-hunt').conditions[0].params!.interferenceEventId).toBe('curry-hostile');
    const prove = objectiveOf(scenario, 'prove-it');

    expect(prove.conditions.map((c) => c.type)).toEqual(['geolocation-measurements-collected', 'geolocation-ellipse-within']);
    expect(prove.conditions[0].params!.interferenceEventId).toBe('curry-hostile');
  });

  it('the call is graded on the hostile still being in progress', () => {
    const call = objectiveOf(scenario, 'make-the-call');

    expect(call.conditions.find((c) => c.type === 'decision')!.params!.evidence).toEqual(['hostile-seen']);
    expect(correctOptionsUnder(call, { 'transponder-interference-active': true })).toEqual([0]);
    expect(correctOptionsUnder(call, { 'transponder-interference-active': false })).toEqual([1]);
  });
});

describe('signal-hunter scenario 4: calibration, fix, and ellipse targets are achievable', () => {
  it('six spaced captures on the continuous reference land on Cannon inside 20 km', () => {
    const maxErrorKm = objectiveOf(scenario, 'fix-the-reference').conditions[0].params!.maxErrorKm!;
    const count = objectiveOf(scenario, 'capture-the-reference').conditions[0].params!.minCount!;

    expectReachable(scenario, reference, count, (s) => s.errorKm < maxErrorKm, { spacingS: 120 });
  });

  it('eight captures fix the hostile inside 20 km; twelve close the ellipse to 20 km', () => {
    const fixKm = objectiveOf(scenario, 'fix-the-hostile').conditions[0].params!.maxErrorKm!;
    const fixCount = objectiveOf(scenario, 'clear-and-hunt').conditions[0].params!.minCount!;
    const prove = objectiveOf(scenario, 'prove-it');
    const proveCount = prove.conditions[0].params!.minCount!;
    const ellipseKm = prove.conditions[1].params!.maxSemiMajorKm!;

    expectReachable(scenario, hostile, fixCount, (s) => s.errorKm < fixKm);
    expectReachable(scenario, hostile, proveCount, (s) => s.semiMajorKm !== null && s.semiMajorKm <= ellipseKm, { minPassRate: 0.8 });
  });
});
