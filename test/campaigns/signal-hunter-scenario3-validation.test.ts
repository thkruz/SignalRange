/**
 * Campaign 5 (Signal Hunter) scenario 3 "Cold Trail" (phase 18 F) -
 * wiring, the two-carrier schedule (the first stops before the second
 * starts, from a site far enough away that a mixed solve is useless), and
 * headless solves proving both fixes.
 */
import { signalHunterScenario3Data } from '@app/campaigns/signal-hunter/scenario3';
import { SCENARIOS } from '@app/scenario-manager';
import { greatCircleKm } from '@app/services/geolocation-service';
import { describe, expect, it } from 'vitest';
import {
  eventOf,
  expectInsideAreaOfInterest,
  expectReachable,
  expectRoutedThroughTp1,
  expectWellFormedObjectives,
  objectiveOf,
  relayedIfHz,
} from './signal-hunter-validation-helpers';

const scenario = signalHunterScenario3Data;
const first = eventOf(scenario, 'clayton-a');
const second = eventOf(scenario, 'clayton-b');

describe('signal-hunter scenario 3: wiring', () => {
  it('follows Two Carriers', () => {
    expect(SCENARIOS.filter((s) => s.id === 'signal-hunter-scenario3')).toHaveLength(1);
    expect(scenario.number).toBe(3);
    expect(scenario.prerequisiteScenarioIds).toEqual(['signal-hunter-scenario2']);
    expect(scenario.settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-5/scenario-3?content-only=true&dark=true');
  });
});

describe('signal-hunter scenario 3: one emitter, two carriers, two places', () => {
  it('both carriers route through TP-1 on the same cadence, one below and one above the service carrier', () => {
    for (const event of [first, second]) {
      expectRoutedThroughTp1(scenario, event);
      expectInsideAreaOfInterest(scenario, event);
      expect(event.onSeconds).toBe(36);
      expect(event.periodSeconds).toBe(120);
    }
    expect(relayedIfHz(first)).toBe(1357e6);
    expect(relayedIfHz(second)).toBe(1374e6);
  });

  it('the first carrier stops, then the second starts elsewhere, far enough that a mixed solve is neither', () => {
    const firstEnd = first.startTime + first.duration;

    expect(second.startTime).toBeGreaterThan(firstEnd + 2 * first.periodSeconds); // two silent cycles before it returns
    expect(firstEnd).toBeGreaterThan(20 * 60); // room to detect, capture six, fix, and brief the team
    expect(second.startTime + second.duration).toBeGreaterThan(90 * 60);
    const displacementKm = greatCircleKm({ lat: first.emitter!.latitude, lon: first.emitter!.longitude }, { lat: second.emitter!.latitude, lon: second.emitter!.longitude });

    expect(displacementKm).toBeGreaterThan(60);
    expect(displacementKm).toBeLessThan(100);
  });
});

describe('signal-hunter scenario 3: objectives', () => {
  it('is well formed and totals 100 points', () => {
    expectWellFormedObjectives(scenario, 100);
  });

  it('walks fix one, brief, cold trail (gated on the first carrier ending), fix two, report', () => {
    const order = [
      'find-carrier-a',
      'capture-carrier-a',
      'fix-carrier-a',
      'brief-the-team',
      'the-trail-goes-cold',
      'find-carrier-b',
      'capture-carrier-b',
      'fix-carrier-b',
      'file-the-trail',
    ];

    for (let i = 1; i < order.length; i++) {
      expect(objectiveOf(scenario, order[i]).prerequisiteObjectiveIds, order[i]).toEqual([order[i - 1]]);
    }
    expect(objectiveOf(scenario, 'capture-carrier-a').conditions[0].params!.interferenceEventId).toBe('clayton-a');
    expect(objectiveOf(scenario, 'capture-carrier-b').conditions[0].params!.interferenceEventId).toBe('clayton-b');
    const cold = objectiveOf(scenario, 'the-trail-goes-cold');

    expect(cold.conditions.map((c) => c.type)).toEqual(['interference-event-ended', 'status-check']);
    expect(cold.conditions[0].params!.interferenceEventId).toBe('clayton-a');
    expect(objectiveOf(scenario, 'find-carrier-b').conditions[0].params!.signalId).toBe('INTERFERER-clayton-b');
    expect(objectiveOf(scenario, 'file-the-trail').conditions.map((c) => c.description)).toEqual(['Mobility Reported', 'Current Fix Identified']);
  });
});

describe('signal-hunter scenario 3: both fixes are achievable', () => {
  it('six captures on each carrier fix inside 25 km at their own epochs', () => {
    const firstFix = objectiveOf(scenario, 'fix-carrier-a').conditions[0].params!.maxErrorKm!;
    const secondFix = objectiveOf(scenario, 'fix-carrier-b').conditions[0].params!.maxErrorKm!;

    expectReachable(scenario, first, objectiveOf(scenario, 'capture-carrier-a').conditions[0].params!.minCount!, (s) => s.errorKm < firstFix);
    expectReachable(scenario, second, objectiveOf(scenario, 'capture-carrier-b').conditions[0].params!.minCount!, (s) => s.errorKm < secondFix);
  });
});
