/**
 * Campaign 4 (CCS) Scenario 2 "Failover" validation gate.
 *
 * Failure classes covered:
 *
 * 1. WIRING - registered in SCENARIOS and the ccs campaign, unique id/url,
 *    prerequisite resolves, mission brief slug, NICE codes on every objective.
 * 2. REACHABILITY - every condition type has an evaluator in the objectives
 *    manager and is a member of the ConditionType union; every objective is
 *    scored; the objective chain is acyclic and only references in-scenario ids.
 * 3. RF PLAN - the jam waveform and target uplink band are clear of the
 *    protected friendly band, and the EA config matches the station geometry.
 * 4. FAULT SCHEDULE - every hardwareFaultEvent targets a real station /
 *    transmitter / modem; the primary trips before the backup.
 * 5. BEHAVIOUR - the HardwareFaultManager actually flips the targeted modems
 *    at the scheduled times (headless, mocked clock + simulation), and the
 *    backup string's radiated output satisfies the failover assessment.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const clock = vi.hoisted(() => ({ nowMs: 0 }));
const sim = vi.hoisted(() => ({ groundStations: [] as unknown[] }));
const scenarioSettings = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }));

vi.mock('@app/simulation/mission-clock', () => ({
  missionNowMs: () => clock.nowMs,
  addSkippedTime: () => undefined,
  getSkippedMs: () => 0,
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      groundStations: sim.groundStations,
      satellites: [],
      getSatsByAzEl: () => [],
      getSatByNoradId: () => null,
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    destroy: () => undefined,
  },
}));

vi.mock('@app/scenario-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/scenario-manager')>();

  return {
    ...actual,
    ScenarioManager: {
      getInstance: () => ({ settings: scenarioSettings.settings }),
    },
  };
});

import { sandstormGroundStation } from '@app/campaigns/ccs/ground-stations';
import { ccsScenario1Data } from '@app/campaigns/ccs/scenario1';
import { ccsScenario2Data } from '@app/campaigns/ccs/scenario2';
import { ccsCampaignData } from '@app/campaigns/nats/campaign-data';
import { type ElectronicAttackConfig, ElectronicAttackManager, type JamOutput } from '@app/electronic-attack/electronic-attack-manager';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { HardwareFaultManager } from '@app/faults/hardware-fault-manager';
import { SCENARIOS } from '@app/scenario-manager';
import type { Milliseconds } from 'ootk';

const repoRoot = process.cwd();
const objectivesManagerSrc = readFileSync(join(repoRoot, 'src', 'objectives', 'objectives-manager.ts'), 'utf8');
const objectiveTypesSrc = readFileSync(join(repoRoot, 'src', 'objectives', 'objective-types.ts'), 'utf8');
const niceCatalog = JSON.parse(readFileSync(join(repoRoot, 'scripts', 'nice-catalog.json'), 'utf8')) as { codes: string[] };

interface FaultEvent {
  id: string;
  groundStationId: string;
  transmitterIndex?: number;
  modemNumber: number;
  startTime: number;
}

interface ProtectedBand {
  id: string;
  minHz: number;
  maxHz: number;
}

const settings = ccsScenario2Data.settings;
const faultEvents = settings.hardwareFaultEvents as FaultEvent[];
const protectedBands = settings.protectedFrequencies as ProtectedBand[];
const ea = settings.electronicAttack as ElectronicAttackConfig;
const objectives = ccsScenario2Data.objectives ?? [];
const station = sandstormGroundStation;
const jamModems = station.transmitters![0].modems;
const bucLoHz = (station.rfFrontEnds![0].buc!.loFrequency as number) * 1e6;

/** Union members of ConditionType, read from the type file. */
function conditionTypeUnion(): Set<string> {
  const start = objectiveTypesSrc.indexOf('export type ConditionType =');
  const end = objectiveTypesSrc.indexOf(';', start);
  const body = objectiveTypesSrc.slice(start, end);
  const out = new Set<string>();
  for (const m of body.matchAll(/'([a-z0-9-]+)'/g)) {
    out.add(m[1]);
  }

  return out;
}

const overlaps = (lowA: number, highA: number, lowB: number, highB: number): boolean => lowA < highB && highA > lowB;

describe('ccs scenario 2: wiring', () => {
  it('is registered in SCENARIOS and in the ccs campaign with a unique id and url', () => {
    const ids = SCENARIOS.map((s) => s.id);
    const urls = SCENARIOS.map((s) => s.url);

    expect(ids).toContain('ccs-scenario2');
    expect(ids.filter((id) => id === 'ccs-scenario2')).toHaveLength(1);
    expect(urls.filter((url) => url === ccsScenario2Data.url)).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);

    expect(ccsCampaignData.scenarios.map((s) => s.id)).toEqual(['ccs-scenario1', 'ccs-scenario2', 'ccs-scenario3', 'ccs-scenario4', 'ccs-scenario5']);
  });

  it('follows the sandbox as the first scored mission', () => {
    expect(ccsScenario2Data.number).toBe(1);
    expect(ccsScenario2Data.missionType).not.toBe('Sandbox');
    expect(ccsScenario2Data.difficulty).toBe('advanced');
    expect(ccsScenario2Data.isDisabled).toBe(false);
    expect(ccsScenario2Data.prerequisiteScenarioIds).toEqual(['ccs-scenario1']);

    const known = new Set(SCENARIOS.map((s) => s.id));
    for (const prereq of ccsScenario2Data.prerequisiteScenarioIds ?? []) {
      expect(known.has(prereq), `prerequisite ${prereq} is not a registered scenario`).toBe(true);
    }
    expect(ccsScenario1Data.missionType).toBe('Sandbox');
  });

  it('links the campaign-4/scenario-2 mission brief', () => {
    expect(settings.missionBriefUrl).toBe('https://docs.signalrange.space/campaign-4/scenario-2?content-only=true&dark=true');

    const briefOpened = objectives[0].conditions.find((c) => c.type === 'mission-brief-opened');

    expect(briefOpened, 'first objective should require the brief to be opened').toBeDefined();
  });

  it('reuses the SANDSTORM station and COBALT-4 target', () => {
    expect(settings.groundStations?.map((g) => g.id)).toEqual(['SS-01']);
    expect(settings.satellites?.map((s) => s.noradId)).toEqual([90042]);
    expect(ea.groundStationId).toBe('SS-01');
    expect(ea.targetNoradId).toBe(90042);
  });
});

describe('ccs scenario 2: objectives', () => {
  const union = conditionTypeUnion();

  it('has objectives, each scored and NICE-annotated with in-catalog codes', () => {
    expect(objectives.length).toBeGreaterThanOrEqual(8);
    const catalog = new Set(niceCatalog.codes);

    for (const objective of objectives) {
      expect(objective.points, `${objective.id} has no points`).toBeGreaterThan(0);
      expect(objective.conditions.length, `${objective.id} has no conditions`).toBeGreaterThan(0);
      expect(objective.nice?.length, `${objective.id} has no NICE codes`).toBeGreaterThan(0);
      for (const code of objective.nice ?? []) {
        expect(catalog.has(code), `${objective.id}: ${code} is off-catalog`).toBe(true);
      }
      expect(objective.groundStation).toBe('SS-01');
    }
  });

  it('scores roughly 80-110 points in total', () => {
    const total = objectives.reduce((sum, o) => sum + (o.points ?? 0), 0);
    const required = objectives.filter((o) => !o.isOptional).reduce((sum, o) => sum + (o.points ?? 0), 0);

    expect(total).toBeGreaterThanOrEqual(80);
    expect(total).toBeLessThanOrEqual(110);
    expect(required).toBe(100);
  });

  it('uses only condition types that exist in the union and have an evaluator', () => {
    for (const objective of objectives) {
      for (const condition of objective.conditions) {
        const where = `${objective.id}: ${condition.type}`;

        expect(union.has(condition.type), `${where} is not a ConditionType`).toBe(true);
        expect(objectivesManagerSrc.includes(`case '${condition.type}':`), `${where} has no evaluator`).toBe(true);
      }
    }
  });

  it('chains objectives through in-scenario prerequisites without cycles', () => {
    const ids = objectives.map((o) => o.id);

    expect(new Set(ids).size).toBe(ids.length);
    const seen = new Set<string>();
    for (const objective of objectives) {
      for (const prereq of objective.prerequisiteObjectiveIds ?? []) {
        expect(ids, `${objective.id} -> ${prereq}`).toContain(prereq);
        // Authored in dependency order: a prerequisite must appear earlier
        expect(seen.has(prereq), `${objective.id} depends on later objective ${prereq}`).toBe(true);
      }
      seen.add(objective.id);
    }
  });

  it('references only real modems, apertures and the jam front end in condition params', () => {
    const modemNumbers = new Set(jamModems.map((m) => m.modem_number));
    const antennaCount = station.antennas!.length;

    for (const objective of objectives) {
      for (const condition of objective.conditions) {
        const p = (condition.params ?? {}) as { modemNumber?: number; equipmentIndex?: number };
        const where = `${objective.id}: ${condition.type}`;

        if (p.modemNumber !== undefined) {
          expect(modemNumbers.has(p.modemNumber), `${where} modem ${p.modemNumber}`).toBe(true);
        }
        if (condition.type === 'antenna-position') {
          expect(p.equipmentIndex, where).toBeDefined();
          expect(p.equipmentIndex!, where).toBeLessThan(antennaCount);
        }
        if (condition.type.startsWith('hpa-')) {
          expect(p.equipmentIndex, `${where} must target the jam chain`).toBe(ea.jamAntennaIndex);
        }
      }
    }
  });

  it('makes the operator hold the effect (mustMaintain + maintainDuration) after each recovery', () => {
    const holds = objectives.filter((o) => o.conditions.some((c) => c.type === 'jamming-effective' && c.mustMaintain && (c.maintainDuration ?? 0) >= 120));

    expect(holds.map((o) => o.id)).toEqual(['hold-primary', 'hold-backup', 'hold-to-recall']);
  });

  it('times the two recoveries with a generous limit and a lapse penalty', () => {
    for (const id of ['failover-backup', 'recover-string']) {
      const objective = objectives.find((o) => o.id === id)!;

      expect(objective.timeLimitSeconds, id).toBeGreaterThanOrEqual(120);
      expect(objective.timerStartTrigger, id).toBe('on-activate');
      expect(objective.timePenalty?.elapsedTimeThreshold, id).toBeLessThan(objective.timeLimitSeconds!);
    }
  });

  it('answers every status-check with an in-range correctIndex', () => {
    for (const objective of objectives) {
      for (const condition of objective.conditions.filter((c) => c.type === 'status-check')) {
        const p = condition.params as { options: string[]; correctIndex: number };

        expect(p.options.length, objective.id).toBeGreaterThanOrEqual(2);
        expect(p.correctIndex, objective.id).toBeGreaterThanOrEqual(0);
        expect(p.correctIndex, objective.id).toBeLessThan(p.options.length);
      }
    }
  });
});

describe('ccs scenario 2: RF plan', () => {
  it('keeps both jam strings and the target uplink band clear of the protected friendly band', () => {
    expect(protectedBands.length).toBeGreaterThan(0);

    for (const band of protectedBands) {
      expect(overlaps(ea.targetUplinkLowHz, ea.targetUplinkHighHz, band.minHz, band.maxHz), band.id).toBe(false);

      for (const modem of jamModems) {
        const rfCenter = (modem.ifSignal.frequency as number) + bucLoHz;
        const half = (modem.ifSignal.bandwidth as number) / 2;

        expect(overlaps(rfCenter - half, rfCenter + half, band.minHz, band.maxHz), `modem ${modem.modem_number} vs ${band.id}`).toBe(false);
        // ...and actually inside the target passband, so it is transponded
        expect(rfCenter - half).toBeGreaterThanOrEqual(ea.targetUplinkLowHz);
        expect(rfCenter + half).toBeLessThanOrEqual(ea.targetUplinkHighHz);
      }
    }
  });

  it('asks for the pointing the station geometry actually gives', () => {
    const jamAntenna = station.antennasState![0];

    for (const objective of objectives) {
      for (const condition of objective.conditions.filter((c) => c.type === 'antenna-position')) {
        const p = condition.params as { azimuth: number; elevation: number; tolerance: number };

        expect(Math.abs(p.azimuth - (jamAntenna.azimuth as number))).toBeLessThanOrEqual(p.tolerance);
        expect(Math.abs(p.elevation - (jamAntenna.elevation as number))).toBeLessThanOrEqual(p.tolerance);
      }
    }
  });
});

describe('ccs scenario 2: fault schedule', () => {
  it('targets real station / transmitter / modem indices, primary before backup', () => {
    expect(faultEvents).toHaveLength(2);
    const stationIds = new Set(settings.groundStations!.map((g) => g.id));

    for (const event of faultEvents) {
      expect(stationIds.has(event.groundStationId), event.id).toBe(true);
      const tx = station.transmitters![event.transmitterIndex ?? 0];

      expect(tx, `${event.id}: transmitter ${event.transmitterIndex}`).toBeDefined();
      expect(
        tx.modems.some((m) => m.modem_number === event.modemNumber),
        `${event.id}: modem ${event.modemNumber}`
      ).toBe(true);
      expect(event.startTime).toBeGreaterThan(0);
    }

    const [primary, backup] = faultEvents;

    expect(primary.modemNumber).toBe(station.transmitters![0].activeModem);
    expect(backup.modemNumber).not.toBe(primary.modemNumber);
    expect(backup.startTime).toBeGreaterThan(primary.startTime);
    expect(new Set(faultEvents.map((e) => e.id)).size).toBe(faultEvents.length);
  });
});

describe('ccs scenario 2: fault behaviour (headless)', () => {
  interface ModemState {
    modem_number: number;
    isPowered: boolean;
    isFaulted: boolean;
    isTransmitting: boolean;
    isTransmittingSwitchUp: boolean;
  }

  const tick = () => EventBus.getInstance().emit(Events.UPDATE, 16 as Milliseconds);

  afterEach(() => {
    HardwareFaultManager.destroy();
    EventBus.destroy();
    sim.groundStations = [];
  });

  function bootStation(): ModemState[] {
    const modems: ModemState[] = jamModems.map((m) => ({
      modem_number: m.modem_number,
      isPowered: true,
      isFaulted: false,
      isTransmitting: false,
      isTransmittingSwitchUp: false,
    }));
    sim.groundStations = [{ state: { id: 'SS-01' }, transmitters: [{ state: { activeModem: 1, modems } }] }];
    scenarioSettings.settings = settings as unknown as Record<string, unknown>;
    clock.nowMs = 0;

    return modems;
  }

  it('trips JAM-A, then JAM-B, at the scheduled mission-elapsed times', () => {
    const modems = bootStation();
    const [jamA, jamB] = modems;
    jamA.isTransmitting = true;
    jamA.isTransmittingSwitchUp = true;

    const manager = HardwareFaultManager.getInstance();
    const [primary, backup] = faultEvents;

    clock.nowMs = (primary.startTime - 1) * 1000;
    tick();
    expect(jamA.isFaulted).toBe(false);
    expect(jamA.isTransmitting).toBe(true);
    expect(manager.isTripped(primary.id)).toBe(false);

    clock.nowMs = primary.startTime * 1000;
    tick();
    expect(manager.isTripped(primary.id)).toBe(true);
    expect(jamA).toMatchObject({ isFaulted: true, isTransmitting: false, isTransmittingSwitchUp: false });
    // The backup is untouched and can be keyed: this is what the failover objective asks for
    expect(jamB).toMatchObject({ isFaulted: false, isPowered: true });
    expect(manager.isTripped(backup.id)).toBe(false);

    // Operator fails over: 'tx-modem-not-transmitting' (modem 1) is satisfied,
    // 'tx-modem-transmitting' (modem 2) once keyed
    expect(jamA.isPowered && !jamA.isTransmitting).toBe(true);
    jamB.isTransmitting = true;
    jamB.isTransmittingSwitchUp = true;
    expect(jamB.isPowered && jamB.isTransmitting && !jamB.isFaulted).toBe(true);

    clock.nowMs = backup.startTime * 1000;
    tick();
    expect(manager.isTripped(backup.id)).toBe(true);
    expect(jamB).toMatchObject({ isFaulted: true, isTransmitting: false });
    // Faults fire once: JAM-A is not re-tripped after an operator reset
    jamA.isFaulted = false;
    clock.nowMs = (backup.startTime + 60) * 1000;
    tick();
    expect(jamA.isFaulted).toBe(false);
  });

  it('never trips a string on a station the schedule does not name', () => {
    const modems = bootStation();
    sim.groundStations = [{ state: { id: 'OTHER-01' }, transmitters: [{ state: { activeModem: 1, modems } }] }];
    HardwareFaultManager.getInstance();

    clock.nowMs = faultEvents[1].startTime * 1000;
    tick();
    expect(modems.every((m) => !m.isFaulted)).toBe(true);
  });

  it('lets the backup string satisfy the failover assessment and stay clear of the protected band', () => {
    const jamB = jamModems.find((m) => m.modem_number === 2)!;
    const hpa = station.rfFrontEnds![0].hpa!;
    const output: JamOutput = {
      frequency: (jamB.ifSignal.frequency as number) + bucLoHz,
      bandwidth: jamB.ifSignal.bandwidth as number,
      power: hpa.outputPower as number,
    };
    const jamAntenna = station.antennasState![0];
    const antenna = { isPowered: true, azimuthDeg: jamAntenna.azimuth as number, elevationDeg: jamAntenna.elevation as number };
    const target = { azimuthDeg: 174.9, elevationDeg: 50.4 };

    const assessment = ElectronicAttackManager.assess([output], antenna, target, ea);

    expect(assessment.isRadiatingInBand).toBe(true);
    expect(assessment.isOnTarget).toBe(true);
    expect(assessment.jToSDb).toBeGreaterThanOrEqual(ea.effectiveJtoSDb ?? 6);
    expect(assessment.isEffective).toBe(true);

    for (const band of protectedBands) {
      expect(overlaps(output.frequency - output.bandwidth / 2, output.frequency + output.bandwidth / 2, band.minHz, band.maxHz)).toBe(false);
    }

    // With no string radiating (both tripped) the effect is gone - the lapse the operator must close
    expect(ElectronicAttackManager.assess([], antenna, target, ea).isEffective).toBe(false);
  });
});
