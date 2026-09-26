/**
 * Campaign 5 (Signal Hunter) scenario 1 "First Fix" wiring + achievability.
 *
 * Static checks: registration, ids, prerequisites, condition types against the
 * ConditionType union, points, the interference event sitting inside a
 * SENTRY-7 transponder passband and inside the geolocation pair, the emitter
 * inside the solver's area of interest, and the docs slug.
 *
 * Behavioural check: solve the scenario's own geometry headlessly at its
 * start epoch with captures timed the way the console would accept them
 * (fully inside the interferer's on-windows) and confirm the graded accuracy
 * thresholds are reachable with the configured measurement noise.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { geolocationCampaignData } from '@app/campaigns/nats/campaign-data';
import { signalHunterSandboxData } from '@app/campaigns/signal-hunter/sandbox';
import { signalHunterScenario1Data } from '@app/campaigns/signal-hunter/scenario1';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { type GeolocationMeasurement, GeolocationService, greatCircleKm } from '@app/services/geolocation-service';
import { describe, expect, it } from 'vitest';

const scenario = signalHunterScenario1Data;
const settings = scenario.settings;
const objectives = scenario.objectives ?? [];
const repoRoot = process.cwd();

const event = settings.interferenceEvents?.[0];
const geolocation = settings.geolocation;

function objectiveById(id: string) {
  const objective = objectives.find((o) => o.id === id);

  expect(objective, `missing objective ${id}`).toBeDefined();

  return objective!;
}

/** ConditionType string literals parsed from the union in objective-types.ts */
function registeredConditionTypes(): Set<string> {
  const source = readFileSync(join(repoRoot, 'src', 'objectives', 'objective-types.ts'), 'utf8');
  const union = source.slice(source.indexOf('export type ConditionType'), source.indexOf('export type EquipmentRef'));
  const types = new Set<string>();
  const re = /\|\s*'([a-z0-9-]+)'/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(union)) !== null) {
    types.add(match[1]);
  }

  return types;
}

/** Deterministic PRNG so the noisy solves are reproducible */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;

    return state / 0xffffffff;
  };
}

describe('signal-hunter scenario 1: registration and identity', () => {
  it('is registered in the Signal Hunter campaign after the sandbox', () => {
    const ids = geolocationCampaignData.scenarios.map((s) => s.id);

    expect(ids).toContain('signal-hunter-sandbox');
    expect(ids).toContain('signal-hunter-scenario1');
    expect(ids.indexOf('signal-hunter-scenario1')).toBeGreaterThan(ids.indexOf('signal-hunter-sandbox'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is registered in the global SCENARIOS list', () => {
    const source = readFileSync(join(repoRoot, 'src', 'scenario-manager.ts'), 'utf8');

    expect(source).toContain("import { signalHunterScenario1Data } from '@app/campaigns/signal-hunter/scenario1';");
    expect(source.slice(source.indexOf('export const SCENARIOS'))).toContain('signalHunterScenario1Data,');
  });

  it('uses the campaign id/url/number conventions and a real mission type', () => {
    expect(scenario.id).toBe('signal-hunter-scenario1');
    expect(scenario.url).toBe(`signal-hunter/scenarios/${scenario.id}`);
    expect(scenario.number).toBe(1);
    expect(scenario.difficulty).toBe('advanced');
    expect(scenario.isDisabled).toBe(false);
    expect(scenario.missionType).not.toBe('Sandbox');
    expect(scenario.imageUrl).toBe(signalHunterSandboxData.imageUrl);
  });

  it('requires the sandbox, which resolves inside the campaign', () => {
    expect(scenario.prerequisiteScenarioIds).toEqual(['signal-hunter-sandbox']);
    for (const prereq of scenario.prerequisiteScenarioIds ?? []) {
      expect(
        geolocationCampaignData.scenarios.some((s) => s.id === prereq),
        prereq
      ).toBe(true);
    }
  });

  it('links the campaign-5 scenario-1 mission brief', () => {
    expect(settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-5/scenario-1?content-only=true&dark=true');
  });

  it('is not a copy of the sandbox', () => {
    const sandboxEvent = signalHunterSandboxData.settings.interferenceEvents![0];

    expect(event!.frequency).not.toBe(sandboxEvent.frequency);
    expect(event!.periodSeconds / event!.onSeconds).not.toBeCloseTo(sandboxEvent.periodSeconds / sandboxEvent.onSeconds, 2);
    expect(
      greatCircleKm({ lat: event!.emitter!.latitude, lon: event!.emitter!.longitude }, { lat: sandboxEvent.emitter!.latitude, lon: sandboxEvent.emitter!.longitude })
    ).toBeGreaterThan(100);
  });
});

describe('signal-hunter scenario 1: objectives', () => {
  it('uses only registered condition types', () => {
    const registry = registeredConditionTypes();

    expect(registry.size).toBeGreaterThan(50);
    for (const objective of objectives) {
      for (const condition of objective.conditions) {
        expect(registry.has(condition.type), `${objective.id}: ${condition.type}`).toBe(true);
      }
    }
  });

  it('has unique objective ids, resolvable prerequisites, NICE codes, and a valid station', () => {
    const ids = objectives.map((o) => o.id);
    const stationIds = new Set(settings.groundStations.map((gs) => gs.id));

    expect(objectives.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const objective of objectives) {
      expect(objective.nice?.length, objective.id).toBeGreaterThan(0);
      expect(objective.conditions.length, objective.id).toBeGreaterThan(0);
      expect(stationIds.has(objective.groundStation!), `${objective.id}: ${objective.groundStation}`).toBe(true);
      for (const prereq of objective.prerequisiteObjectiveIds ?? []) {
        expect(ids.includes(prereq), `${objective.id} -> ${prereq}`).toBe(true);
      }
    }
  });

  it('scores 80-110 points in total with a scored stretch objective', () => {
    const total = objectives.reduce((sum, o) => sum + (o.points ?? 0), 0);
    const stretch = objectives.filter((o) => o.isOptional);

    expect(total).toBeGreaterThanOrEqual(80);
    expect(total).toBeLessThanOrEqual(110);
    expect(stretch.length).toBe(1);
    expect(stretch[0].points).toBeGreaterThan(0);
  });

  it('walks detect -> characterize -> capture -> fix -> report', () => {
    expect(objectiveById('detect-interference').conditions[0].type).toBe('signal-detected');
    expect(objectiveById('characterize-duty-cycle').conditions[0].type).toBe('status-check');
    expect(objectiveById('collect-measurements').conditions[0].type).toBe('geolocation-measurements-collected');
    expect(objectiveById('compute-fix').conditions[0].type).toBe('geolocation-fix-accuracy');
    expect(objectiveById('compute-fix').prerequisiteObjectiveIds).toContain('collect-measurements');

    const report = objectiveById('file-incident-report');

    expect(report.conditions.map((c) => c.type)).toEqual(['status-check', 'status-check', 'status-check']);
    expect(report.conditions.map((c) => c.description)).toEqual(['Duty Cycle Reported', 'Occupied Bandwidth Reported', 'Polarization Reported']);
  });

  it('tightens the sandbox thresholds and demands more captures', () => {
    const sandboxFix = signalHunterSandboxData.objectives!.find((o) => o.id === 'compute-fix')!;
    const sandboxCaptures = signalHunterSandboxData.objectives!.find((o) => o.id === 'collect-measurements')!;
    const fix = objectiveById('compute-fix').conditions[0].params!;
    const captures = objectiveById('collect-measurements').conditions[0].params!;
    const stretch = objectiveById('refine-fix');

    expect(fix.maxErrorKm!).toBeLessThan(sandboxFix.conditions[0].params!.maxErrorKm!);
    expect(captures.minCount!).toBeGreaterThan(sandboxCaptures.conditions[0].params!.minCount!);
    expect(stretch.isOptional).toBe(true);
    expect(stretch.conditions.find((c) => c.type === 'geolocation-fix-accuracy')!.params!.maxErrorKm!).toBeLessThan(fix.maxErrorKm!);
  });

  it('references only ids the scenario declares', () => {
    for (const objective of objectives) {
      for (const condition of objective.conditions) {
        const params = condition.params ?? {};

        if (params.interferenceEventId !== undefined) {
          expect(params.interferenceEventId, objective.id).toBe(event!.id);
        }
        if (condition.type === 'signal-detected') {
          expect(params.signalId, objective.id).toBe(`INTERFERER-${event!.id}`);
        }
        if (condition.type === 'mission-brief-opened') {
          expect(params.boxId, objective.id).toBe('mission-brief');
        }
        if (condition.type === 'status-check') {
          expect(params.options!.length, objective.id).toBeGreaterThanOrEqual(2);
          expect(params.correctIndex!, objective.id).toBeLessThan(params.options!.length);
          if (params.documentLine) {
            expect(settings.workingDocument, `${objective.id} writes a documentLine`).toBeDefined();
          }
        }
      }
    }
  });
});

describe('signal-hunter scenario 1: RF and geolocation configuration', () => {
  it('declares exactly one emitter-bearing interference event and a geolocation pair', () => {
    expect(settings.interferenceEvents).toHaveLength(1);
    expect(event!.emitter).toBeDefined();
    expect(geolocation).toBeDefined();
  });

  it('puts the interferer inside a SENTRY-7 transponder passband on the transponder polarization', () => {
    const victim = settings.satellites.find((s) => s.noradId === event!.satelliteNoradId);

    expect(victim).toBeDefined();
    const transponder = victim!.transponders.find((tp) => event!.frequency >= tp.uplinkLowEdge && event!.frequency <= tp.uplinkHighEdge);

    expect(transponder, `no SENTRY-7 transponder covers ${event!.frequency / 1e6} MHz`).toBeDefined();
    expect(transponder!.polarization).toBe(event!.polarization);
    // Relayed downlink must sit in the analyzer's opening span (center 1364, span 30 MHz at LO 5150)
    const relayedIfHz = 5150e6 - (event!.frequency - 2.225e9);

    expect(Math.abs(relayedIfHz - 1364e6)).toBeLessThan(15e6);
    // And clear of the 8 MHz service carrier at 1365 MHz IF
    expect(Math.abs(relayedIfHz - 1365e6)).toBeGreaterThan((8e6 + event!.bandwidth) / 2);
  });

  it('victim is the geolocation primary and every collector is a loaded orbital satellite', () => {
    expect(geolocation!.primaryNoradId).toBe(event!.satelliteNoradId);
    const loaded = new Set(settings.satellites.map((s) => s.noradId));

    expect(loaded.has(geolocation!.primaryNoradId)).toBe(true);
    for (const noradId of geolocation!.adjacentNoradIds) {
      expect(loaded.has(noradId), `adjacent ${noradId}`).toBe(true);
      expect(settings.satellites.find((s) => s.noradId === noradId)).toBeInstanceOf(OrbitalSatellite);
    }
  });

  it('hides the emitter inside the area of interest with a sparse, timeable duty cycle', () => {
    const aoi = geolocation!.areaOfInterest;
    const truth = event!.emitter!;

    expect(truth.latitude).toBeGreaterThan(aoi.latMin);
    expect(truth.latitude).toBeLessThan(aoi.latMax);
    expect(truth.longitude).toBeGreaterThan(aoi.lonMin);
    expect(truth.longitude).toBeLessThan(aoi.lonMax);

    const windowS = geolocation!.captureWindowS ?? 10;

    expect(event!.onSeconds).toBeLessThan(event!.periodSeconds / 2);
    // At least two full captures fit inside one on-window
    expect(event!.onSeconds).toBeGreaterThanOrEqual(2 * windowS);
    expect(event!.duration).toBeGreaterThan(30 * 60);
  });
});

describe('signal-hunter scenario 1: accuracy targets are achievable', () => {
  const startMs = Date.parse(`${settings.scenarioStartDate}T${settings.scenarioStartWallTime}Z`);
  const primary = settings.satellites.find((s) => s.noradId === geolocation!.primaryNoradId) as OrbitalSatellite;
  const adjacent = settings.satellites.find((s) => s.noradId === geolocation!.adjacentNoradIds[0]) as OrbitalSatellite;
  const stationLoc = settings.groundStations[0].location;
  const station = { lat: stationLoc.latitude, lon: stationLoc.longitude, altKm: (stationLoc.elevation ?? 0) / 1000 };
  const truth = { lat: event!.emitter!.latitude, lon: event!.emitter!.longitude, altKm: event!.emitter!.altitudeKm ?? 0 };
  const windowS = geolocation!.captureWindowS ?? 10;

  /**
   * Capture midpoints for `perWindow` back-to-back captures started at the
   * top of each of the first `windows` on-windows - the only timing the
   * console accepts (interferer present for the whole integration).
   */
  function captureEpochs(perWindow: number, windows: number): number[] {
    const epochs: number[] = [];

    for (let w = 0; w < windows; w++) {
      for (let k = 0; k < perWindow; k++) {
        const startS = event!.startTime + w * event!.periodSeconds + k * windowS;

        // Legal against the scenario's own duty cycle: capture ends inside the on-window
        expect(k * windowS + windowS).toBeLessThanOrEqual(event!.onSeconds);
        epochs.push(startMs + (startS + windowS / 2) * 1000);
      }
    }

    return epochs;
  }

  function fixErrorKm(seed: number, perWindow: number, windows: number): number {
    const service = new GeolocationService(primary, adjacent, station, { rng: makeRng(seed) });
    const measurements: GeolocationMeasurement[] = captureEpochs(perWindow, windows).map((t, i) =>
      service.synthesizeMeasurement(truth, t, event!.frequency, geolocation!.tdoaSigmaS, geolocation!.fdoaSigmaHz, i + 1)
    );
    const fix = service.solve(measurements, geolocation!.areaOfInterest);

    expect(fix).not.toBeNull();
    expect(fix!.isConverged).toBe(true);

    return greatCircleKm({ lat: fix!.lat, lon: fix!.lon }, truth);
  }

  it('the scenario epoch parses and both satellites are above the horizon', () => {
    expect(Number.isFinite(startMs)).toBe(true);
    expect(primary).toBeInstanceOf(OrbitalSatellite);
    expect(adjacent).toBeInstanceOf(OrbitalSatellite);
  });

  it('the minimum capture count meets the primary fix threshold', () => {
    const minCount = objectiveById('collect-measurements').conditions[0].params!.minCount!;
    const maxErrorKm = objectiveById('compute-fix').conditions[0].params!.maxErrorKm!;
    const perWindow = Math.floor(event!.onSeconds / windowS);
    const windows = Math.ceil(minCount / perWindow);

    // Deterministic single run at the minimum count, spread over the fewest windows
    expect(fixErrorKm(20270901, perWindow, windows)).toBeLessThan(maxErrorKm);

    // And across noise draws: the great majority of minimum-count collections pass
    const trials = 25;
    const passes = Array.from({ length: trials }, (_, i) => fixErrorKm(1000 + i * 7919, perWindow, windows)).filter((err) => err < maxErrorKm).length;

    expect(passes).toBeGreaterThanOrEqual(Math.ceil(trials * 0.85));
  });

  it('the stretch threshold is reachable with the stretch capture count', () => {
    const stretch = objectiveById('refine-fix');
    const minCount = stretch.conditions.find((c) => c.type === 'geolocation-measurements-collected')!.params!.minCount!;
    const maxErrorKm = stretch.conditions.find((c) => c.type === 'geolocation-fix-accuracy')!.params!.maxErrorKm!;
    const perWindow = Math.floor(event!.onSeconds / windowS);
    const windows = Math.ceil(minCount / perWindow);

    const trials = 25;
    const errors = Array.from({ length: trials }, (_, i) => fixErrorKm(5000 + i * 104729, perWindow, windows)).sort((a, b) => a - b);

    // Median collection at the stretch count closes inside the stretch threshold
    expect(errors[Math.floor(trials / 2)]).toBeLessThan(maxErrorKm);
  });
});
