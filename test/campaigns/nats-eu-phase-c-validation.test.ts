/**
 * nats-eu Phase C / Phase E validation gate (scenarios 9-16, the qualified
 * tier).
 *
 * Same rule as the Phase B harness: RF numbers are authored against this file,
 * not the scenario file. Every threshold baked into S9-S12 is asserted here
 * against the real chain (SGP4 -> program-track pedestal -> RF front end ->
 * receiver C/N) so an uncompletable scenario fails CI rather than a playtest.
 *
 * What is different from Phase B: every scenario has its own epoch and its own
 * scenario-local satellites (satellites.ts factories), so the harness derives
 * the clock from `settings.scenarioStartDate` / `scenarioStartWallTime` and
 * flies each pass with that scenario's own satellite list and station config.
 *
 * Failure classes covered:
 *
 * 1. WIRING - ids, urls, prerequisite chain, mission brief, NICE codes.
 * 2. REACHABILITY - every condition names a mechanic the scenario enables and
 *    every referenced id (contact, station, command, space event, signal)
 *    exists in that scenario's settings or satellites.
 * 3. PLAN / WINDOW GEOMETRY - the S9 day plan is solvable; S10/S12 command
 *    windows sit inside the first pass of the target bird; the S11 element
 *    sets both propagate and put the pass where the brief says.
 * 4. LINK BUDGET - the worksheet built from the published numbers equals
 *    `expectedCNRDb`, and the live chain delivers the required margin.
 * 5. PASS FLIGHTS - every `receiver-snr-threshold` and `signal-detected` in
 *    the tier is met under real program-track with authoring margin.
 * 6. STAGED PHYSICS (phase 16, S13-S16) - the keyhole crater and the degraded
 *    LNB shortfall (S13), the rain fade and the ice curve (S14), the rotation
 *    tempo (S15) and the fault timing (S16) do what the briefs say they do.
 */

import { type Degrees, Tle, type TleLine1, type TleLine2 } from 'ootk';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MINUTE_MS = 60_000;
const TICK_HZ = 60;
/**
 * Authoring margin over a receiver-snr-threshold (dB): the settled peak must
 * clear the threshold by this much. An objective that also grades
 * `link-margin-met` is held to its own `minMarginDb` instead, because that
 * number is the scenario's stated design margin (S10 is a 1 dB pass by intent).
 */
const SNR_MARGIN_DB = 2;
/** A usable decode window: seconds with lock at threshold + half the margin. */
const HOLD_S = 60;

let simNowMs = Date.UTC(2027, 2, 17, 6, 10, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

let simSatellites: import('@app/equipment/satellite/orbital-satellite').OrbitalSatellite[] = [];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: simSatellites,
      getSatsByAzEl: (az: number, el: number) => simSatellites.filter((sat) => Math.abs(sat.az - az) <= 1 && Math.abs(sat.el - el) <= 1),
      getSatByNoradId: (noradId: number) => simSatellites.find((s) => s.noradId === noradId) ?? null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { galwayGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { createMeridianSar3, type MeridianTle } from '@app/campaigns/nats-eu/satellites';
import { natsEuScenario9Data } from '@app/campaigns/nats-eu/scenario9';
import { natsEuScenario10Data } from '@app/campaigns/nats-eu/scenario10';
import { natsEuScenario11Data } from '@app/campaigns/nats-eu/scenario11';
import { natsEuScenario12Data } from '@app/campaigns/nats-eu/scenario12';
import { natsEuScenario13Data } from '@app/campaigns/nats-eu/scenario13';
import { natsEuScenario14Data } from '@app/campaigns/nats-eu/scenario14';
import { natsEuScenario15Data } from '@app/campaigns/nats-eu/scenario15';
import { natsEuScenario16Data } from '@app/campaigns/nats-eu/scenario16';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { Receiver } from '@app/equipment/receiver/receiver';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService } from '@app/services/pass-planner-service';
import type { MHz } from '@app/types';
import { WeatherManager } from '@app/weather/weather-manager';

const PHASE_C: ScenarioData[] = [
  natsEuScenario9Data,
  natsEuScenario10Data,
  natsEuScenario11Data,
  natsEuScenario12Data,
  natsEuScenario13Data,
  natsEuScenario14Data,
  natsEuScenario15Data,
  natsEuScenario16Data,
];

/** The settings fields this harness reads, typed loosely on purpose. */
interface PhaseCSettings {
  groundStations: GroundStationConfig[];
  satellites: OrbitalSatellite[];
  scenarioStartDate: string;
  scenarioStartWallTime: string;
  missionBriefUrl?: string;
  contactSchedule?: {
    stationIds: string[];
    requiredPriorityAtOrAbove?: number;
    contacts: Array<{ id: string; priority: number; windowStartS: number; windowEndS: number }>;
  };
  linkBudget?: { expectedCNRDb: number; toleranceDb?: number; thresholdCNRDb: number; requiredMarginDb?: number };
  commanding?: { targetNoradId: number; windowStartS: number; windowEndS: number; commands?: Array<{ id: string }> };
  spaceEvents?: Array<{ id: string; satelliteNoradId: number; initialTle?: MeridianTle; newTle: MeridianTle }>;
  workingDocument?: { title: string };
  weatherEvents?: Array<{ id: string; groundStationId: string; type: string; severity: string; startTime: number; duration: number; rainRateMmPerHour?: number }>;
  hardwareFaultEvents?: Array<{
    id: string;
    groundStationId: string;
    target?: string;
    startTime: number;
    duration?: number;
    params?: { startTemperatureC?: number; deltaC?: number };
  }>;
}

const settingsOf = (scenario: ScenarioData): PhaseCSettings => scenario.settings as unknown as PhaseCSettings;

/** Scenario clock start in Unix ms, derived from the scenario's own epoch fields. */
function startMsOf(scenario: ScenarioData): number {
  const { scenarioStartDate, scenarioStartWallTime } = settingsOf(scenario);
  const ms = Date.parse(`${scenarioStartDate}T${scenarioStartWallTime}Z`);

  expect(Number.isFinite(ms), `${scenario.id}: unparseable epoch`).toBe(true);

  return ms;
}

function satOf(scenario: ScenarioData, noradId: number): OrbitalSatellite {
  const sat = settingsOf(scenario).satellites.find((s) => s.noradId === noradId);

  expect(sat, `${scenario.id}: no satellite ${noradId}`).toBeDefined();

  return sat!;
}

/** First pass of `sat` after the scenario clock starts, 0 deg horizon (author-passes convention). */
function firstPass(scenario: ScenarioData, sat: OrbitalSatellite) {
  simNowMs = startMsOf(scenario);
  const pass = new PassPlannerService().getPasses(sat, simNowMs, { horizonHours: 2, minElevation: 0 as Degrees })[0];

  expect(pass, `${scenario.id}: ${sat.name} has no pass within 2 h`).toBeDefined();

  return pass;
}

describe('nats-eu Phase C: scenario wiring', () => {
  it('registers scenarios 9-16 with unique ids, urls, numbers and a prerequisite chain', () => {
    const ids = PHASE_C.map((s) => s.id);

    expect(ids).toEqual([
      'nats-eu-scenario9',
      'nats-eu-scenario10',
      'nats-eu-scenario11',
      'nats-eu-scenario12',
      'nats-eu-scenario13',
      'nats-eu-scenario14',
      'nats-eu-scenario15',
      'nats-eu-scenario16',
    ]);
    expect(new Set(ids).size).toBe(ids.length);

    const expectedPrereq = ['nats-eu-scenario8', ...ids.slice(0, -1)];

    PHASE_C.forEach((scenario, i) => {
      expect(scenario.prerequisiteScenarioIds, scenario.id).toEqual([expectedPrereq[i]]);
      expect(scenario.url).toBe(`nats-eu/scenarios/${scenario.id}`);
      expect(scenario.number).toBe(9 + i);
      // S9-S12 are the first qualified half; S13-S16 are advanced (phase-13 plan).
      expect(scenario.difficulty).toBe(scenario.number <= 12 ? 'intermediate' : 'advanced');
      expect(scenario.isDisabled).toBe(false);
    });
  });

  it.each(PHASE_C.map((s) => [s.id, s] as const))('%s sets missionBriefUrl (checklist is hidden without it)', (_id, scenario) => {
    const url = settingsOf(scenario).missionBriefUrl;

    expect(url).toBeTruthy();
    expect(url).toContain(`campaign-2/scenario-${scenario.number}`);
  });

  it.each(PHASE_C.map((s) => [s.id, s] as const))('%s objectives carry NICE codes, conditions and in-scenario prerequisites', (_id, scenario) => {
    const ids = new Set(scenario.objectives.map((o) => o.id));

    expect(scenario.objectives.length).toBeGreaterThan(0);
    for (const objective of scenario.objectives) {
      expect(objective.nice?.length, objective.id).toBeGreaterThan(0);
      expect(objective.conditions.length, objective.id).toBeGreaterThan(0);
      for (const prereq of objective.prerequisiteObjectiveIds ?? []) {
        expect(ids.has(prereq), `${objective.id} -> ${prereq}`).toBe(true);
      }
    }
  });
});

describe('nats-eu Phase C: every condition is reachable', () => {
  const REQUIRES_BLOCK: Record<string, keyof PhaseCSettings> = {
    'link-budget-computed': 'linkBudget',
    'link-margin-met': 'linkBudget',
    'uplink-doppler-comp-enabled': 'commanding',
    'command-acknowledged': 'commanding',
    'contact-assigned': 'contactSchedule',
    'contact-plan-valid': 'contactSchedule',
    'ephemeris-updated': 'spaceEvents',
  };

  it.each(PHASE_C.map((s) => [s.id, s] as const))('%s enables every mechanic it grades', (_id, scenario) => {
    const settings = settingsOf(scenario);

    for (const objective of scenario.objectives) {
      for (const condition of objective.conditions) {
        const where = `${objective.id}: ${condition.type}`;
        const required = REQUIRES_BLOCK[condition.type];

        if (required) {
          expect(settings[required], `${where} needs settings.${required}`).toBeDefined();
        }
        if (condition.type === 'mission-brief-opened') {
          expect(settings.missionBriefUrl, where).toBeTruthy();
        }
        // A status-check that writes a Working Document line needs the document.
        if (condition.type === 'status-check' && (condition.params as { documentLine?: string })?.documentLine) {
          expect(settings.workingDocument, `${where} writes a documentLine without settings.workingDocument`).toBeDefined();
        }
      }
    }
  });

  it.each(PHASE_C.map((s) => [s.id, s] as const))('%s references only ids that exist', (_id, scenario) => {
    const settings = settingsOf(scenario);
    const stationIds = new Set(settings.groundStations.map((gs) => gs.id));
    const signalIds = new Set(settings.satellites.flatMap((sat) => sat.transponders.map((tp) => tp.beacon?.signalId).filter(Boolean)));

    for (const objective of scenario.objectives) {
      const where = `${objective.id}`;

      // The objective's own station must be one the scenario loads.
      expect(stationIds.has(objective.groundStation), `${where}: unknown groundStation ${objective.groundStation}`).toBe(true);

      for (const condition of objective.conditions) {
        const params = (condition.params ?? {}) as Record<string, string | number>;

        if (params.contactId !== undefined) {
          expect(
            settings.contactSchedule?.contacts.map((c) => c.id),
            where
          ).toContain(params.contactId);
        }
        if (params.groundStationId !== undefined) {
          expect(stationIds.has(String(params.groundStationId)), `${where}: unknown station ${params.groundStationId}`).toBe(true);
          if (condition.type === 'contact-assigned') {
            expect(settings.contactSchedule?.stationIds, where).toContain(params.groundStationId);
          }
        }
        if (params.commandId !== undefined) {
          expect(
            settings.commanding?.commands?.map((c) => c.id),
            where
          ).toContain(params.commandId);
        }
        if (params.eventId !== undefined && condition.type === 'ephemeris-updated') {
          expect(
            settings.spaceEvents?.map((e) => e.id),
            where
          ).toContain(params.eventId);
        }
        if (params.signalId !== undefined) {
          expect(signalIds.has(String(params.signalId)), `${where}: no satellite transmits ${params.signalId}`).toBe(true);
        }
        if (params.boxId !== undefined) {
          expect(params.boxId, where).toBe('mission-brief');
        }
      }
    }

    // A commanding target must be a bird in the scenario's sky.
    if (settings.commanding) {
      expect(settings.satellites.map((s) => s.noradId)).toContain(settings.commanding.targetNoradId);
    }
    for (const event of settings.spaceEvents ?? []) {
      expect(
        settings.satellites.map((s) => s.noradId),
        event.id
      ).toContain(event.satelliteNoradId);
    }
  });
});

describe('nats-eu Phase C: plan, window and ephemeris geometry', () => {
  /**
   * Backtracking allocation of the required contacts across the stations with
   * no same-station overlap, honouring the fixed assignments the objective's
   * `contact-assigned` conditions demand. Returns null when no plan exists.
   */
  function solvePlan(contacts: Array<{ id: string; windowStartS: number; windowEndS: number }>, stationIds: string[], fixed: Map<string, string>): Map<string, string> | null {
    const plan = new Map<string, string>();
    const overlaps = (a: (typeof contacts)[number], b: (typeof contacts)[number]) => a.windowStartS < b.windowEndS && b.windowStartS < a.windowEndS;
    const place = (i: number): boolean => {
      if (i === contacts.length) return true;
      const contact = contacts[i];
      const candidates = fixed.has(contact.id) ? [fixed.get(contact.id)!] : stationIds;

      for (const station of candidates) {
        const clash = contacts.some((other) => plan.get(other.id) === station && overlaps(contact, other));

        if (!clash) {
          plan.set(contact.id, station);
          if (place(i + 1)) return true;
          plan.delete(contact.id);
        }
      }

      return false;
    };

    return place(0) ? plan : null;
  }

  /** The demanded `contact-assigned` station for every contact an objective names. */
  function demandedAssignments(scenario: ScenarioData): Map<string, string> {
    const fixed = new Map<string, string>();

    for (const objective of scenario.objectives) {
      for (const condition of objective.conditions) {
        if (condition.type === 'contact-assigned') {
          const p = condition.params as { contactId: string; groundStationId: string };

          fixed.set(p.contactId, p.groundStationId);
        }
      }
    }

    return fixed;
  }

  it('S9 day plan is solvable with the demanded assignments; the P3 contacts are droppable', () => {
    const schedule = settingsOf(natsEuScenario9Data).contactSchedule!;
    const requiredAtOrAbove = schedule.requiredPriorityAtOrAbove ?? Number.POSITIVE_INFINITY;
    const required = schedule.contacts.filter((c) => c.priority <= requiredAtOrAbove);
    const optional = schedule.contacts.filter((c) => c.priority > requiredAtOrAbove);
    const fixed = demandedAssignments(natsEuScenario9Data);

    // Two conflict pairs across two sites: four P1/P2 contacts, two P3 spares.
    expect(required.map((c) => c.id).sort()).toEqual(['M-SAR1-GW', 'M-SAR1-SH', 'M-SAR2-GW', 'M-SAR2-SH']);
    expect(optional.map((c) => c.id).sort()).toEqual(['M-SAR1-GW-2', 'M-SAR2-SH-2']);

    const plan = solvePlan(required, schedule.stationIds, fixed);

    expect(plan, 'no conflict-free allocation of the P1/P2 contacts exists').not.toBeNull();
    // The plan validates even if both P3 contacts are left unassigned...
    expect(optional.every((c) => !plan!.has(c.id))).toBe(true);
    // ...and can also absorb them, so keeping them is a real choice.
    expect(solvePlan(schedule.contacts, schedule.stationIds, fixed)).not.toBeNull();
  });

  it.each(PHASE_C.filter((s) => settingsOf(s).contactSchedule).map((s) => [s.id, s] as const))(
    '%s: the required contacts allocate without conflict under the demanded assignments',
    (_id, scenario) => {
      const schedule = settingsOf(scenario).contactSchedule!;
      const requiredAtOrAbove = schedule.requiredPriorityAtOrAbove ?? Number.POSITIVE_INFINITY;
      const required = schedule.contacts.filter((c) => c.priority <= requiredAtOrAbove);
      const fixed = demandedAssignments(scenario);

      for (const [contactId, stationId] of fixed) {
        expect(
          schedule.contacts.map((c) => c.id),
          `demanded contact ${contactId}`
        ).toContain(contactId);
        expect(schedule.stationIds, `demanded station ${stationId}`).toContain(stationId);
      }
      expect(solvePlan(required, schedule.stationIds, fixed), 'no conflict-free allocation of the required contacts exists').not.toBeNull();
    }
  );

  it('S16 slipped pass: the two Galway windows overlap, and the plan is only valid with the slipped half dropped', () => {
    const schedule = settingsOf(natsEuScenario16Data).contactSchedule!;
    const byId = new Map(schedule.contacts.map((c) => [c.id, c]));
    const sar1 = byId.get('C-SAR1-GW')!;
    const slipped = byId.get('C-SAR2-GW')!;
    const requiredAtOrAbove = schedule.requiredPriorityAtOrAbove ?? 1;

    // The slip: SAR-2's Galway window overlaps the SAR-1 command contact.
    expect(sar1.windowStartS < slipped.windowEndS && slipped.windowStartS < sar1.windowEndS).toBe(true);
    // The slipped half is not required, so leaving it unassigned validates the plan...
    expect(slipped.priority).toBeGreaterThan(requiredAtOrAbove);
    // ...while assigning it anywhere conflicts with a required contact.
    const fixed = demandedAssignments(natsEuScenario16Data);
    const withSlipped = schedule.contacts.filter((c) => c.priority <= requiredAtOrAbove || c.id === 'C-SAR2-GW');

    for (const station of schedule.stationIds) {
      const forced = new Map(fixed).set('C-SAR2-GW', station);

      expect(solvePlan(withSlipped, schedule.stationIds, forced), `slipped half on ${station} should conflict`).toBeNull();
    }
  });

  it.each([
    ['nats-eu-scenario10', natsEuScenario10Data],
    ['nats-eu-scenario12', natsEuScenario12Data],
    ['nats-eu-scenario15', natsEuScenario15Data],
    ['nats-eu-scenario16', natsEuScenario16Data],
  ] as const)('%s command window sits inside the first pass of the target bird', (_id, scenario) => {
    const { commanding } = settingsOf(scenario);
    const start = startMsOf(scenario);
    const pass = firstPass(scenario, satOf(scenario, commanding!.targetNoradId));
    const aosS = (pass.aosMs - start) / 1000;
    const losS = (pass.losMs - start) / 1000;

    expect(commanding!.windowStartS, `window opens before AOS (${aosS.toFixed(0)} s)`).toBeGreaterThanOrEqual(aosS);
    expect(commanding!.windowEndS, `window closes after LOS (${losS.toFixed(0)} s)`).toBeLessThanOrEqual(losS);
    expect(commanding!.windowEndS - commanding!.windowStartS).toBeGreaterThan(120);
  });

  it('S11 injection and refined element sets both propagate and put the pass at T+19', () => {
    const scenario = natsEuScenario11Data;
    const event = settingsOf(scenario).spaceEvents![0];
    const start = startMsOf(scenario);
    const checksumOk = (line: string) => Tle.checksum(line as TleLine1 | TleLine2) === Number(line.at(-1));

    for (const [name, tle] of [
      ['initialTle', event.initialTle!],
      ['newTle', event.newTle],
    ] as const) {
      expect(checksumOk(tle.tle1), `${name} line 1 checksum`).toBe(true);
      expect(checksumOk(tle.tle2), `${name} line 2 checksum`).toBe(true);
    }

    // The scenario's own SAR-3 boots on the refined set; the coarse set is
    // what initialTle re-applies at load. Both must be flyable.
    simNowMs = start;
    const refined = firstPass(scenario, createMeridianSar3(event.newTle));
    const coarse = firstPass(scenario, createMeridianSar3(event.initialTle!));
    const refinedAosMin = (refined.aosMs - start) / MINUTE_MS;

    // 09:08:58Z from the 08:50 start (phase 16 moved the start 10 min earlier).
    expect(Math.abs(refinedAosMin - 19.0), `refined AOS at T+${refinedAosMin.toFixed(2)}`).toBeLessThan(0.25);
    expect(Math.abs(refined.maxEl - 31.6), `refined max el ${refined.maxEl.toFixed(1)}`).toBeLessThan(1.0);
    expect(Math.abs(coarse.aosMs - refined.aosMs), 'coarse vs refined AOS').toBeLessThan(60_000);
    expect(Math.abs(coarse.aosMs - refined.aosMs), 'the two sets must differ, or the load is a no-op').toBeGreaterThan(5_000);
    // The scenario satellite itself is on the refined set.
    expect(satOf(scenario, event.satelliteNoradId).ootkSatellite.tle2).toBe(event.newTle.tle2);
  });
});

/**
 * One worked pass per row. `objectiveIds` name the objectives whose
 * receiver-snr-threshold / signal-detected conditions this flight has to
 * satisfy, with the receiver tuned to `ifMHz`, flown from `stationId` (the
 * scenario's first station when omitted; phase 16 E1 lets S9 fly SAR-2 from
 * Shetland, so that flight is Shetland geometry, not Galway's with a label).
 */
interface Flight {
  scenario: ScenarioData;
  noradId: number;
  ifMHz: number;
  objectiveIds: string[];
  stationId?: string;
  /** Distinguishes variants of the same pass (rain, ice, a healthy station) in the cache. */
  variant?: string;
  /** Fly with this station config instead of the scenario's (S13: the healthy control). */
  station?: GroundStationConfig;
  /** Stage weather on the antenna before the pass (S14: rain rate, ice on the feed). */
  prepare?: (antenna: AntennaUIHeadless) => void;
  /**
   * Sample every frame, with no settle loop, between these minutes after the
   * scenario start - what the objectives manager sees at 60 Hz through a
   * transient the 1 Hz settled samples cannot resolve (S13's keyhole).
   */
  frameWindowMin?: [number, number];
}

const FLIGHTS: Flight[] = [
  { scenario: natsEuScenario9Data, noradId: 61701, ifMHz: 1414, objectiveIds: ['acquire-sar1', 'decode-the-standing-collect'] },
  { scenario: natsEuScenario9Data, noradId: 61702, ifMHz: 1370, objectiveIds: ['check-the-unattended-pass'] },
  { scenario: natsEuScenario9Data, noradId: 61702, ifMHz: 1370, stationId: 'SH-02', objectiveIds: ['acquire-sar2-from-shetland', 'decode-sar2-from-shetland'] },
  { scenario: natsEuScenario10Data, noradId: 61701, ifMHz: 1414, objectiveIds: ['acquire-low', 'pull-the-imagery'] },
  { scenario: natsEuScenario11Data, noradId: 61703, ifMHz: 1414, objectiveIds: ['first-acquisition', 'beacon-level'] },
  { scenario: natsEuScenario12Data, noradId: 61703, ifMHz: 1340, objectiveIds: ['acquire-sar3', 'first-video'] },
  // Phase E (S13-S16). Objectives graded only on maxCNRatio (the crater, the
  // fade) are listed so the reachability check passes; their physics is
  // asserted in the staged-physics block below.
  { scenario: natsEuScenario13Data, noradId: 61702, ifMHz: 1370, objectiveIds: ['fly-the-zenith-pass'] },
  { scenario: natsEuScenario13Data, noradId: 61701, ifMHz: 1414, objectiveIds: ['measure-sar1-at-galway'] },
  { scenario: natsEuScenario13Data, noradId: 61703, ifMHz: 1340, stationId: 'SH-02', objectiveIds: ['fly-the-collect-from-shetland'] },
  { scenario: natsEuScenario14Data, noradId: 61702, ifMHz: 1370, stationId: 'SH-02', objectiveIds: ['acquire-sar2-from-shetland', 'decode-the-collect-from-shetland'] },
  { scenario: natsEuScenario14Data, noradId: 61702, ifMHz: 1370, variant: 'rain', prepare: (antenna) => antenna.updateRainRate(30), objectiveIds: ['observe-the-galway-fade'] },
  { scenario: natsEuScenario14Data, noradId: 61701, ifMHz: 1414, objectiveIds: ['ride-it-out'] },
  { scenario: natsEuScenario15Data, noradId: 61701, ifMHz: 1414, objectiveIds: ['acquire-sar1', 'receive-on-the-retiring-key'] },
  { scenario: natsEuScenario15Data, noradId: 61702, ifMHz: 1370, objectiveIds: ['acquire-sar2', 'decode-on-the-new-traffic-key'] },
  { scenario: natsEuScenario16Data, noradId: 61701, ifMHz: 1414, objectiveIds: ['acquire-sar1-at-galway'] },
  { scenario: natsEuScenario16Data, noradId: 61702, ifMHz: 1370, stationId: 'SH-02', objectiveIds: ['check-the-shetland-pass'] },
];

/** WeatherManager's ice curve: maxDegradation * (1 - e^(-t / tau)) with the heater off. */
function iceAfterSeconds(severity: 'minor' | 'moderate' | 'severe', seconds: number): number {
  const config = WeatherManager.SEVERITY_CONFIG[severity];

  return config.maxDegradation_dB * (1 - Math.exp(-seconds / config.timeConstant_s));
}

/** Control flights for the staged-physics block: the same pass with a different station or weather. */
const CONTROL_FLIGHTS = {
  s13HealthyGalway: { scenario: natsEuScenario13Data, noradId: 61701, ifMHz: 1414, variant: 'healthy-lnb', station: galwayGroundStation, objectiveIds: [] } as Flight,
  s14DryGalway: { scenario: natsEuScenario14Data, noradId: 61702, ifMHz: 1370, variant: 'dry', objectiveIds: [] } as Flight,
  // The zenith pass at frame resolution through culmination (T+16.94), no settle loop.
  s13ZenithFrames: { scenario: natsEuScenario13Data, noradId: 61702, ifMHz: 1370, variant: 'frames', frameWindowMin: [16.4, 17.5], objectiveIds: [] } as Flight,
  s14IcedGalway: {
    scenario: natsEuScenario14Data,
    noradId: 61701,
    ifMHz: 1414,
    variant: 'iced',
    // Heater never on: ice accumulated from the sleet's onset (11:26) to culmination (11:49:43).
    prepare: (antenna) => antenna.updateIceAccumulation(iceAfterSeconds('severe', 1423)),
    objectiveIds: [],
  } as Flight,
};

interface Sample {
  tMin: number;
  cn: number;
  hasLock: boolean;
  /** Effective beacon power at RX_IF (what signal-detected compares), or null. */
  detect: Record<string, number>;
}

const flightCache = new Map<string, Sample[]>();
const flightKey = (f: Flight) => `${f.scenario.id}/${f.noradId}@${f.stationId ?? settingsOf(f.scenario).groundStations[0].id}${f.variant ? `#${f.variant}` : ''}`;

/** First pass of `sat` after the scenario clock starts, as seen from `station`. */
function firstPassFrom(scenario: ScenarioData, sat: OrbitalSatellite, station: GroundStationConfig) {
  simNowMs = startMsOf(scenario);
  const observer = observerFromLocation(station.location, station.id);
  const pass = new PassPlannerService().getPasses(sat, simNowMs, { horizonHours: 2, minElevation: 0 as Degrees, observer })[0];

  expect(pass, `${scenario.id}: ${sat.name} has no pass over ${station.id} within 2 h`).toBeDefined();

  return pass;
}

/**
 * Fly the flight's pass under real program-track with the scenario's own
 * station, satellites and clock. Builds the station's chain the way
 * GroundStation.createEquipment_ does (minus the canvas spectrum analyzer),
 * attaches the antenna to the station's location so it sees the sky from
 * there (phase 16 E1), samples settled C/N once per sim second, and memoises
 * the result so the threshold and link-budget tests share one flight.
 */
function fly(flight: Flight): Sample[] {
  const cached = flightCache.get(flightKey(flight));

  if (cached) return cached;

  const { scenario } = flight;
  const settings = settingsOf(scenario);
  const station = flight.station ?? (flight.stationId ? settings.groundStations.find((gs) => gs.id === flight.stationId) : settings.groundStations[0]);

  expect(station, `${scenario.id}: no station ${flight.stationId}`).toBeDefined();
  if (!station) throw new Error('unreachable');

  const sat = satOf(scenario, flight.noradId);
  const start = startMsOf(scenario);
  const pass = firstPassFrom(scenario, sat, station);

  simSatellites = settings.satellites;
  simNowMs = start;
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  // jsdom's HTMLMediaElement.play() returns undefined; the receiver re-attaches a
  // cached video feed when a lost signal comes back (the keyhole, the fade) and
  // chains .catch() on it. Nothing here needs playback.
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  document.body.innerHTML = '<div id="pc-fe"></div><div id="pc-rx"></div>';

  const antenna = new AntennaUIHeadless('pc-ant', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, station.antennasState![0], 1);
  antenna.attachStationLocation(station.location.latitude, station.location.longitude, station.location.elevation);
  const frontEnd = createRFFrontEnd('pc-fe', station.rfFrontEnds[0], 'standard');

  frontEnd.connectAntenna(antenna);
  antenna.attachRfFrontEnd(frontEnd);
  const receiver = new Receiver('pc-rx', [antenna], station.receivers![0], 1);

  receiver.connectRfFrontEnd(frontEnd);

  const modem = receiver.state.modems[0];

  modem.frequency = flight.ifMHz as MHz;
  flight.prepare?.(antenna);
  antenna.handleTrackingModeChange('program-track');
  antenna.handleTargetSatelliteChange(sat.noradId);

  const beaconIds = sat.transponders.map((tp) => tp.beacon?.signalId).filter((id): id is string => Boolean(id));
  const samples: Sample[] = [];
  const tickMs = 1000 / TICK_HZ;
  const fromMs = pass.aosMs - 30_000;
  const toMs = pass.losMs + 30_000;
  let tick = 0;

  const frameWindow = flight.frameWindowMin;

  for (simNowMs = fromMs; simNowMs <= toMs; simNowMs += tickMs, tick++) {
    for (const s of simSatellites) s.update();
    antenna.update();
    const tMinNow = (simNowMs - start) / MINUTE_MS;
    const everyFrame = frameWindow !== undefined && tMinNow >= frameWindow[0] && tMinNow <= frameWindow[1];

    if (everyFrame || tick % TICK_HZ === 0) {
      if (!everyFrame) {
        for (let s = 0; s < TICK_HZ && antenna.state.isSlewing; s++) antenna.update();
      }
      frontEnd.update();
      const info = receiver.getSignalsInBandwidth(modem);
      const pathGain = frontEnd.couplerModule.signalPathManager.getTotalGainTo(TapPoint.RX_IF);
      const detect: Record<string, number> = {};

      for (const id of beaconIds) {
        const sig = antenna.state.rxSignalsIn.find((s) => s.signalId === id);

        if (sig) detect[id] = sig.power + pathGain;
      }
      samples.push({
        tMin: (simNowMs - start) / MINUTE_MS,
        cn: Number.isFinite(info.cnRatio_dB) ? info.cnRatio_dB : -Infinity,
        hasLock: info.hasLock,
        detect,
      });
    }
  }

  EventBus.destroy();
  vi.restoreAllMocks();
  document.body.innerHTML = '';

  const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));
  const above = (db: number) => samples.filter((s) => s.cn >= db).length;
  const beaconPeaks = beaconIds.map((id) => `${id} ${Math.max(...samples.map((s) => s.detect[id] ?? -Infinity)).toFixed(1)} dBm`).join(', ');

  // Surfaces in the vitest output when a flight's assertions fail.
  console.log(
    `MEASURE ${scenario.id} ${sat.name} from ${station.id}${flight.variant ? ` (${flight.variant})` : ''} IF ${flight.ifMHz} MHz: AOS T+${((pass.aosMs - start) / MINUTE_MS).toFixed(2)} ` +
      `max el ${pass.maxEl.toFixed(1)} LOS T+${((pass.losMs - start) / MINUTE_MS).toFixed(2)}; ` +
      `peak C/N ${peak.cn.toFixed(2)} dB at T+${peak.tMin.toFixed(2)}; ` +
      `s>=7: ${above(7)}, s>=8: ${above(8)}, s>=9: ${above(9)}, s>=10: ${above(10)}, s>=11: ${above(11)}, s>=12: ${above(12)}; ` +
      `detect peaks: ${beaconPeaks}`
  );

  flightCache.set(flightKey(flight), samples);

  return samples;
}

describe('nats-eu Phase C: pass flights meet every receiver threshold', () => {
  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('every snr / detection condition in S9-S12 belongs to a flown pass', () => {
    for (const scenario of PHASE_C) {
      const flown = new Set(FLIGHTS.filter((f) => f.scenario === scenario).flatMap((f) => f.objectiveIds));

      for (const objective of scenario.objectives) {
        const graded = objective.conditions.some((c) => c.type === 'receiver-snr-threshold' || c.type === 'signal-detected');

        if (graded) {
          expect(flown.has(objective.id), `${scenario.id}/${objective.id} is graded on RF but never flown`).toBe(true);
        }
      }
    }
  });

  it.each(FLIGHTS.map((f) => [flightKey(f), f] as const))('%s: thresholds met with authoring margin', (_key, flight) => {
    const samples = fly(flight);
    const objectives = flight.scenario.objectives.filter((o) => flight.objectiveIds.includes(o.id));
    let checks = 0;

    for (const objective of objectives) {
      const designMargin = (objective.conditions.find((c) => c.type === 'link-margin-met')?.params as { minMarginDb?: number } | undefined)?.minMarginDb;
      const marginDb = designMargin ?? SNR_MARGIN_DB;

      for (const condition of objective.conditions) {
        const params = condition.params as { minCNRatio?: number; maxCNRatio?: number; signalId?: string; minPower?: number };

        if (condition.type === 'receiver-snr-threshold' && params.minCNRatio !== undefined) {
          const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));
          const holdAt = params.minCNRatio + marginDb / 2;
          const held = samples.filter((s) => s.cn >= holdAt && s.hasLock).length;

          expect(peak.cn, `${objective.id}: peak ${peak.cn.toFixed(2)} dB < threshold ${params.minCNRatio} + ${marginDb} dB`).toBeGreaterThanOrEqual(params.minCNRatio + marginDb);
          expect(peak.hasLock, `${objective.id}: no modem lock at peak`).toBe(true);
          expect(held, `${objective.id}: only ${held} s locked at C/N >= ${holdAt} dB`).toBeGreaterThanOrEqual(HOLD_S);
          checks++;
        }
        if (condition.type === 'receiver-snr-threshold' && params.maxCNRatio !== undefined) {
          // A denied link (keyhole crater, rain fade) must still produce a
          // FINITE reading at or below the bound, or the condition never latches.
          const denied = samples.filter((s) => Number.isFinite(s.cn) && s.cn <= params.maxCNRatio!);

          expect(denied.length, `${objective.id}: no finite C/N at or below ${params.maxCNRatio} dB`).toBeGreaterThan(0);
          checks++;
        }
        if (condition.type === 'signal-detected' && params.signalId && params.minPower !== undefined) {
          const best = Math.max(...samples.map((s) => s.detect[params.signalId!] ?? -Infinity));

          expect(best, `${objective.id}: ${params.signalId} peaks at ${best.toFixed(1)} dBm`).toBeGreaterThan(params.minPower);
          checks++;
        }
      }
    }
    expect(checks, 'flight row names objectives with nothing to check').toBeGreaterThan(0);
  });
});

describe('nats-eu Phase C: link budgets are correct and achievable', () => {
  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /**
   * The worksheet objective for each link-budget scenario. The inputs are
   * parsed from the objective description the operator reads, so the test
   * always grades the numbers currently published, not a copy of them.
   */
  const WORKSHEETS = [
    { flight: FLIGHTS.find((f) => f.scenario === natsEuScenario10Data)!, objectiveId: 'budget-the-low-pass', liveMargin: true },
    { flight: FLIGHTS.find((f) => f.scenario === natsEuScenario12Data)!, objectiveId: 'predict-acceptance', liveMargin: true },
    // S13: the survey worksheet is right and the station is wrong, so the
    // published numbers must grade correct while the live chain must NOT
    // deliver the margin (asserted in the staged-physics block).
    { flight: FLIGHTS.find((f) => f.scenario === natsEuScenario13Data && f.noradId === 61701)!, objectiveId: 'compute-the-survey-budget', liveMargin: false },
  ];

  const PUBLISHED: Array<[keyof ReturnType<typeof publishedInputs>, RegExp]> = [
    ['eirpDbm', /EIRP (\d+(?:\.\d+)?) dBm/],
    ['fsplDb', /free-space path loss (\d+(?:\.\d+)?) dB/],
    ['rxGainDbi', /receive gain (\d+(?:\.\d+)?) dBi/],
    ['systemNoiseTempK', /system noise temperature (\d+(?:\.\d+)?) K/],
    ['bandwidthHz', /occupied bandwidth (\d+(?:\.\d+)?) MHz/],
    ['miscLossDb', /miscellaneous losses (\d+(?:\.\d+)?) dB/],
  ];

  /** Pull the six worksheet inputs out of the objective description. */
  function publishedInputs(scenario: ScenarioData, objectiveId: string) {
    const description = scenario.objectives.find((o) => o.id === objectiveId)!.description;
    const read = (label: string, re: RegExp): number => {
      const match = description.match(re);

      expect(match, `${scenario.id}/${objectiveId} does not publish ${label}`).not.toBeNull();

      return Number(match![1]);
    };
    const raw = Object.fromEntries(PUBLISHED.map(([key, re]) => [key, read(key, re)]));

    return {
      eirpDbm: raw.eirpDbm,
      fsplDb: raw.fsplDb,
      rxGainDbi: raw.rxGainDbi,
      systemNoiseTempK: raw.systemNoiseTempK,
      bandwidthHz: raw.bandwidthHz * 1e6,
      miscLossDb: raw.miscLossDb,
    };
  }

  it.each(WORKSHEETS.map((w) => [w.flight.scenario.id, w] as const))('%s: the published worksheet numbers produce expectedCNRDb', (_id, { flight, objectiveId }) => {
    const config = settingsOf(flight.scenario).linkBudget!;
    const inputs = publishedInputs(flight.scenario, objectiveId);
    const computed = LinkBudgetManager.computeCNRDb(inputs);

    // A player entering the briefed numbers must be graded correct.
    expect(
      Math.abs(computed - config.expectedCNRDb),
      `worksheet ${JSON.stringify(inputs)} gives ${computed.toFixed(2)} dB, scenario expects ${config.expectedCNRDb}`
    ).toBeLessThanOrEqual(config.toleranceDb ?? 1.0);
  });

  it.each(WORKSHEETS.filter((w) => w.liveMargin).map((w) => [w.flight.scenario.id, w] as const))(
    '%s: the live chain delivers the required margin and matches the prediction',
    (_id, { flight }) => {
      const config = settingsOf(flight.scenario).linkBudget!;
      const needed = config.thresholdCNRDb + (config.requiredMarginDb ?? 3);
      const samples = fly(flight);
      const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));
      const window = samples.filter((s) => s.cn >= needed);

      expect(peak.cn, `peak ${peak.cn.toFixed(2)} dB < required ${needed} dB`).toBeGreaterThan(needed);
      // Long enough to press Commit Link.
      expect(window.length, `only ${window.length} s above ${needed} dB`).toBeGreaterThanOrEqual(30);
      // And the operator's correct prediction must agree with the measurement.
      expect(Math.abs(peak.cn - config.expectedCNRDb), `prediction ${config.expectedCNRDb} vs measured ${peak.cn.toFixed(2)}`).toBeLessThan(1.5);
    }
  );
});

describe('nats-eu Phase E: staged physics behind S13-S16', () => {
  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const peakOf = (samples: Sample[]) => samples.reduce((a, b) => (b.cn > a.cn ? b : a));

  it('S13: the 89 deg pass locks on both legs and drops the carrier through the zenith keyhole', () => {
    const flight = FLIGHTS.find((f) => f.scenario === natsEuScenario13Data && f.noradId === 61702)!;
    const samples = fly(flight);
    const start = startMsOf(natsEuScenario13Data);
    const pass = firstPass(natsEuScenario13Data, satOf(natsEuScenario13Data, 61702));
    const culminationMin = (pass.maxElMs - start) / MINUTE_MS;

    expect(pass.maxEl, 'it really is near-zenith').toBeGreaterThan(86);

    // Rising leg: fly-the-zenith-pass reads 8 dB with lock before the top.
    const rising = samples.filter((s) => s.tMin >= culminationMin - 1.5 && s.tMin <= culminationMin - 0.25);

    expect(peakOf(rising).cn, 'rising-leg peak').toBeGreaterThanOrEqual(8 + SNR_MARGIN_DB);
    expect(rising.filter((s) => s.hasLock && s.cn >= 9).length, 'rising seconds locked at 9 dB').toBeGreaterThanOrEqual(30);

    // The keyhole, at frame resolution with no settle loop (what the app does):
    // the receiver has no carrier at all for at least a second through the top.
    const frames = fly(CONTROL_FLIGHTS.s13ZenithFrames).filter((s) => Math.abs(s.tMin - culminationMin) <= 0.3);
    const lost = frames.filter((s) => !s.hasLock);

    expect(lost.length, `only ${lost.length} frames without lock within 18 s of culmination`).toBeGreaterThanOrEqual(TICK_HZ);

    // Descending leg: lock comes back and holds for the 100 s the objective asks.
    const hold =
      (
        natsEuScenario13Data.objectives.find((o) => o.id === 'ride-through-the-keyhole')!.conditions.find((c) => c.type === 'receiver-signal-locked') as {
          maintainDuration?: number;
        }
      ).maintainDuration ?? 0;
    const falling = samples.filter((s) => s.tMin > culminationMin + 0.3);
    let run = 0;
    let longest = 0;

    for (const s of falling) {
      run = s.hasLock ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    expect(hold).toBeGreaterThanOrEqual(90);
    expect(longest, `longest locked run on the descending leg ${longest} s`).toBeGreaterThanOrEqual(hold + 20);
  });

  it('S13: the degraded Galway LNB costs 3-5 dB at the survey geometry, and the survey margin cannot be met', () => {
    const degraded = peakOf(fly(FLIGHTS.find((f) => f.scenario === natsEuScenario13Data && f.noradId === 61701)!));
    const healthy = peakOf(fly(CONTROL_FLIGHTS.s13HealthyGalway));
    const config = settingsOf(natsEuScenario13Data).linkBudget!;

    // The healthy control matches the survey prediction (the S2 station).
    expect(Math.abs(healthy.cn - config.expectedCNRDb), `healthy ${healthy.cn.toFixed(2)} vs survey ${config.expectedCNRDb}`).toBeLessThan(1.5);
    // The degraded station is unmistakably short but still locks (the brief says ~7 dB).
    expect(healthy.cn - degraded.cn, `shortfall ${(healthy.cn - degraded.cn).toFixed(2)} dB`).toBeGreaterThanOrEqual(3);
    expect(healthy.cn - degraded.cn, `shortfall ${(healthy.cn - degraded.cn).toFixed(2)} dB`).toBeLessThanOrEqual(5);
    expect(degraded.hasLock, 'degraded station still locks at the peak').toBe(true);
    expect(Math.abs(degraded.cn - 7), `degraded peak ${degraded.cn.toFixed(2)} dB should read about 7`).toBeLessThan(1.0);
    // Commit Link would refuse: threshold + required margin is out of reach.
    expect(degraded.cn).toBeLessThan(config.thresholdCNRDb + (config.requiredMarginDb ?? 3));
  });

  it('S13: the Shetland SAR-3 collect peaks near the number the brief quotes', () => {
    const peak = peakOf(fly(FLIGHTS.find((f) => f.scenario === natsEuScenario13Data && f.noradId === 61703)!));

    expect(Math.abs(peak.cn - 11.5), `Shetland peak ${peak.cn.toFixed(2)} dB`).toBeLessThan(1.0);
  });

  it('S14: 30 mm/h of rain on the 19 deg Galway pass leaves a finite C/N at or below 5 dB where the dry pass closes', () => {
    const rain = fly(FLIGHTS.find((f) => f.scenario === natsEuScenario14Data && f.variant === 'rain')!);
    const dry = fly(CONTROL_FLIGHTS.s14DryGalway);
    const fade = peakOf(dry).cn - peakOf(rain).cn;

    // observe-the-galway-fade latches on a finite reading at or below 5 dB.
    expect(
      rain.some((s) => Number.isFinite(s.cn) && s.cn <= 5),
      'no finite sample at or below 5 dB in the rain'
    ).toBe(true);
    expect(peakOf(rain).cn, `rain peak ${peakOf(rain).cn.toFixed(2)} dB`).toBeLessThan(8);
    // The dry pass would have been usable at the delivery standard...
    expect(peakOf(dry).cn, `dry peak ${peakOf(dry).cn.toFixed(2)} dB`).toBeGreaterThanOrEqual(8);
    // ...and the fade is whole decibels, as the brief quotes (about 7 plus sky noise).
    expect(fade, `fade ${fade.toFixed(2)} dB`).toBeGreaterThanOrEqual(5);
  });

  it('S14: heater on before the sleet keeps the ride-out at ~11 dB; heater never on puts ~8.6 dB of ice on it and no lock', () => {
    const clean = fly(FLIGHTS.find((f) => f.scenario === natsEuScenario14Data && f.noradId === 61701)!);
    const iced = fly(CONTROL_FLIGHTS.s14IcedGalway);
    const iceDb = iceAfterSeconds('severe', 1423);

    expect(Math.abs(iceDb - 8.6), `ice after 1423 s = ${iceDb.toFixed(2)} dB`).toBeLessThan(0.3);
    expect(Math.abs(peakOf(clean).cn - 11), `clean peak ${peakOf(clean).cn.toFixed(2)} dB`).toBeLessThan(1.0);
    expect(iced.filter((s) => s.hasLock && s.cn >= 8).length, 'iced pass must not decode at the delivery standard').toBe(0);
    expect(peakOf(clean).cn - peakOf(iced).cn, 'ice costs what the log line says').toBeGreaterThanOrEqual(6);
  });

  it('S14: the weather events bracket the passes the way the brief says', () => {
    const events = settingsOf(natsEuScenario14Data).weatherEvents!;
    const rain = events.find((e) => e.type === 'rain')!;
    const sleet = events.find((e) => e.type === 'hail')!;
    const schedule = settingsOf(natsEuScenario14Data).contactSchedule!;
    const collect = schedule.contacts.find((c) => c.id === 'W-SAR2-GW')!;
    const rideOut = schedule.contacts.find((c) => c.id === 'W-SAR1-GW')!;
    const rampS = Math.min(WeatherManager.RAIN_RAMP_MAX_S, rain.duration * WeatherManager.RAIN_RAMP_FRACTION);

    expect(rain.rainRateMmPerHour).toBe(30);
    // Full rain rate covers the whole Galway SAR-2 window.
    expect(rain.startTime + rampS).toBeLessThanOrEqual(collect.windowStartS);
    expect(rain.startTime + rain.duration - rampS).toBeGreaterThanOrEqual(collect.windowEndS);
    // The sleet follows the rain and covers the ride-out; the rain has stopped by then.
    expect(sleet.startTime).toBeGreaterThanOrEqual(rain.startTime + rain.duration);
    expect(sleet.startTime).toBeLessThan(rideOut.windowStartS);
    expect(sleet.startTime + sleet.duration).toBeGreaterThan(rideOut.windowEndS);
  });

  it('S15: the traffic key rolls in the gap - after SAR-1 LOS and before the SAR-2 command window opens', () => {
    const settings = settingsOf(natsEuScenario15Data);
    const roll = settings.hardwareFaultEvents!.find((e) => e.id === 'traffic-key-roll')!;
    const start = startMsOf(natsEuScenario15Data);
    const sar1 = firstPass(natsEuScenario15Data, satOf(natsEuScenario15Data, 61701));
    const losS = (sar1.losMs - start) / 1000;

    expect(roll.target).toBe('crypto-key-mismatch');
    expect(roll.startTime, `roll at ${roll.startTime} s must follow SAR-1 LOS at ${losS.toFixed(0)} s`).toBeGreaterThan(losS);
    expect(roll.startTime).toBeLessThan(settings.commanding!.windowStartS - 300);
    // Enough gap for both rotations and the retune: at least eight minutes.
    expect(settings.commanding!.windowStartS - losS).toBeGreaterThanOrEqual(8 * 60);
  });

  it('S16: the GNSS outage sits inside the command window and clears before the Shetland pass sets', () => {
    const settings = settingsOf(natsEuScenario16Data);
    const outage = settings.hardwareFaultEvents!.find((e) => e.id === 'gw-gnss-outage')!;
    const { windowStartS, windowEndS } = settings.commanding!;
    const shetland = settings.contactSchedule!.contacts.find((c) => c.id === 'C-SAR2-SH')!;

    expect(outage.target).toBe('gpsdo-gnss-loss');
    expect(outage.startTime).toBeGreaterThanOrEqual(windowStartS);
    expect(outage.startTime).toBeLessThan(windowEndS - 240);
    expect(outage.startTime + outage.duration!).toBeLessThan(shetland.windowEndS - 120);
  });

  it('S16: the Shetland BUC fault reads over the alarm while driven and settles under it once the drive is removed', () => {
    const settings = settingsOf(natsEuScenario16Data);
    const fault = settings.hardwareFaultEvents!.find((e) => e.id === 'sh-buc-fan')!;
    const shetland = settings.groundStations.find((gs) => gs.id === 'SH-02')!;
    const modem = shetland.transmitters![0].modems[0];
    const buc = shetland.rfFrontEnds[0].buc;
    const deltaC = fault.params!.deltaC!;
    const drivenOutputDbm = modem.ifSignal.power + buc.gain;
    // buc-module-core: target = 25 + 0.8 * (outputPower + 10) + offset
    const drivenTarget = 25 + 0.8 * Math.max(0, drivenOutputDbm + 10) + deltaC;
    const mutedTarget = 25 + deltaC;

    expect(fault.target).toBe('buc-overtemp');
    expect(modem.isTransmitting, 'the carrier is staged on air').toBe(true);
    expect(buc.isMuted, 'the BUC is staged unmuted').toBe(false);
    expect(fault.params!.startTemperatureC!).toBeGreaterThan(70);
    expect(drivenTarget, `driven settle ${drivenTarget.toFixed(1)} degC`).toBeGreaterThan(70);
    expect(mutedTarget, `muted settle ${mutedTarget.toFixed(1)} degC`).toBeLessThan(70);
    // The fan is back before the report, and well after the operator is asked to cool it.
    expect(fault.startTime).toBeLessThan(120);
    expect(fault.startTime + fault.duration!).toBeGreaterThan(settings.commanding!.windowStartS);
  });
});
