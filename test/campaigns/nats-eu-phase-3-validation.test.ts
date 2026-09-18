/**
 * nats-eu Phase 3 (Gray Zone, S17-S24) - scenario wiring and timeline checks.
 *
 * Mirrors the Phase C harness for the arc's static facts: registration and
 * prerequisite chain, authored pass geometry against the scenario's own
 * element sets, and the timing of the scripted adversary beats relative to
 * those passes. The flown C/N thresholds are proven by each scenario's
 * Playwright spec.
 */
import type { Degrees } from 'ootk';
import { describe, expect, it, vi } from 'vitest';

let simNowMs = Date.UTC(2027, 3, 12, 2, 0, 0);

vi.mock('@app/simulation/sim-time', () => ({
  getSimulatedNowMs: () => simNowMs,
  getSimulatedNow: () => new Date(simNowMs),
}));

import { natsEuScenario17Data } from '@app/campaigns/nats-eu/scenario17';
import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Condition } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService } from '@app/services/pass-planner-service';

const PHASE_3: ScenarioData[] = [natsEuScenario17Data];

interface Phase3Settings {
  satellites: OrbitalSatellite[];
  scenarioStartDate: string;
  scenarioStartWallTime: string;
  interferenceEvents?: Array<{ id: string; startTime: number; duration: number; path?: string; emitter?: { latitude: number; longitude: number } }>;
  security?: { events: Array<{ id: string; timeS?: number; isAnomaly?: boolean }>; accounts: Array<{ id: string; status: string }> };
}

const settingsOf = (scenario: ScenarioData): Phase3Settings => scenario.settings as unknown as Phase3Settings;

function startMsOf(scenario: ScenarioData): number {
  const { scenarioStartDate, scenarioStartWallTime } = settingsOf(scenario);
  return Date.parse(`${scenarioStartDate}T${scenarioStartWallTime}Z`);
}

function satOf(scenario: ScenarioData, noradId: number): OrbitalSatellite {
  const sat = settingsOf(scenario).satellites.find((s) => s.noradId === noradId);
  expect(sat, `${scenario.id}: no satellite ${noradId}`).toBeDefined();
  return sat!;
}

/** First pass after the scenario clock starts, 0 deg horizon (author-passes convention). */
function firstPass(scenario: ScenarioData, sat: OrbitalSatellite) {
  simNowMs = startMsOf(scenario);
  const pass = new PassPlannerService().getPasses(sat, simNowMs, { horizonHours: 2, minElevation: 0 as Degrees })[0];
  expect(pass, `${scenario.id}: ${sat.name} has no pass within 2 h`).toBeDefined();
  return pass;
}

describe('nats-eu Phase 3: scenario wiring', () => {
  it('registers the Gray Zone scenarios in order, advanced, chained from S16', () => {
    const ids = PHASE_3.map((s) => s.id);
    expect(ids).toEqual(['nats-eu-scenario17']);

    const expectedPrereq = ['nats-eu-scenario16', ...ids.slice(0, -1)];
    PHASE_3.forEach((scenario, i) => {
      expect(scenario.prerequisiteScenarioIds, scenario.id).toEqual([expectedPrereq[i]]);
      expect(scenario.url).toBe(`nats-eu/scenarios/${scenario.id}`);
      expect(scenario.number).toBe(17 + i);
      expect(scenario.difficulty).toBe('advanced');
      expect(scenario.isDisabled).toBe(false);
      expect(scenario.settings.missionBriefUrl).toBe(`https://docs.signalrange.space/campaign-2/scenario-${17 + i}?content-only=true&dark=true`);
    });
  });
});

describe('S17 Unusual Activity', () => {
  const scenario = natsEuScenario17Data;

  it('flies SAR-1 at T+20 peaking 30 deg and SAR-2 at T+40 peaking 26 deg over Galway', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar2 = firstPass(scenario, satOf(scenario, 61702));

    expect(Math.abs((sar1.aosMs - start) / 60_000 - 20.0)).toBeLessThan(0.25);
    expect(Math.abs(sar1.maxEl - 30.0)).toBeLessThan(1.0);
    expect(Math.abs((sar2.aosMs - start) / 60_000 - 40.0)).toBeLessThan(0.25);
    expect(Math.abs(sar2.maxEl - 26.3)).toBeLessThan(1.0);
    expect(sar1.losMs, 'SAR-1 sets before SAR-2 rises').toBeLessThan(sar2.aosMs);
  });

  it('the carrier is terrestrial, opens after SAR-1 culmination and outlives its LOS', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    const [carrier] = settingsOf(scenario).interferenceEvents!;

    expect(carrier.path).toBe('terrestrial');
    expect(carrier.emitter).toBeDefined();
    const onS = carrier.startTime;
    const offS = carrier.startTime + carrier.duration;
    expect(onS * 1000 + start, 'opens after culmination').toBeGreaterThan(sar1.maxElMs);
    expect(onS * 1000 + start, 'opens before LOS').toBeLessThan(sar1.losMs);
    expect(offS * 1000 + start, 'still on after LOS - the ground tell').toBeGreaterThan(sar1.losMs + 60_000);
    expect(offS * 1000 + start, 'gone before SAR-2 rises').toBeLessThan(sar2.aosMs);
  });

  it('the live configuration export lands between the passes, after the carrier is being written up', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    const security = settingsOf(scenario).security!;
    const exportEvent = security.events.find((e) => e.id === 'evt-config-export')!;

    expect(exportEvent.isAnomaly).toBe(true);
    expect(exportEvent.timeS! * 1000 + start).toBeGreaterThan(sar1.losMs);
    expect(exportEvent.timeS! * 1000 + start).toBeLessThan(sar2.aosMs);
    // The sprayed, decommissioned account starts active - disabling it is the operator's work.
    expect(security.accounts.find((a) => a.id === 'svc-legacy')?.status).toBe('active');
  });

  it('call-the-carrier is a decision whose evidence names its own siblings and whose only satisfiable option is interference', () => {
    const objective = scenario.objectives.find((o) => o.id === 'call-the-carrier')!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));

    for (const id of decision.params!.evidence!) expect(siblingIds.has(id), `evidence "${id}" names a sibling`).toBe(true);

    // In S17 the facts are: interference active, no injected fault, crypto intact.
    const facts: Record<string, boolean> = { 'interference-active': true, 'equipment-fault-active': false, 'crypto-intact': true };
    const holds = (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holds);
      return (r.any ?? []).some(holds);
    };
    const correct = decision.params!.decisionOptions!.filter((o) => o.correctWhen && holds(o.correctWhen));
    expect(correct.map((o) => o.label)).toEqual(['External interference - characterise it and report it']);
  });
});
