/**
 * nats-eu Build Phase B validation gate (scenarios 2-8).
 *
 * The Phase A retro's rule: author RF numbers against the harness, not the
 * scenario file. Every threshold baked into S2-S8 is asserted here against the
 * real chain, so a scenario that is arithmetically uncompletable fails CI rather
 * than a playtest.
 *
 * It covers three failure classes:
 *
 * 1. LINK BUDGET - the C/N a CORRECT operator worksheet produces must match each
 *    scenario's `expectedCNRDb` within its tolerance, using exactly the numbers
 *    the objective description publishes. If the two drift apart, a player who
 *    does the arithmetic right is told they are wrong.
 * 2. ACHIEVABILITY - the live chain must actually deliver
 *    `thresholdCNRDb + requiredMarginDb` for long enough to press a button, or
 *    `link-margin-met` can never be satisfied.
 * 3. REACHABILITY - every objective condition must name a mechanic the scenario
 *    actually enables, and every referenced id (contact, account, audit event,
 *    command, space event) must exist in that scenario's settings. This is what
 *    catches an `ephemeris-updated` objective in a scenario with no
 *    `spaceEvents` block, or a typo'd contact id.
 */

import type { Degrees } from 'ootk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** S2-S7 share scenario 1's validated clock: 2027-03-15 14:00:00 UTC */
const DAY_START_MS = Date.UTC(2027, 2, 15, 14, 0, 0);
/** S8 is a genuine night shift: 2027-03-16 00:15:00 UTC (phase 16 moved it 13 min earlier so the pre-pass beats fit) */
const NIGHT_START_MS = Date.UTC(2027, 2, 16, 0, 15, 0);
const MINUTE_MS = 60_000;
const TICK_HZ = 60;

let simNowMs = DAY_START_MS;

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

import { galwayGroundStation, shetlandGroundStation } from '@app/campaigns/nats-eu/ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from '@app/campaigns/nats-eu/satellites';
import { natsEuScenario2Data } from '@app/campaigns/nats-eu/scenario2';
import { natsEuScenario3Data } from '@app/campaigns/nats-eu/scenario3';
import { natsEuScenario4Data } from '@app/campaigns/nats-eu/scenario4';
import { natsEuScenario5Data } from '@app/campaigns/nats-eu/scenario5';
import { natsEuScenario6Data } from '@app/campaigns/nats-eu/scenario6';
import { natsEuScenario7Data } from '@app/campaigns/nats-eu/scenario7';
import { natsEuScenario8Data } from '@app/campaigns/nats-eu/scenario8';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import type { AntennaCore } from '@app/equipment/antenna/antenna-core';
import { AntennaUIHeadless } from '@app/equipment/antenna/antenna-ui-headless';
import { Receiver } from '@app/equipment/receiver/receiver';
import type { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { createRFFrontEnd } from '@app/equipment/rf-front-end/rf-front-end-factory';
import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { LinkBudgetManager } from '@app/link-budget/link-budget-manager';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService } from '@app/services/pass-planner-service';
import type { MHz } from '@app/types';
import type { TleLine1, TleLine2 } from 'ootk';

const PHASE_B: ScenarioData[] = [natsEuScenario2Data, natsEuScenario3Data, natsEuScenario4Data, natsEuScenario5Data, natsEuScenario6Data, natsEuScenario7Data, natsEuScenario8Data];

describe('nats-eu Phase B: scenario wiring', () => {
  it('registers scenarios 2-8 with unique ids, urls and a prerequisite chain', () => {
    const ids = PHASE_B.map((s) => s.id);

    expect(ids).toEqual(['nats-eu-scenario2', 'nats-eu-scenario3', 'nats-eu-scenario4', 'nats-eu-scenario5', 'nats-eu-scenario6', 'nats-eu-scenario7', 'nats-eu-scenario8']);
    expect(new Set(ids).size).toBe(ids.length);

    // Each scenario is gated on the previous one, S2 on the existing S1.
    const expectedPrereq = ['nats-eu-scenario1', ...ids.slice(0, -1)];

    PHASE_B.forEach((scenario, i) => {
      expect(scenario.prerequisiteScenarioIds, scenario.id).toEqual([expectedPrereq[i]]);
      expect(scenario.url).toBe(`nats-eu/scenarios/${scenario.id}`);
      expect(scenario.isDisabled).toBe(false);
    });
  });

  /**
   * REGRESSION: the whole mission-icons section of the sidebar - Mission Brief,
   * the objectives Checklist, Ops Log, Dialog History - is hidden unless
   * settings.missionBriefUrl is set (asset-tree-sidebar.ts initMissionSection_).
   *
   * Without it the operator cannot see their objectives at all, and any
   * `mission-brief-opened` condition is unsatisfiable. All seven Phase B
   * scenarios shipped this way in first draft and were completely unplayable;
   * only a live browser check caught it.
   */
  it('sets missionBriefUrl, without which the checklist and brief are hidden', () => {
    for (const scenario of PHASE_B) {
      const url = (scenario.settings as { missionBriefUrl?: string }).missionBriefUrl;

      expect(url, `${scenario.id} has no missionBriefUrl - checklist would be hidden`).toBeTruthy();
      expect(url, scenario.id).toContain(`campaign-2/scenario-${scenario.number}`);
    }
  });

  it('only uses mission-brief-opened where a brief URL exists to open', () => {
    for (const scenario of PHASE_B) {
      const usesBrief = scenario.objectives.some((o) => o.conditions.some((c) => c.type === 'mission-brief-opened'));

      if (usesBrief) {
        expect((scenario.settings as { missionBriefUrl?: string }).missionBriefUrl, scenario.id).toBeTruthy();
      }
    }
  });

  it('gives every objective a NICE annotation and at least one condition', () => {
    for (const scenario of PHASE_B) {
      expect(scenario.objectives.length, scenario.id).toBeGreaterThan(0);
      for (const objective of scenario.objectives) {
        expect(objective.nice?.length, `${scenario.id}/${objective.id}`).toBeGreaterThan(0);
        expect(objective.conditions.length, `${scenario.id}/${objective.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('references only objective prerequisites that exist in the same scenario', () => {
    for (const scenario of PHASE_B) {
      const ids = new Set(scenario.objectives.map((o) => o.id));

      for (const objective of scenario.objectives) {
        for (const prereq of objective.prerequisiteObjectiveIds ?? []) {
          expect(ids.has(prereq), `${scenario.id}/${objective.id} -> ${prereq}`).toBe(true);
        }
      }
    }
  });
});

/**
 * The reachability gate. A condition whose manager is never started, or which
 * names an id the settings block does not define, is silently unsatisfiable in
 * the app - the exact failure that would have shipped an unplayable S7.
 */
describe('nats-eu Phase B: every condition is reachable', () => {
  /** Condition types that require a settings block to be present. */
  const REQUIRES_BLOCK: Record<string, keyof typeof blockOf> = {
    'link-budget-computed': 'linkBudget',
    'link-margin-met': 'linkBudget',
    'uplink-doppler-comp-enabled': 'commanding',
    'command-acknowledged': 'commanding',
    'key-rotation-completed': 'commanding',
    'contact-assigned': 'contactSchedule',
    'contact-plan-valid': 'contactSchedule',
    'ephemeris-updated': 'spaceEvents',
    'audit-log-reviewed': 'security',
    'security-event-acknowledged': 'security',
    'access-control-set': 'security',
  };
  const blockOf = {
    linkBudget: 0,
    commanding: 0,
    contactSchedule: 0,
    spaceEvents: 0,
    security: 0,
  };

  it.each(PHASE_B.map((s) => [s.id, s] as const))('%s enables every mechanic it grades', (_id, scenario) => {
    const settings = scenario.settings as Record<string, unknown>;

    for (const objective of scenario.objectives) {
      for (const condition of objective.conditions) {
        const required = REQUIRES_BLOCK[condition.type];

        if (required) {
          expect(settings[required], `${scenario.id}/${objective.id}: ${condition.type} needs settings.${required}`).toBeDefined();
        }
      }
    }
  });

  it.each(PHASE_B.map((s) => [s.id, s] as const))('%s references only ids that exist', (_id, scenario) => {
    const settings = scenario.settings as {
      contactSchedule?: { contacts: Array<{ id: string }>; stationIds: string[] };
      security?: { accounts: Array<{ id: string }>; events: Array<{ id: string }> };
      commanding?: { commands?: Array<{ id: string }> };
      spaceEvents?: Array<{ id: string }>;
      groundStations: Array<{ id: string }>;
    };
    const stationIds = new Set(settings.groundStations.map((gs) => gs.id));

    for (const objective of scenario.objectives) {
      const where = `${scenario.id}/${objective.id}`;

      for (const condition of objective.conditions) {
        const params = (condition.params ?? {}) as Record<string, string>;

        if (params.contactId) {
          expect(
            settings.contactSchedule?.contacts.map((c) => c.id),
            where
          ).toContain(params.contactId);
        }
        if (params.groundStationId) {
          expect(stationIds.has(params.groundStationId), `${where}: unknown station ${params.groundStationId}`).toBe(true);
        }
        if (params.accountId) {
          expect(
            settings.security?.accounts.map((a) => a.id),
            where
          ).toContain(params.accountId);
        }
        if (params.eventId && condition.type === 'security-event-acknowledged') {
          expect(
            settings.security?.events.map((e) => e.id),
            where
          ).toContain(params.eventId);
        }
        if (params.eventId && condition.type === 'ephemeris-updated') {
          expect(
            settings.spaceEvents?.map((e) => e.id),
            where
          ).toContain(params.eventId);
        }
        if (params.commandId) {
          expect(
            settings.commanding?.commands?.map((c) => c.id),
            where
          ).toContain(params.commandId);
        }
      }
    }
  });

  it('S5 and S8 contact plans are solvable: every overlapping pair can be split', () => {
    for (const scenario of [natsEuScenario5Data, natsEuScenario8Data]) {
      const schedule = (
        scenario.settings as {
          contactSchedule: { contacts: Array<{ id: string; windowStartS: number; windowEndS: number; priority: number }>; stationIds: string[] };
        }
      ).contactSchedule;

      // Count mutually-overlapping contacts. With N stations, no more than N
      // contacts may overlap at any instant or the plan cannot be made valid.
      for (const a of schedule.contacts) {
        const overlapping = schedule.contacts.filter((b) => b.id !== a.id && b.windowStartS < a.windowEndS && a.windowStartS < b.windowEndS);

        expect(overlapping.length + 1, `${scenario.id}: ${a.id} overlaps ${overlapping.length} others`).toBeLessThanOrEqual(schedule.stationIds.length);
      }
    }
  });

  it('S3, S4 and S8 command windows fall inside the pass they belong to', () => {
    const planner = new PassPlannerService();
    // Window seconds count from mission start, which is each scenario's own
    // sim start (phase 16 moved S3/S4 to 13:45 so the pre-pass beats fit).
    const startOf = (scenario: { settings: { scenarioStartDate?: string; scenarioStartWallTime?: string } }) =>
      Date.parse(`${scenario.settings.scenarioStartDate}T${scenario.settings.scenarioStartWallTime}Z`);
    const cases = [
      { scenario: natsEuScenario3Data, start: startOf(natsEuScenario3Data), sat: meridianSar1Satellite },
      { scenario: natsEuScenario4Data, start: startOf(natsEuScenario4Data), sat: meridianSar1Satellite },
      { scenario: natsEuScenario8Data, start: startOf(natsEuScenario8Data), sat: meridianSar1Satellite },
    ];

    for (const { scenario, start, sat } of cases) {
      const commanding = (scenario.settings as { commanding: { windowStartS: number; windowEndS: number } }).commanding;
      const pass = planner.getPasses(sat, start, { horizonHours: 1, minElevation: 5 as Degrees })[0];

      expect(pass, `${scenario.id}: no pass at scenario start`).toBeDefined();

      const aosS = (pass.aosMs - start) / 1000;
      const losS = (pass.losMs - start) / 1000;

      // The window must open after AOS and close before LOS, or the operator is
      // asked to command a spacecraft that is below the horizon.
      expect(commanding.windowStartS, `${scenario.id} window opens before AOS`).toBeGreaterThanOrEqual(aosS);
      expect(commanding.windowEndS, `${scenario.id} window closes after LOS`).toBeLessThanOrEqual(losS);
      expect(commanding.windowEndS - commanding.windowStartS, `${scenario.id} window too short`).toBeGreaterThan(120);
    }
  });
});

describe('nats-eu Phase B: link budgets are correct and achievable', () => {
  let antenna: AntennaCore;
  let frontEnd: RFFrontEndCore;
  let receiver: Receiver;

  /**
   * Build one station's RX chain. The antenna is attached to the station's
   * location so it sees the sky from there (phase 16 E1): Shetland flights are
   * Shetland geometry, not Galway's with a label.
   */
  function buildChain(station: typeof galwayGroundStation, rxMHz: number): void {
    document.body.innerHTML = '<div id="pb-fe"></div><div id="pb-rx"></div>';
    antenna = new AntennaUIHeadless('pb-ant', ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, station.antennasState![0], 1);
    antenna.attachStationLocation(station.location.latitude, station.location.longitude, station.location.elevation);
    frontEnd = createRFFrontEnd('pb-fe', station.rfFrontEnds[0], 'standard');
    frontEnd.connectAntenna(antenna);
    antenna.attachRfFrontEnd(frontEnd);
    receiver = new Receiver('pb-rx', [antenna], station.receivers![0], 1);
    receiver.connectRfFrontEnd(frontEnd);
    receiver.state.modems[0].frequency = rxMHz as MHz;
  }

  beforeEach(() => {
    simSatellites = [meridianSar1Satellite, meridianSar2Satellite];
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    buildChain(galwayGroundStation, 1414);
  });

  afterEach(() => {
    EventBus.destroy();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /** Fly a pass under real program-track, sampling settled C/N once per sim second. */
  function flyPass(sat: OrbitalSatellite, startMs: number, endMs: number): Array<{ tMin: number; cn: number }> {
    antenna.handleTrackingModeChange('program-track');
    antenna.handleTargetSatelliteChange(sat.noradId);

    const out: Array<{ tMin: number; cn: number }> = [];
    const modem = receiver.state.modems[0];
    const tickMs = 1000 / TICK_HZ;
    let tick = 0;

    for (simNowMs = startMs; simNowMs <= endMs; simNowMs += tickMs, tick++) {
      for (const s of simSatellites) s.update();
      antenna.update();
      if (tick % TICK_HZ === 0) {
        for (let s = 0; s < TICK_HZ && antenna.state.isSlewing; s++) antenna.update();
        frontEnd.update();
        const info = receiver.getSignalsInBandwidth(modem);

        if (Number.isFinite(info.cnRatio_dB)) {
          out.push({ tMin: (simNowMs - startMs) / MINUTE_MS, cn: info.cnRatio_dB });
        }
      }
    }

    return out;
  }

  /**
   * The exact numbers each scenario publishes to the operator. If a scenario's
   * description changes, this table has to change with it - that coupling is
   * the point.
   */
  const WORKSHEETS = [
    {
      scenario: natsEuScenario2Data,
      start: DAY_START_MS,
      flyFromMin: 1,
      flyToMin: 12,
      inputs: { eirpDbm: 28, fsplDb: 171.4, rxGainDbi: 51.8, systemNoiseTempK: 88, bandwidthHz: 36e6, miscLossDb: 1 },
    },
    {
      scenario: natsEuScenario8Data,
      start: NIGHT_START_MS,
      // SAR-1 AOS 00:30 (0 deg), LOS 00:40: T+15 .. T+25 from the 00:15 start
      flyFromMin: 14,
      flyToMin: 26,
      inputs: { eirpDbm: 28, fsplDb: 169.1, rxGainDbi: 51.8, systemNoiseTempK: 88, bandwidthHz: 36e6, miscLossDb: 1 },
    },
  ];

  it.each(WORKSHEETS.map((w) => [w.scenario.id, w] as const))('%s: the published worksheet numbers produce expectedCNRDb', (_id, { scenario, inputs }) => {
    const config = (
      scenario.settings as {
        linkBudget: { expectedCNRDb: number; toleranceDb?: number };
      }
    ).linkBudget;
    const computed = LinkBudgetManager.computeCNRDb(inputs);

    // A player entering the briefed numbers must be graded correct.
    expect(Math.abs(computed - config.expectedCNRDb), `${scenario.id}: worksheet gives ${computed.toFixed(2)} dB, scenario expects ${config.expectedCNRDb}`).toBeLessThanOrEqual(
      config.toleranceDb ?? 1.0
    );
  });

  it.each(WORKSHEETS.map((w) => [w.scenario.id, w] as const))('%s: the live chain actually delivers the required margin', (_id, { scenario, start, flyFromMin, flyToMin }) => {
    const config = (
      scenario.settings as {
        linkBudget: { thresholdCNRDb: number; requiredMarginDb?: number; expectedCNRDb: number };
      }
    ).linkBudget;
    const needed = config.thresholdCNRDb + (config.requiredMarginDb ?? 3);

    const samples = flyPass(meridianSar1Satellite, start + flyFromMin * MINUTE_MS, start + flyToMin * MINUTE_MS);
    const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));
    const window = samples.filter((s) => s.cn >= needed);

    // Peak must clear the requirement...
    expect(peak.cn, `${scenario.id}: peak ${peak.cn.toFixed(2)} dB < required ${needed} dB`).toBeGreaterThan(needed);
    // ...for long enough that a human can press Commit Link.
    expect(window.length, `${scenario.id}: only ${window.length}s above ${needed} dB`).toBeGreaterThanOrEqual(60);
    // ...and the measurement must agree with what the operator predicted.
    expect(Math.abs(peak.cn - config.expectedCNRDb), `${scenario.id}: prediction vs measurement`).toBeLessThan(1.5);
  });

  it('S8 night pass is the stronger geometry it claims to be', () => {
    const day = flyPass(meridianSar1Satellite, DAY_START_MS + 1 * MINUTE_MS, DAY_START_MS + 12 * MINUTE_MS);
    const night = flyPass(meridianSar1Satellite, NIGHT_START_MS + 14 * MINUTE_MS, NIGHT_START_MS + 26 * MINUTE_MS);
    const peakOf = (s: Array<{ cn: number }>) => s.reduce((a, b) => (b.cn > a.cn ? b : a)).cn;

    // 40.4 deg / 581 km beats 28 deg / 761 km by ~2.4 dB of path loss.
    expect(peakOf(night)).toBeGreaterThan(peakOf(day) + 1.5);
  });

  /**
   * Phase 16 (S5-S8 rewrite): every threshold those scenarios put on a pass
   * is flown here, from the station the objective names. Numbers in the
   * scenario headers come from these flights.
   */
  describe('phase 16 flights', () => {
    const peakOf = (s: Array<{ cn: number }>) => s.reduce((a, b) => (b.cn > a.cn ? b : a)).cn;
    const secondsAtOrAbove = (s: Array<{ cn: number }>, db: number) => s.filter((x) => x.cn >= db).length;

    it('S5: MERIDIAN-SAR-1 worked FROM Shetland decodes at 8 dB and peaks at 9 dB or better', () => {
      // S5 objectives decode-from-shetland (>= 8 dB) and read-shetland-peak (>= 9 dB):
      // SH-02 SAR-1 pass 14:01 .. 14:08, max el 23.8 deg at 860 km.
      buildChain(shetlandGroundStation, 1414);
      const t0 = Date.UTC(2027, 2, 15, 13, 59, 0);
      const samples = flyPass(meridianSar1Satellite, t0, t0 + 11 * MINUTE_MS);

      expect(peakOf(samples)).toBeGreaterThan(9 + 0.5);
      expect(secondsAtOrAbove(samples, 8)).toBeGreaterThanOrEqual(90);
      // ...and it is a different pass from Galway's: lower, so a lower peak.
      EventBus.destroy();
      buildChain(galwayGroundStation, 1414);
      const galway = flyPass(meridianSar1Satellite, t0, t0 + 12 * MINUTE_MS);
      expect(peakOf(galway) - peakOf(samples)).toBeGreaterThan(0.5);
      expect(peakOf(galway) - peakOf(samples)).toBeLessThan(2.5);
    });

    it('S8: the 13 deg Shetland SAR-2 pass is a telemetry contact (>= 5 dB), not an imagery one', () => {
      // S8 telemetry-contact: SH-02 SAR-2 02:54 .. 03:00, max el 13.4 deg at 1233 km.
      buildChain(shetlandGroundStation, 1370);
      const t0 = Date.UTC(2027, 2, 16, 2, 52, 0);
      const samples = flyPass(meridianSar2Satellite, t0, t0 + 10 * MINUTE_MS);

      expect(secondsAtOrAbove(samples, 5)).toBeGreaterThanOrEqual(90);
      expect(peakOf(samples)).toBeGreaterThan(6);
      expect(peakOf(samples)).toBeLessThan(8); // the brief is right to call it telemetry-only
    });

    it('S8: the 73 deg Galway SAR-2 pass decodes at 8 dB through the top (no keyhole)', () => {
      // S8 decode-the-steep-pass: GW-01 SAR-2 04:27 .. 04:35, max el 73.1 deg at 408 km.
      buildChain(galwayGroundStation, 1370);
      const t0 = Date.UTC(2027, 2, 16, 4, 26, 0);
      const samples = flyPass(meridianSar2Satellite, t0, t0 + 10 * MINUTE_MS);
      const peak = samples.reduce((a, b) => (b.cn > a.cn ? b : a));

      expect(peak.cn).toBeGreaterThan(15);
      expect(secondsAtOrAbove(samples, 8)).toBeGreaterThanOrEqual(180);
      // Culmination is the strongest point: the pedestal kept up.
      expect(peak.tMin).toBeGreaterThan(4.5);
      expect(peak.tMin).toBeLessThan(6);
    });

    it('S7: on the pre-burn elements SAR-2 stays below 5 dB and FALLS as it rises; loaded, it decodes at 8 dB', () => {
      // S7 stale-acquisition-attempt (maxCNRatio 5) and verify-the-reacquisition (>= 8 dB).
      const event = (natsEuScenario7Data.settings as { spaceEvents: Array<{ newTle: { tle1: string; tle2: string } }> }).spaceEvents[0];
      const originalTle1 = meridianSar2Satellite.ootkSatellite.tle1 as TleLine1;
      const originalTle2 = meridianSar2Satellite.ootkSatellite.tle2 as TleLine2;
      const t0 = Date.UTC(2027, 2, 15, 14, 17, 0);

      try {
        simNowMs = t0;
        meridianSar2Satellite.maneuverTo(event.newTle.tle1 as TleLine1, event.newTle.tle2 as TleLine2);
        expect(meridianSar2Satellite.isPredictionStale).toBe(true);
        buildChain(galwayGroundStation, 1370);
        const stale = flyPass(meridianSar2Satellite, t0, t0 + 10 * MINUTE_MS);

        expect(stale.length).toBeGreaterThan(200); // the carrier is present (weak), so C/N is a number
        expect(peakOf(stale)).toBeLessThan(5);
        expect(peakOf(stale)).toBeGreaterThan(2); // visible enough to be read, which is the lesson
        // The tell: C/N at culmination is worse than on the rising leg.
        const rising = stale.find((x) => x.tMin > 2.5 && x.tMin < 3.5);
        const top = stale.find((x) => x.tMin > 5 && x.tMin < 5.5);
        expect(rising && top && top.cn < rising.cn - 3).toBe(true);

        // Load the update: station back on the truth.
        meridianSar2Satellite.reloadTle(event.newTle.tle1 as TleLine1, event.newTle.tle2 as TleLine2);
        expect(meridianSar2Satellite.isPredictionStale).toBe(false);
        EventBus.destroy();
        buildChain(galwayGroundStation, 1370);
        const loaded = flyPass(meridianSar2Satellite, t0, t0 + 10 * MINUTE_MS);

        expect(peakOf(loaded)).toBeGreaterThan(9.5);
        expect(secondsAtOrAbove(loaded, 8)).toBeGreaterThanOrEqual(120);
      } finally {
        // The instance is shared by S1-S8: put the authored orbit back.
        meridianSar2Satellite.reloadTle(originalTle1, originalTle2);
      }
    });
  });
});
