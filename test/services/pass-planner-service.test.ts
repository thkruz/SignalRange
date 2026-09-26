import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { DEFAULT_CONTACT_MIN_ELEVATION, PassPlannerService, scenarioMinElevation } from '@app/services/pass-planner-service';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { describe, expect, it } from 'vitest';

/** Scenario clock start used to author the test TLEs: 2027-03-15 14:00:00 UTC */
const SCENARIO_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);

const OBSERVER = { lat: 53.27 as Degrees, lon: -9.05 as Degrees, alt: 0.02 as Kilometers };

/** AOS T+2.0 min, max el 88.3 deg at T+8, LOS T+14.5 min; next pass ~T+99.5 min */
const SAT_A = new OrbitalSatellite('TEST-LEO-A', 61701, [], [], {
  tle1: '1 61701U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9996' as TleLine1,
  tle2: '2 61701  97.6000  26.0000 0010000  90.0000 294.0000 14.90000000123451' as TleLine2,
  observer: OBSERVER,
});

/** AOS T+17.5 min, max el 83.9 deg at T+24, LOS T+31.5 min */
const SAT_B = new OrbitalSatellite('TEST-LEO-B', 61702, [], [], {
  tle1: '1 61702U 27015A   27074.58333333  .00001000  00000-0  10000-3 0  9997' as TleLine1,
  tle2: '2 61702  98.1000  30.0000 0010000  90.0000 236.0000 14.60000000123456' as TleLine2,
  observer: OBSERVER,
});

const MINUTE_MS = 60 * 1000;

describe('PassPlannerService', () => {
  const planner = new PassPlannerService();

  it('finds the authored pass with accurate AOS/LOS/max elevation', () => {
    const passes = planner.getPasses(SAT_A, SCENARIO_START_MS, { horizonHours: 1 });

    expect(passes).toHaveLength(1);
    const pass = passes[0];

    // AOS ~T+2.0 min, LOS ~T+14.5 min (30s coarse sampling, bisected to <1s)
    expect(pass.aosMs).toBeGreaterThan(SCENARIO_START_MS + 1 * MINUTE_MS);
    expect(pass.aosMs).toBeLessThan(SCENARIO_START_MS + 3 * MINUTE_MS);
    expect(pass.losMs).toBeGreaterThan(SCENARIO_START_MS + 13.5 * MINUTE_MS);
    expect(pass.losMs).toBeLessThan(SCENARIO_START_MS + 15.5 * MINUTE_MS);
    expect(pass.maxEl).toBeGreaterThan(80);
    expect(pass.durationS).toBeGreaterThan(10 * 60);
    expect(pass.durationS).toBeLessThan(16 * 60);
    expect(pass.noradId).toBe(61701);
    expect(pass.satelliteName).toBe('TEST-LEO-A');
  });

  it('finds multiple passes over a longer horizon', () => {
    const passes = planner.getPasses(SAT_A, SCENARIO_START_MS, { horizonHours: 12 });

    expect(passes.length).toBeGreaterThanOrEqual(2);
    // Second pass ~T+99.5 min
    expect(passes[1].aosMs).toBeGreaterThan(SCENARIO_START_MS + 90 * MINUTE_MS);
    expect(passes[1].aosMs).toBeLessThan(SCENARIO_START_MS + 110 * MINUTE_MS);
    // Passes are chronological and non-overlapping
    expect(passes[0].losMs).toBeLessThan(passes[1].aosMs);
  });

  it('includes a pass already in progress at the search start', () => {
    // Start searching mid-pass (T+8 min)
    const startMs = SCENARIO_START_MS + 8 * MINUTE_MS;
    const passes = planner.getPasses(SAT_A, startMs, { horizonHours: 1 });

    expect(passes).toHaveLength(1);
    expect(passes[0].aosMs).toBe(startMs);
    expect(passes[0].losMs).toBeGreaterThan(startMs);
  });

  it('merges multi-satellite schedules sorted by AOS', () => {
    const schedule = planner.getContactSchedule([SAT_B, SAT_A], SCENARIO_START_MS, { horizonHours: 1 });

    expect(schedule.length).toBeGreaterThanOrEqual(2);
    expect(schedule[0].noradId).toBe(61701); // SAT_A rises first (T+2)
    expect(schedule[1].noradId).toBe(61702); // SAT_B follows (T+17.5)
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].aosMs).toBeGreaterThanOrEqual(schedule[i - 1].aosMs);
    }
  });

  it('returns no passes when the satellite never rises in the horizon window', () => {
    // 40-60 min after start both authored passes are over and the next is >30 min away
    const startMs = SCENARIO_START_MS + 40 * MINUTE_MS;
    const passes = planner.getPasses(SAT_A, startMs, { horizonHours: 0.5 });

    expect(passes).toHaveLength(0);
  });
});

/**
 * The Pass Schedule tab and the contact timeline deck both predict passes. They
 * must resolve the SAME elevation mask or they show different AOS/LOS for the
 * same pass - which is exactly what happened before this helper existed.
 */
describe('scenarioMinElevation', () => {
  it('is 0 for scenarios that never opted into the contact timeline', () => {
    // Legacy campaigns keep the historical behaviour.
    expect(scenarioMinElevation({})).toBe(0);
  });

  it('defaults to the shared 5 deg mask once a scenario declares the timeline', () => {
    expect(scenarioMinElevation({ contactTimeline: {} })).toBe(DEFAULT_CONTACT_MIN_ELEVATION);
    expect(DEFAULT_CONTACT_MIN_ELEVATION).toBe(5);
  });

  it('honours an explicit mask', () => {
    expect(scenarioMinElevation({ contactTimeline: { minElevation: 10 as Degrees } })).toBe(10);
  });

  it('changes which passes are reported, proving the mask actually bites', () => {
    const planner = new PassPlannerService();
    const atHorizon = planner.getPasses(SAT_A, SCENARIO_START_MS, {
      horizonHours: 12,
      minElevation: scenarioMinElevation({}),
    });
    const masked = planner.getPasses(SAT_A, SCENARIO_START_MS, {
      horizonHours: 12,
      minElevation: scenarioMinElevation({ contactTimeline: {} }),
    });

    // A 5 deg mask can only drop passes, never add them, and never keeps one
    // that fails the mask. (This TLE happens to have no sub-5 deg grazers in a
    // 12 h window, so the counts may legitimately match - the narrowing below
    // is what proves the mask is applied.)
    expect(masked.length).toBeLessThanOrEqual(atHorizon.length);
    expect(masked.every((pass) => pass.maxEl >= 5)).toBe(true);

    const shared = masked[0];
    const wide = atHorizon.find((pass) => Math.abs(pass.maxElMs - shared.maxElMs) < 60_000);

    expect(wide).toBeDefined();
    expect(shared.aosMs).toBeGreaterThan(wide!.aosMs);
    expect(shared.losMs).toBeLessThan(wide!.losMs);
  });
});
