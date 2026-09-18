/**
 * Shared checks for the Campaign 5 (Signal Hunter) scenario validation
 * tests: the frequency-plan arithmetic every scenario has to satisfy and a
 * headless solve of a scenario's own geometry so graded accuracy and ellipse
 * thresholds are proven reachable with the configured measurement noise.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { InterferenceEventConfig } from '@app/interference/interference-manager';
import type { EvidenceFactId, Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { type GeolocationMeasurement, GeolocationService, greatCircleKm } from '@app/services/geolocation-service';
import { expect } from 'vitest';

export const LNB_LO_HZ = 5150e6;
export const TP1_TRANSLATION_HZ = 2.225e9;
export const SERVICE_CARRIER_IF_HZ = 1365e6;
export const SERVICE_CARRIER_BW_HZ = 8e6;

const repoRoot = process.cwd();

export const niceCatalog = new Set((JSON.parse(readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8')) as { codes: string[] }).codes);

/** ConditionType string literals parsed from the union in objective-types.ts */
export function registeredConditionTypes(): Set<string> {
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
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;

    return state / 0x100000000;
  };
}

export function objectiveOf(scenario: ScenarioData, id: string): Objective {
  const objective = scenario.objectives?.find((o) => o.id === id);

  expect(objective, `missing objective ${id}`).toBeDefined();

  return objective!;
}

export function eventOf(scenario: ScenarioData, id: string): InterferenceEventConfig {
  const event = scenario.settings.interferenceEvents?.find((e) => e.id === id);

  expect(event, `missing interference event ${id}`).toBeDefined();

  return event!;
}

/** Relayed IF of a transponder-path uplink event through TP-1 at the PA-22 LNB */
export function relayedIfHz(event: InterferenceEventConfig): number {
  return LNB_LO_HZ - (event.frequency - TP1_TRANSLATION_HZ);
}

/** IF of a terrestrial event received directly at the PA-22 LNB */
export function directIfHz(event: InterferenceEventConfig): number {
  return LNB_LO_HZ - event.frequency;
}

/** The scenario's opening analyzer window on PA-22 (center, span), Hz */
export function analyzerWindowHz(scenario: ScenarioData): { centerHz: number; spanHz: number } {
  const analyzer = scenario.settings.groundStations[0].spectrumAnalyzers?.[0];

  expect(analyzer?.centerFrequency).toBeDefined();
  expect(analyzer?.span).toBeDefined();

  return { centerHz: analyzer!.centerFrequency as number, spanHz: analyzer!.span as number };
}

/** A carrier of `bandwidthHz` at `ifHz` sits inside the analyzer span and clear of the service carrier */
export function expectIfOnTheTrace(scenario: ScenarioData, ifHz: number, bandwidthHz: number, label: string): void {
  const { centerHz, spanHz } = analyzerWindowHz(scenario);

  expect(Math.abs(ifHz - centerHz) + bandwidthHz / 2, `${label}: inside the analyzer span`).toBeLessThanOrEqual(spanHz / 2);
  expect(Math.abs(ifHz - SERVICE_CARRIER_IF_HZ), `${label}: clear of the service carrier`).toBeGreaterThan((SERVICE_CARRIER_BW_HZ + bandwidthHz) / 2);
}

/** A transponder-path event routes through a SENTRY-7 transponder on its polarization */
export function expectRoutedThroughTp1(scenario: ScenarioData, event: InterferenceEventConfig): void {
  expect(event.path ?? 'transponder').toBe('transponder');
  const victim = scenario.settings.satellites.find((s) => s.noradId === event.satelliteNoradId);

  expect(victim, `${event.id}: victim satellite loaded`).toBeDefined();
  const transponder = victim!.transponders.find((tp) => event.frequency >= tp.uplinkLowEdge && event.frequency <= tp.uplinkHighEdge);

  expect(transponder, `${event.id}: no transponder covers ${event.frequency / 1e6} MHz`).toBeDefined();
  expect(transponder!.polarization).toBe(event.polarization);
  expect(event.emitter, `${event.id}: emitter ground truth`).toBeDefined();
  expectIfOnTheTrace(scenario, relayedIfHz(event), event.bandwidth, event.id);
}

export function expectInsideAreaOfInterest(scenario: ScenarioData, event: InterferenceEventConfig): void {
  const aoi = scenario.settings.geolocation!.areaOfInterest;
  const truth = event.emitter!;

  expect(truth.latitude).toBeGreaterThan(aoi.latMin);
  expect(truth.latitude).toBeLessThan(aoi.latMax);
  expect(truth.longitude).toBeGreaterThan(aoi.lonMin);
  expect(truth.longitude).toBeLessThan(aoi.lonMax);
}

/** Every objective: unique ids, resolvable prerequisites, catalogued NICE codes, PA-22, registered condition types */
export function expectWellFormedObjectives(scenario: ScenarioData, totalPoints: number): void {
  const objectives = scenario.objectives ?? [];
  const ids = objectives.map((o) => o.id);
  const registry = registeredConditionTypes();
  const stationIds = new Set(scenario.settings.groundStations.map((gs) => gs.id));

  expect(registry.size).toBeGreaterThan(50);
  expect(new Set(ids).size).toBe(ids.length);
  for (const objective of objectives) {
    expect(objective.points, objective.id).toBeGreaterThan(0);
    expect(objective.nice?.length, objective.id).toBeGreaterThan(0);
    for (const code of objective.nice ?? []) expect(niceCatalog.has(code), `${objective.id}: ${code}`).toBe(true);
    expect(stationIds.has(objective.groundStation!), `${objective.id}: ${objective.groundStation}`).toBe(true);
    for (const prereq of objective.prerequisiteObjectiveIds ?? []) expect(ids.includes(prereq), `${objective.id} -> ${prereq}`).toBe(true);
    expect(objective.conditions.length, objective.id).toBeGreaterThan(0);
    for (const condition of objective.conditions) {
      expect(registry.has(condition.type), `${objective.id}: ${condition.type}`).toBe(true);
      const params = condition.params ?? {};

      if (condition.type === 'status-check') {
        expect(params.options!.length, objective.id).toBeGreaterThanOrEqual(2);
        expect(params.correctIndex!, objective.id).toBeLessThan(params.options!.length);
        if (params.documentLine) expect(scenario.settings.workingDocument, `${objective.id} writes a documentLine`).toBeDefined();
      }
      if (params.interferenceEventId !== undefined) eventOf(scenario, params.interferenceEventId);
      if (condition.type === 'signal-detected') {
        expect(params.signalId!.startsWith('INTERFERER-'), `${objective.id}: ${params.signalId}`).toBe(true);
        eventOf(scenario, params.signalId!.slice('INTERFERER-'.length));
      }
    }
  }
  // Titles must not be substrings of any other objective's title or description
  // (the e2e checklist locator matches on the whole item text).
  for (const objective of objectives) {
    for (const other of objectives) {
      if (other === objective) continue;
      expect(`${other.title} ${other.description}`.toLowerCase().includes(objective.title.toLowerCase()), `title "${objective.title}" appears in ${other.id}`).toBe(false);
    }
  }
  expect(objectives.reduce((sum, o) => sum + o.points, 0)).toBe(totalPoints);
}

/** Indices of the decision options whose correctWhen rule holds under `facts` */
export function correctOptionsUnder(objective: Objective, facts: Partial<Record<EvidenceFactId, boolean>>): number[] {
  const decision = objective.conditions.find((c) => c.type === 'decision');

  expect(decision, `${objective.id}: decision`).toBeDefined();
  const read = (id: EvidenceFactId): boolean => facts[id] ?? false;
  const holds = (rule: { fact?: EvidenceFactId; is?: boolean; all?: unknown[]; any?: unknown[] }): boolean => {
    if (rule.fact !== undefined) return read(rule.fact) === rule.is;
    if (rule.all) return (rule.all as (typeof rule)[]).every(holds);
    return (rule.any as (typeof rule)[]).some(holds);
  };

  return decision!.params!.decisionOptions!.map((o, index) => (o.correctWhen && holds(o.correctWhen as never) ? index : -1)).filter((index) => index >= 0);
}

export interface HeadlessSolve {
  errorKm: number;
  semiMajorKm: number | null;
  isConverged: boolean;
  captures: number;
}

/**
 * Capture midpoints (ms) for `count` captures on an event, timed the way the
 * console accepts them: for a duty-cycled event, back to back from the top of
 * successive on-windows; for a continuous one, `spacingS` apart from the
 * envelope start so the FDOA lines rotate between captures.
 */
export function captureEpochsMs(scenario: ScenarioData, event: InterferenceEventConfig, count: number, spacingS = 120): number[] {
  const startMs = Date.parse(`${scenario.settings.scenarioStartDate}T${scenario.settings.scenarioStartWallTime}Z`);
  const windowS = scenario.settings.geolocation!.captureWindowS ?? 10;
  const epochs: number[] = [];

  expect(Number.isFinite(startMs)).toBe(true);
  if (event.onSeconds >= event.periodSeconds) {
    for (let i = 0; i < count; i++) epochs.push(startMs + (event.startTime + i * spacingS + windowS / 2) * 1000);
    return epochs;
  }
  const perWindow = Math.floor(event.onSeconds / windowS);

  expect(perWindow, `${event.id}: at least one capture fits an on-window`).toBeGreaterThanOrEqual(1);
  for (let w = 0; epochs.length < count; w++) {
    for (let k = 0; k < perWindow && epochs.length < count; k++) {
      const startS = event.startTime + w * event.periodSeconds + k * windowS;

      expect(startS + windowS, `${event.id}: capture ends inside its envelope`).toBeLessThanOrEqual(event.startTime + event.duration);
      epochs.push(startMs + (startS + windowS / 2) * 1000);
    }
  }
  return epochs;
}

/** Solve the scenario's own geometry headlessly for one event with `count` captures */
export function solveHeadless(scenario: ScenarioData, event: InterferenceEventConfig, count: number, seed: number, spacingS = 120): HeadlessSolve {
  const geolocation = scenario.settings.geolocation!;
  const primary = scenario.settings.satellites.find((s) => s.noradId === geolocation.primaryNoradId) as OrbitalSatellite;
  const adjacent = scenario.settings.satellites.find((s) => s.noradId === geolocation.adjacentNoradIds[0]) as OrbitalSatellite;
  const stationLoc = scenario.settings.groundStations[0].location;
  const station = { lat: stationLoc.latitude, lon: stationLoc.longitude, altKm: (stationLoc.elevation ?? 0) / 1000 };
  const truth = { lat: event.emitter!.latitude, lon: event.emitter!.longitude, altKm: event.emitter!.altitudeKm ?? 0 };

  expect(primary).toBeInstanceOf(OrbitalSatellite);
  expect(adjacent).toBeInstanceOf(OrbitalSatellite);
  const service = new GeolocationService(primary, adjacent, station, { rng: makeRng(seed) });
  const measurements: GeolocationMeasurement[] = captureEpochsMs(scenario, event, count, spacingS).map((t, i) =>
    service.synthesizeMeasurement(truth, t, event.frequency, geolocation.tdoaSigmaS, geolocation.fdoaSigmaHz, i + 1)
  );
  const fix = service.solve(measurements, geolocation.areaOfInterest);

  expect(fix).not.toBeNull();

  return {
    errorKm: greatCircleKm({ lat: fix!.lat, lon: fix!.lon }, truth),
    semiMajorKm: fix!.errorEllipse?.semiMajorKm ?? null,
    isConverged: fix!.isConverged,
    captures: measurements.length,
  };
}

/** Deterministic solve plus a pass rate across noise draws */
export function expectReachable(
  scenario: ScenarioData,
  event: InterferenceEventConfig,
  count: number,
  passes: (solve: HeadlessSolve) => boolean,
  opts: { trials?: number; minPassRate?: number; spacingS?: number } = {}
): void {
  const { trials = 25, minPassRate = 0.85, spacingS = 120 } = opts;
  const first = solveHeadless(scenario, event, count, 20270901, spacingS);

  expect(first.isConverged, `${event.id}: converged`).toBe(true);
  expect(passes(first), `${event.id}: deterministic solve from ${count} captures (error ${first.errorKm.toFixed(1)} km, ellipse ${first.semiMajorKm?.toFixed(1)} km)`).toBe(true);
  const passed = Array.from({ length: trials }, (_, i) => solveHeadless(scenario, event, count, 1000 + i * 7919, spacingS)).filter(passes).length;

  expect(passed, `${event.id}: pass rate from ${count} captures`).toBeGreaterThanOrEqual(Math.ceil(trials * minPassRate));
}
