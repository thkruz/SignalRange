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
import { natsEuScenario18Data } from '@app/campaigns/nats-eu/scenario18';
import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Condition } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService } from '@app/services/pass-planner-service';

const PHASE_3: ScenarioData[] = [natsEuScenario17Data, natsEuScenario18Data];

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
    expect(ids).toEqual(['nats-eu-scenario17', 'nats-eu-scenario18']);

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

describe('S18 Dirty Spectrum', () => {
  const scenario = natsEuScenario18Data;

  it('flies SAR-2 at T+18 peaking 32 deg then SAR-1 at T+40 peaking 24 deg over Galway', () => {
    const start = startMsOf(scenario);
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    const sar1 = firstPass(scenario, satOf(scenario, 61701));

    expect(Math.abs((sar2.aosMs - start) / 60_000 - 18.0)).toBeLessThan(0.25);
    expect(Math.abs(sar2.maxEl - 31.8)).toBeLessThan(1.0);
    expect(Math.abs((sar1.aosMs - start) / 60_000 - 40.0)).toBeLessThan(0.25);
    expect(Math.abs(sar1.maxEl - 24.0)).toBeLessThan(1.0);
    expect(sar2.losMs).toBeLessThan(sar1.aosMs);
  });

  it('each carrier is terrestrial, cycles, sits in the band of the bird being received, and the first outlives its pass', () => {
    const start = startMsOf(scenario);
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const events = settingsOf(scenario).interferenceEvents! as Array<{
      id: string;
      startTime: number;
      duration: number;
      periodSeconds: number;
      onSeconds: number;
      frequency: number;
      path?: string;
    }>;
    const [onSar2, onSar1] = events;

    for (const e of events) {
      expect(e.path).toBe('terrestrial');
      expect(e.onSeconds, `${e.id} cycles`).toBeLessThan(e.periodSeconds);
      expect(e.periodSeconds, `${e.id} keeps a minute-scale beat`).toBe(90);
    }
    // In band: within the 36 MHz video occupied band of the bird being received.
    expect(Math.abs(onSar2.frequency - 11730e6)).toBeLessThan(18e6);
    expect(Math.abs(onSar1.frequency - 11686e6)).toBeLessThan(18e6);

    expect(onSar2.startTime * 1000 + start).toBeGreaterThan(sar2.maxElMs);
    expect(onSar2.startTime * 1000 + start).toBeLessThan(sar2.losMs);
    expect((onSar2.startTime + onSar2.duration) * 1000 + start, 'outlives SAR-2 LOS').toBeGreaterThan(sar2.losMs + 60_000);
    expect((onSar2.startTime + onSar2.duration) * 1000 + start).toBeLessThan(sar1.aosMs);

    expect(onSar1.startTime * 1000 + start).toBeGreaterThan(sar1.aosMs);
    expect((onSar1.startTime + onSar1.duration) * 1000 + start).toBeLessThan(sar1.losMs);
  });

  it('the notches are asked for at the IF of each carrier', () => {
    const notchOf = (objectiveId: string) => scenario.objectives.find((o) => o.id === objectiveId)!.conditions.find((c) => c.type === 'notch-filter-configured')!.params!;
    expect(notchOf('notch-the-carrier').notchCenterFrequency).toBe(13100 - 11726);
    expect(notchOf('decode-sar1-under-it').notchCenterFrequency).toBe(13100 - 11690);
  });

  it('call-the-cycle is graded on the interference envelope, and only the deliberate-interference option is satisfiable', () => {
    const objective = scenario.objectives.find((o) => o.id === 'call-the-cycle')!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);

    const facts: Record<string, boolean> = { 'interference-active': true, 'equipment-fault-active': false, 'crypto-intact': true, 'weather-attenuation-dominant': false };
    const holds = (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holds);
      return (r.any ?? []).some(holds);
    };
    const correct = decision.params!.decisionOptions!.filter((o) => o.correctWhen && holds(o.correctWhen));
    expect(correct).toHaveLength(1);
    expect(correct[0].label).toMatch(/^Deliberate interference/);
  });
});
