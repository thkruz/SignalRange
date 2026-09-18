/**
 * Campaign 5 (Signal Hunter) scenario 2 "Two Carriers" (phase 18 F) -
 * wiring, the two-path frequency plan, the decision's grading, and a
 * headless solve proving the fix thresholds on the uplink carrier.
 */
import { geolocationCampaignData } from '@app/campaigns/nats/campaign-data';
import { signalHunterScenario1Data } from '@app/campaigns/signal-hunter/scenario1';
import { signalHunterScenario2Data } from '@app/campaigns/signal-hunter/scenario2';
import { SCENARIOS } from '@app/scenario-manager';
import { greatCircleKm } from '@app/services/geolocation-service';
import { describe, expect, it } from 'vitest';
import {
  correctOptionsUnder,
  directIfHz,
  eventOf,
  expectIfOnTheTrace,
  expectInsideAreaOfInterest,
  expectReachable,
  expectRoutedThroughTp1,
  expectWellFormedObjectives,
  objectiveOf,
  relayedIfHz,
  TP1_TRANSLATION_HZ,
} from './signal-hunter-validation-helpers';

const scenario = signalHunterScenario2Data;
const uplink = eventOf(scenario, 'dalhart-uplink');
const terrestrial = eventOf(scenario, 'fountain-terrestrial');

describe('signal-hunter scenario 2: wiring', () => {
  it('follows First Fix in the campaign and the registry', () => {
    expect(SCENARIOS.filter((s) => s.id === 'signal-hunter-scenario2')).toHaveLength(1);
    expect(geolocationCampaignData.scenarios.map((s) => s.id)).toEqual([
      'signal-hunter-sandbox',
      'signal-hunter-scenario1',
      'signal-hunter-scenario2',
      'signal-hunter-scenario3',
      'signal-hunter-scenario4',
    ]);
    expect(scenario.number).toBe(2);
    expect(scenario.prerequisiteScenarioIds).toEqual(['signal-hunter-scenario1']);
    expect(scenario.settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-5/scenario-2?content-only=true&dark=true');
  });
});

describe('signal-hunter scenario 2: two paths on one trace', () => {
  it('the uplink carrier routes through TP-1 and cycles', () => {
    expectRoutedThroughTp1(scenario, uplink);
    expectInsideAreaOfInterest(scenario, uplink);
    expect(relayedIfHz(uplink)).toBe(1374e6);
    expect(uplink.onSeconds).toBeLessThan(uplink.periodSeconds / 2);
    expect(uplink.onSeconds).toBeGreaterThanOrEqual(3 * (scenario.settings.geolocation!.captureWindowS ?? 10));
  });

  it('the terrestrial carrier is received directly, is continuous, and fits no TP-1 uplink', () => {
    expect(terrestrial.path).toBe('terrestrial');
    expect(terrestrial.satelliteNoradId).toBeUndefined();
    expect(terrestrial.emitter).toBeDefined();
    expect(terrestrial.onSeconds).toBe(terrestrial.periodSeconds);
    expect(terrestrial.startTime).toBe(0);
    expect(directIfHz(terrestrial)).toBe(1398e6);
    expectIfOnTheTrace(scenario, directIfHz(terrestrial), terrestrial.bandwidth, terrestrial.id);
    // Would-be uplink is below every SENTRY-7 transponder: nothing on the bird to correlate
    const wouldBeUplink = terrestrial.frequency + TP1_TRANSLATION_HZ;
    const victim = scenario.settings.satellites.find((s) => s.noradId === 71001)!;

    expect(victim.transponders.some((tp) => wouldBeUplink >= tp.uplinkLowEdge && wouldBeUplink <= tp.uplinkHighEdge)).toBe(false);
    // Close enough to the annex to arrive through the dish's sidelobes
    const station = scenario.settings.groundStations[0].location;

    expect(greatCircleKm({ lat: station.latitude, lon: station.longitude }, { lat: terrestrial.emitter!.latitude, lon: terrestrial.emitter!.longitude })).toBeLessThan(40);
  });

  it('opens the analyzer wide enough for both carriers and is not First Fix again', () => {
    const analyzer = scenario.settings.groundStations[0].spectrumAnalyzers![0];

    expect(analyzer.span).toBe(60e6);
    const first = signalHunterScenario1Data.settings.interferenceEvents![0];

    expect(uplink.frequency).not.toBe(first.frequency);
    expect(greatCircleKm({ lat: uplink.emitter!.latitude, lon: uplink.emitter!.longitude }, { lat: first.emitter!.latitude, lon: first.emitter!.longitude })).toBeGreaterThan(100);
  });
});

describe('signal-hunter scenario 2: objectives', () => {
  it('is well formed and totals 100 points', () => {
    expectWellFormedObjectives(scenario, 100);
  });

  it('sorts the carriers on both facts: only the split call grades correct with both paths in play', () => {
    const call = objectiveOf(scenario, 'call-the-path');
    const decision = call.conditions.find((c) => c.type === 'decision')!;

    expect(decision.params!.evidence).toEqual(['uplink-seen', 'terrestrial-seen']);
    expect(call.conditions.filter((c) => c.type === 'signal-detected').map((c) => c.id)).toEqual(['uplink-seen', 'terrestrial-seen']);
    expect(correctOptionsUnder(call, { 'transponder-interference-active': true, 'terrestrial-interference-active': true })).toEqual([0]);
    expect(correctOptionsUnder(call, { 'transponder-interference-active': true, 'terrestrial-interference-active': false })).toEqual([1]);
    expect(correctOptionsUnder(call, { 'transponder-interference-active': false, 'terrestrial-interference-active': true })).toEqual([2]);
  });

  it('captures and fixes only the uplink carrier', () => {
    for (const id of ['collect-measurements', 'refine-fix']) {
      const condition = objectiveOf(scenario, id).conditions.find((c) => c.type === 'geolocation-measurements-collected')!;

      expect(condition.params!.interferenceEventId).toBe('dalhart-uplink');
    }
    expect(objectiveOf(scenario, 'compute-fix').prerequisiteObjectiveIds).toEqual(['collect-measurements']);
    expect(objectiveOf(scenario, 'refine-fix').isOptional).toBe(true);
  });
});

describe('signal-hunter scenario 2: accuracy targets are achievable', () => {
  it('six captures fix inside 25 km; twelve inside 15 km', () => {
    const fix = objectiveOf(scenario, 'compute-fix').conditions[0].params!.maxErrorKm!;
    const captures = objectiveOf(scenario, 'collect-measurements').conditions[0].params!.minCount!;
    const stretch = objectiveOf(scenario, 'refine-fix');
    const stretchCount = stretch.conditions.find((c) => c.type === 'geolocation-measurements-collected')!.params!.minCount!;
    const stretchFix = stretch.conditions.find((c) => c.type === 'geolocation-fix-accuracy')!.params!.maxErrorKm!;

    expectReachable(scenario, uplink, captures, (s) => s.errorKm < fix);
    expectReachable(scenario, uplink, stretchCount, (s) => s.errorKm < stretchFix, { minPassRate: 0.8 });
  });
});
