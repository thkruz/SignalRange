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
import { natsEuScenario19Data } from '@app/campaigns/nats-eu/scenario19';
import { natsEuScenario20Data } from '@app/campaigns/nats-eu/scenario20';
import { natsEuScenario21Data } from '@app/campaigns/nats-eu/scenario21';
import { natsEuScenario22Data } from '@app/campaigns/nats-eu/scenario22';
import { natsEuScenario23Data } from '@app/campaigns/nats-eu/scenario23';
import { natsEuScenario24Data } from '@app/campaigns/nats-eu/scenario24';
import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Condition } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService } from '@app/services/pass-planner-service';

const PHASE_3: ScenarioData[] = [
  natsEuScenario17Data,
  natsEuScenario18Data,
  natsEuScenario19Data,
  natsEuScenario20Data,
  natsEuScenario21Data,
  natsEuScenario22Data,
  natsEuScenario23Data,
  natsEuScenario24Data,
];

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
    expect(ids).toEqual([
      'nats-eu-scenario17',
      'nats-eu-scenario18',
      'nats-eu-scenario19',
      'nats-eu-scenario20',
      'nats-eu-scenario21',
      'nats-eu-scenario22',
      'nats-eu-scenario23',
      'nats-eu-scenario24',
    ]);

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

describe('S19 Frequency Agility', () => {
  const scenario = natsEuScenario19Data;
  type S19Settings = Phase3Settings & {
    commanding: { targetNoradId: number; windowStartS: number; windowEndS: number; uplinkFrequencyHz: number; commands: Array<{ id: string }> };
    transec: { hopChannelsHz: number[]; requireKey?: boolean };
  };
  const s19 = scenario.settings as unknown as S19Settings;

  it('flies the SAR-2 commanding pass at T+20 peaking 28 deg and SAR-1 at T+42 peaking 25 deg', () => {
    const start = startMsOf(scenario);
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    const sar1 = firstPass(scenario, satOf(scenario, 61701));

    expect(Math.abs((sar2.aosMs - start) / 60_000 - 20.0)).toBeLessThan(0.25);
    expect(Math.abs(sar2.maxEl - 27.9)).toBeLessThan(1.0);
    expect(Math.abs((sar1.aosMs - start) / 60_000 - 42.0)).toBeLessThan(0.25);
    expect(Math.abs(sar1.maxEl - 25.2)).toBeLessThan(1.0);
  });

  it('the command window sits inside the SAR-2 pass with guards', () => {
    const start = startMsOf(scenario);
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    expect(s19.commanding.targetNoradId).toBe(61702);
    expect(s19.commanding.windowStartS * 1000 + start).toBeGreaterThanOrEqual(sar2.aosMs);
    expect(s19.commanding.windowEndS * 1000 + start).toBeLessThanOrEqual(sar2.losMs);
    expect(s19.commanding.windowEndS - s19.commanding.windowStartS).toBeGreaterThan(120);
  });

  it('the jammer is a transponder-path event on the target bird overlapping the command carrier, opening inside the window with room for the ride-through', () => {
    const [jam] = s19.interferenceEvents! as Array<{
      id: string;
      startTime: number;
      duration: number;
      frequency: number;
      bandwidth: number;
      satelliteNoradId?: number;
      path?: string;
    }>;
    expect(jam.path).toBeUndefined();
    expect(jam.satelliteNoradId).toBe(s19.commanding.targetNoradId);
    expect(Math.abs(jam.frequency - s19.commanding.uplinkFrequencyHz)).toBeLessThanOrEqual(jam.bandwidth / 2);
    // Opens after the first command has had time to ACK, closes with the window.
    expect(jam.startTime).toBeGreaterThan(s19.commanding.windowStartS + 60);
    expect(jam.startTime + jam.duration).toBeGreaterThanOrEqual(s19.commanding.windowEndS);
    // Six minutes left in the window when it opens: enough to call, key, sync, resend.
    expect(s19.commanding.windowEndS - jam.startTime).toBeGreaterThan(5 * 60);
    // The hop set spans the jammed carrier.
    expect(s19.transec.hopChannelsHz).toContain(s19.commanding.uplinkFrequencyHz);
    expect(s19.transec.hopChannelsHz.length).toBeGreaterThanOrEqual(3);
  });

  it('call-the-nak is graded on uplink-jammed with the crypto intact, and only the denial option is satisfiable', () => {
    const objective = scenario.objectives.find((o) => o.id === 'call-the-nak')!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);

    const facts: Record<string, boolean> = { 'uplink-jammed': true, 'crypto-intact': true, 'command-window-open': true };
    const holds = (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holds);
      return (r.any ?? []).some(holds);
    };
    const correct = decision.params!.decisionOptions!.filter((o) => o.correctWhen && holds(o.correctWhen));
    expect(correct.map((o) => o.label)).toEqual(['Uplink denial - key the hop set at both ends and take the waveform to hopping']);
  });

  it('the ride-through resends the command that was denied', () => {
    const denied = 'PLD-STATUS';
    expect(s19.commanding.commands.map((c) => c.id)).toContain(denied);
    const ride = scenario.objectives.find((o) => o.id === 'ride-through')!;
    expect(ride.conditions.find((c) => c.type === 'command-acknowledged')!.params!.commandId).toBe(denied);
    expect(ride.prerequisiteObjectiveIds).toEqual(['go-to-hopping']);
  });
});

describe('S20 False Time', () => {
  const scenario = natsEuScenario20Data;
  type S20Settings = Phase3Settings & {
    gnssThreat: { groundStationIds?: string[]; spoofStartS: number; spoofEndS?: number; offsetDriftUsPerS?: number };
  };
  const s20 = scenario.settings as unknown as S20Settings;

  /** Evaluate a DecisionFactRule against a fact table. */
  const holdsWith =
    (facts: Record<string, boolean>) =>
    (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holdsWith(facts));
      return (r.any ?? []).some(holdsWith(facts));
    };
  const correctLabels = (objectiveId: string, facts: Record<string, boolean>): string[] => {
    const objective = scenario.objectives.find((o) => o.id === objectiveId)!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);
    return decision.params!.decisionOptions!.filter((o) => o.correctWhen && holdsWith(facts)(o.correctWhen)).map((o) => o.label);
  };

  it('flies SAR-1 at T+22 peaking 29 deg and SAR-2 at T+44 peaking 27 deg, both from the north', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar2 = firstPass(scenario, satOf(scenario, 61702));

    expect(Math.abs((sar1.aosMs - start) / 60_000 - 22.0)).toBeLessThan(0.25);
    expect(Math.abs(sar1.maxEl - 29.2)).toBeLessThan(1.0);
    expect(Math.abs((sar2.aosMs - start) / 60_000 - 44.0)).toBeLessThan(0.25);
    expect(Math.abs(sar2.maxEl - 27.0)).toBeLessThan(1.0);
  });

  it('the spoofer is local to GW-01, opens before SAR-1 with time to call it, and leaves the air between the passes', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar2 = firstPass(scenario, satOf(scenario, 61702));

    expect(s20.gnssThreat.groundStationIds).toEqual(['GW-01']); // SH-02 is the cross-check
    // At least ten minutes between onset and AOS: spot it, cross-check, call it, go to holdover.
    expect(sar1.aosMs - (start + s20.gnssThreat.spoofStartS * 1000)).toBeGreaterThan(10 * 60_000);
    // Past 20 us within a minute of onset so the read does not stall the pre-pass.
    expect((s20.gnssThreat.offsetDriftUsPerS ?? 5) * 60).toBeGreaterThanOrEqual(20);
    // Off the air after SAR-1 LOS (the probe finds it up) and before SAR-2 AOS (flown on GNSS).
    const endMs = start + s20.gnssThreat.spoofEndS! * 1000;
    expect(endMs).toBeGreaterThan(sar1.losMs);
    expect(endMs).toBeLessThan(sar2.aosMs);
  });

  it("Rotterdam's timestamp-skew audit entry is dated inside the spoof and is the flagged evidence", () => {
    const skew = s20.security!.events.find((e) => e.id === 'evt-ts-skew')!;
    expect(skew.timeS).toBeGreaterThan(s20.gnssThreat.spoofStartS);
    expect(skew.timeS).toBeLessThan(s20.gnssThreat.spoofEndS!);
    const report = scenario.objectives.find((o) => o.id === 'report-the-attack')!;
    expect(report.conditions.find((c) => c.type === 'security-event-acknowledged')!.params!.eventId).toBe('evt-ts-skew');
  });

  it('call-the-lie: only the spoof option holds when the constellation is healthy and the time is drifting', () => {
    const facts = { 'timing-drifting': true, 'gnss-constellation-healthy': true, 'equipment-fault-active': false };
    expect(correctLabels('call-the-lie', facts)).toEqual([
      'GNSS spoof - the constellation is healthy and the time is walking. Take the GNSS switch down and fly SAR-1 on the oscillator',
    ]);
    // A real outage would make the outage option right instead - the pair is the signature.
    expect(correctLabels('call-the-lie', { ...facts, 'gnss-constellation-healthy': false })).toEqual([
      'GNSS outage - satellites are being lost. Leave GNSS selected and let the GPSDO drop into holdover by itself',
    ]);
  });

  it('probe-the-sky grades against the clock: still walking while the spoofer is up, holding still once it is gone', () => {
    expect(correctLabels('probe-the-sky', { 'timing-drifting': true, 'gnss-constellation-healthy': true })).toEqual([
      'Still walking - the spoofer is up. GNSS switch back down; probe again later',
    ]);
    expect(correctLabels('probe-the-sky', { 'timing-drifting': false, 'gnss-constellation-healthy': true })).toEqual([
      'Holding still - the spoofer is off the air. Leave GNSS selected and let it re-discipline',
    ]);
  });

  it('all-clear gates the stable-offset read on the reference being back on GNSS, both maintained', () => {
    const allClear = scenario.objectives.find((o) => o.id === 'all-clear')!;
    const stable = allClear.conditions.find((c) => c.type === 'gpsdo-time-offset-stable')!;
    const mode = allClear.conditions.find((c) => c.type === 'gpsdo-reference-mode-set')!;
    expect(stable.mustMaintain).toBe(true);
    expect(mode.mustMaintain).toBe(true);
    expect(mode.params!.referenceMode).toBe('gnss');
    expect(allClear.conditionLogic).toBe('AND');
  });
});

describe('S21 Knocking on the Door', () => {
  const scenario = natsEuScenario21Data;
  type S21Settings = Phase3Settings & {
    commanding: { targetNoradId: number; windowStartS: number; windowEndS: number; uplinkFrequencyHz?: number; commands: Array<{ id: string }> };
  };
  const s21 = scenario.settings as unknown as S21Settings;

  const holdsWith =
    (facts: Record<string, boolean>) =>
    (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holdsWith(facts));
      return (r.any ?? []).some(holdsWith(facts));
    };
  const decisionOf = (objectiveId: string) => {
    const objective = scenario.objectives.find((o) => o.id === objectiveId)!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);
    return decision;
  };
  const correctLabels = (objectiveId: string, facts: Record<string, boolean>): string[] =>
    decisionOf(objectiveId)
      .params!.decisionOptions!.filter((o) => o.correctWhen && holdsWith(facts)(o.correctWhen))
      .map((o) => o.label);

  it('flies the SAR-2 commanding pass at T+24 peaking 31 deg with the window inside it', () => {
    const start = startMsOf(scenario);
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    expect(Math.abs((sar2.aosMs - start) / 60_000 - 24.0)).toBeLessThan(0.25);
    expect(Math.abs(sar2.maxEl - 30.6)).toBeLessThan(1.0);
    expect(s21.commanding.targetNoradId).toBe(61702);
    expect(s21.commanding.windowStartS * 1000 + start).toBeGreaterThanOrEqual(sar2.aosMs);
    expect(s21.commanding.windowEndS * 1000 + start).toBeLessThanOrEqual(sar2.losMs);
    // Nothing is jammed today: no carrier coupling, no interference events.
    expect(s21.commanding.uplinkFrequencyHz).toBeUndefined();
    expect(s21.interferenceEvents ?? []).toHaveLength(0);
  });

  it('the knock lands inside the window after the first command, with time to rotate and resend', () => {
    const events = s21.security!.events;
    const counter = events.find((e) => e.id === 'evt-rotterdam-counter')!;
    const unitLog = events.find((e) => e.id === 'evt-kg-replay-log')!;
    expect(counter.isAnomaly).toBe(true);
    expect(unitLog.isAnomaly).toBe(true);
    expect(counter.timeS).toBeGreaterThan(s21.commanding.windowStartS + 60);
    expect(unitLog.timeS).toBeGreaterThanOrEqual(counter.timeS!);
    expect(s21.commanding.windowEndS - unitLog.timeS!).toBeGreaterThan(5 * 60);
    expect(s21.commanding.commands.map((c) => c.id)).toEqual(expect.arrayContaining(['HK-DUMP', 'PLD-STATUS']));
  });

  it('call-the-knock: only the replay call holds with the key intact (the log entries are flagged evidence by then); the zeroize branch destroys the unit log', () => {
    expect(correctLabels('call-the-knock', { 'crypto-intact': true, 'audit-anomaly-present': false })).toEqual([
      'A replay against an intact key - the bird rejected it. Keep the log, rotate to Q2b out of cycle because they hold ciphertext of Q2, and send PLD-STATUS under the new key',
    ]);
    const zeroize = decisionOf('call-the-knock').params!.decisionOptions!.find((o) => o.label.startsWith('Key compromised'))!;
    expect(zeroize.consequence?.destroyEvidence?.auditEventId).toBe('evt-kg-replay-log');
  });

  it('retain-the-evidence: retaining is right with the key intact; zeroizing destroys the same evidence and costs points', () => {
    expect(correctLabels('retain-the-evidence', { 'crypto-intact': true })).toEqual([
      'Retain both under seal for CSIRT: the retired key is out of service, and the KG-01 log is the evidence that ties these frames to the actor',
    ]);
    const zeroize = decisionOf('retain-the-evidence').params!.decisionOptions!.find((o) => o.label.startsWith('Zeroize Q2'))!;
    expect(zeroize.consequence?.destroyEvidence?.auditEventId).toBe('evt-kg-replay-log');
    expect(zeroize.consequence?.pointDelta).toBeGreaterThan(0);
  });

  it('the rotation is an incident response between the two commands', () => {
    const rotate = scenario.objectives.find((o) => o.id === 'rotate-on-order')!;
    expect(rotate.prerequisiteObjectiveIds).toEqual(['call-the-knock']);
    expect(rotate.conditions.some((c) => c.type === 'key-rotation-completed')).toBe(true);
    const second = scenario.objectives.find((o) => o.id === 'second-command')!;
    expect(second.prerequisiteObjectiveIds).toEqual(['rotate-on-order']);
    expect(second.conditions.find((c) => c.type === 'command-acknowledged')!.params!.commandId).toBe('PLD-STATUS');
  });
});

describe('S22 Connecting the Dots', () => {
  const scenario = natsEuScenario22Data;
  type S22Settings = Phase3Settings & {
    security: { events: Array<{ id: string; isAnomaly?: boolean; requiresCampaignEvidence?: { scenarioId: string; eventId: string } }> };
  };
  const s22 = scenario.settings as unknown as S22Settings;

  const holdsWith =
    (facts: Record<string, boolean>) =>
    (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holdsWith(facts));
      return (r.any ?? []).some(holdsWith(facts));
    };
  const decision = () => {
    const objective = scenario.objectives.find((o) => o.id === 'attribute-the-actor')!;
    const d = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of d.params!.evidence!) expect(siblingIds.has(id)).toBe(true);
    return d;
  };

  it('flies one routine SAR-1 pass at T+30 peaking 24 deg, with no adversary event scheduled', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    expect(Math.abs((sar1.aosMs - start) / 60_000 - 30.0)).toBeLessThan(0.25);
    expect(Math.abs(sar1.maxEl - 23.8)).toBeLessThan(1.0);
    expect(s22.interferenceEvents ?? []).toHaveLength(0);
    expect(scenario.settings.gnssThreat).toBeUndefined();
  });

  it('carries the arc forward as audit entries, and the KG-01 line depends on what S21 preserved', () => {
    const ids = s22.security.events.map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['evt-s17-spray', 'evt-s17-export', 'evt-s18-report', 'evt-s19-denial', 'evt-s20-skew', 'evt-s21-kg-log']));
    const kg = s22.security.events.find((e) => e.id === 'evt-s21-kg-log')!;
    expect(kg.requiresCampaignEvidence).toEqual({ scenarioId: 'nats-eu-scenario21', eventId: 'evt-kg-replay-log' });
    // The id it points at exists in S21 and is the one S21's zeroize branches destroy.
    const s21Events = (natsEuScenario21Data.settings as unknown as S22Settings).security.events;
    expect(s21Events.some((e) => e.id === 'evt-kg-replay-log')).toBe(true);
  });

  it('the attribution decision grades on the evidence chain: one actor when intact, the recorded gap (at a cost) when not', () => {
    const options = decision().params!.decisionOptions!;
    const intact = options.filter((o) => o.correctWhen && holdsWith({ 'evidence-chain-intact': true })(o.correctWhen));
    const broken = options.filter((o) => o.correctWhen && holdsWith({ 'evidence-chain-intact': false })(o.correctWhen));
    expect(intact.map((o) => o.label.slice(0, 22))).toEqual(['One actor, one method:']);
    expect(broken.map((o) => o.label.slice(0, 23))).toEqual(['One actor for the first']);
    expect(broken[0].consequence?.pointDelta).toBeGreaterThan(0);
  });

  it('opens the campaign record before the timeline and reads it as evidence for the attribution', () => {
    const open = scenario.objectives.find((o) => o.id === 'open-the-record')!;
    expect(open.conditions.some((c) => c.type === 'campaign-document-reviewed')).toBe(true);
    const attribute = scenario.objectives.find((o) => o.id === 'attribute-the-actor')!;
    const record = attribute.conditions.find((c) => c.id === 'record-read')!;
    expect(record.type).toBe('campaign-document-reviewed');
    expect(record.mustMaintain).toBe(true); // readiness comes from maintenance, not observation
  });
});

describe('S23 Dark Passes', () => {
  const scenario = natsEuScenario23Data;
  type S23Settings = Phase3Settings & {
    commanding: { targetNoradId: number; windowStartS: number; windowEndS: number; uplinkFrequencyHz: number };
    transec: { hopChannelsHz: number[] };
    gnssThreat: { groundStationIds?: string[]; spoofStartS: number; spoofEndS?: number };
    spaceEvents: Array<{ id: string; satelliteNoradId: number; maneuverAtS: number; newTle: { tle2: string }; initialTle?: { tle2: string } }>;
  };
  const s23 = scenario.settings as unknown as S23Settings;

  const holdsWith =
    (facts: Record<string, boolean>) =>
    (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holdsWith(facts));
      return (r.any ?? []).some(holdsWith(facts));
    };
  const correctLabels = (objectiveId: string, facts: Record<string, boolean>): string[] => {
    const objective = scenario.objectives.find((o) => o.id === objectiveId)!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);
    return decision.params!.decisionOptions!.filter((o) => o.correctWhen && holdsWith(facts)(o.correctWhen)).map((o) => o.label.slice(0, 20));
  };

  it('flies the SAR-2 commanding pass at T+22 peaking 33 deg on the post-burn set, window inside it', () => {
    const start = startMsOf(scenario);
    const sar2 = firstPass(scenario, satOf(scenario, 61702));
    expect(Math.abs((sar2.aosMs - start) / 60_000 - 22.0)).toBeLessThan(0.25);
    expect(Math.abs(sar2.maxEl - 32.8)).toBeLessThan(1.0);
    expect(s23.commanding.windowStartS * 1000 + start).toBeGreaterThanOrEqual(sar2.aosMs);
    expect(s23.commanding.windowEndS * 1000 + start).toBeLessThanOrEqual(sar2.losMs);
  });

  it('the surge is simultaneous and before AOS; the jammer opens inside the window with room to hop', () => {
    const [burn] = s23.spaceEvents;
    expect(burn.satelliteNoradId).toBe(61702);
    expect(burn.maneuverAtS).toBe(s23.gnssThreat.spoofStartS);
    expect(burn.initialTle!.tle2).not.toBe(burn.newTle.tle2); // the station predicts from the pre-burn set
    expect(s23.gnssThreat.groundStationIds).toEqual(['GW-01']);
    expect(s23.gnssThreat.spoofEndS).toBeUndefined(); // runs to the end: the reference stays in holdover
    // Eight minutes from the surge to AOS.
    expect(s23.commanding.windowStartS - burn.maneuverAtS).toBeGreaterThanOrEqual(8 * 60);

    const [jam] = s23.interferenceEvents!;
    expect(jam.startTime).toBeGreaterThan(s23.commanding.windowStartS + 60);
    expect(s23.commanding.windowEndS - jam.startTime).toBeGreaterThan(5 * 60);
    expect(s23.transec.hopChannelsHz).toContain(s23.commanding.uplinkFrequencyHz);
  });

  it('triage is graded on the clock: ephemeris first before the jammer is up, hop set first once it is', () => {
    expect(correctLabels('triage', { 'timing-drifting': true, 'uplink-jammed': false })).toEqual(['Ephemeris first - wi']);
    expect(correctLabels('triage', { 'timing-drifting': true, 'uplink-jammed': true })).toEqual(['Hop set first - the ']);
  });

  it('call-the-denial: the denial with the reference in holdover, never the holdover', () => {
    expect(correctLabels('call-the-denial', { 'uplink-jammed': true, 'crypto-intact': true, 'reference-in-holdover': true })).toEqual(['Uplink denial on the']);
    const objective = scenario.objectives.find((o) => o.id === 'call-the-denial')!;
    const ref = objective.conditions.find((c) => c.id === 'reference-seen')!;
    expect(ref.type).toBe('gpsdo-reference-mode-set');
    expect(ref.params!.referenceMode).toBe('holdover');
  });

  it('the priority tasking is PLD-SAFE, resent under TRANSEC after the denial', () => {
    const ride = scenario.objectives.find((o) => o.id === 'ride-through')!;
    expect(ride.conditions.find((c) => c.type === 'command-acknowledged')!.params!.commandId).toBe('PLD-SAFE');
    expect(ride.prerequisiteObjectiveIds).toEqual(['go-to-hopping']);
    const load = scenario.objectives.find((o) => o.id === 'load-the-ephemeris')!;
    expect(load.conditions.find((c) => c.type === 'ephemeris-updated')!.params!.eventId).toBe('SAR2-DAM');
  });
});

describe('S24 North Atlantic Storm', () => {
  const scenario = natsEuScenario24Data;
  type S24Settings = Phase3Settings & {
    commanding: { targetNoradId: number; windowStartS: number; windowEndS: number; uplinkFrequencyHz: number };
    transec: { hopChannelsHz: number[] };
    gnssThreat: { groundStationIds?: string[]; spoofStartS: number };
    spaceEvents: Array<{ id: string; satelliteNoradId: number; maneuverAtS: number }>;
    weatherEvents: Array<{ id: string; groundStationId: string; type: string; startTime: number; duration: number }>;
    contactSchedule: { contacts: Array<{ id: string; satelliteNoradId: number; stationId: string; priority: number; windowStartS: number; windowEndS: number }> };
  };
  const s24 = scenario.settings as unknown as S24Settings;

  it('flies SAR-1 at Galway (T+20, 30 deg), SAR-2 at Shetland (T+31, 35 deg) and SAR-3 at Galway (T+52, 28 deg)', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar3 = firstPass(scenario, satOf(scenario, 61703));
    expect(Math.abs((sar1.aosMs - start) / 60_000 - 20.0)).toBeLessThan(0.25);
    expect(Math.abs(sar1.maxEl - 30.2)).toBeLessThan(1.0);
    expect(Math.abs((sar3.aosMs - start) / 60_000 - 52.0)).toBeLessThan(0.25);
    expect(Math.abs(sar3.maxEl - 28.4)).toBeLessThan(1.0);
    // Galway's two contacts do not overlap; the SAR-3 command window sits inside its pass.
    expect(sar1.losMs).toBeLessThan(sar3.aosMs);
    expect(s24.commanding.targetNoradId).toBe(61703);
    expect(s24.commanding.windowStartS * 1000 + start).toBeGreaterThanOrEqual(sar3.aosMs);
    expect(s24.commanding.windowEndS * 1000 + start).toBeLessThanOrEqual(sar3.losMs);
  });

  it('the plan has three P1 contacts, one per bird, each on the only site that can fly it', () => {
    const contacts = s24.contactSchedule.contacts;
    expect(contacts.map((c) => [c.satelliteNoradId, c.stationId, c.priority])).toEqual([
      [61701, 'GW-01', 1],
      [61702, 'SH-02', 1],
      [61703, 'GW-01', 1],
    ]);
    const gw = contacts.filter((c) => c.stationId === 'GW-01');
    expect(gw[0].windowEndS).toBeLessThan(gw[1].windowStartS);
  });

  it('every event of the arc is scheduled once, in the order the network meets it', () => {
    const start = startMsOf(scenario);
    const sar1 = firstPass(scenario, satOf(scenario, 61701));
    const sar3 = firstPass(scenario, satOf(scenario, 61703));
    const rain = s24.weatherEvents.find((w) => w.type === 'rain')!;
    const sleet = s24.weatherEvents.find((w) => w.type === 'hail')!;
    const [burn] = s24.spaceEvents;
    const carrier = s24.interferenceEvents!.find((e) => e.id === 'gw-carrier-sar1')!;
    const jam = s24.interferenceEvents!.find((e) => e.id === 'sar3-uplink-jam')!;

    // Rain band clears before SAR-1 rises; sleet arrives after SAR-1 sets and before SAR-3 rises.
    expect((rain.startTime + rain.duration) * 1000 + start).toBeLessThan(sar1.aosMs);
    expect(sleet.startTime * 1000 + start).toBeGreaterThan(sar1.losMs);
    expect(sleet.startTime * 1000 + start).toBeLessThan(sar3.aosMs);
    // The burn precedes the Shetland pass; the spoof is on Shetland only.
    expect(burn.satelliteNoradId).toBe(61702);
    expect(burn.maneuverAtS).toBeLessThan(s24.contactSchedule.contacts[1].windowStartS);
    expect(s24.gnssThreat.groundStationIds).toEqual(['SH-02']);
    // The terrestrial carrier sits inside the SAR-1 pass; the jammer opens inside the SAR-3 window with room to hop.
    expect(carrier.path).toBe('terrestrial');
    expect(carrier.startTime * 1000 + start).toBeGreaterThan(sar1.aosMs);
    expect(carrier.startTime * 1000 + start).toBeLessThan(sar1.losMs);
    expect(jam.startTime).toBeGreaterThan(s24.commanding.windowStartS + 60);
    expect(s24.commanding.windowEndS - jam.startTime).toBeGreaterThan(5 * 60);
    expect(s24.transec.hopChannelsHz).toContain(s24.commanding.uplinkFrequencyHz);
  });

  it('the denial call is graded on uplink-jammed with the crypto intact, and weather is a wrong answer', () => {
    const objective = scenario.objectives.find((o) => o.id === 'call-the-denial')!;
    const decision = objective.conditions.find((c) => c.type === 'decision')!;
    const siblingIds = new Set(objective.conditions.map((c: Condition) => c.id).filter(Boolean));
    for (const id of decision.params!.evidence!) expect(siblingIds.has(id)).toBe(true);
    const facts: Record<string, boolean> = { 'uplink-jammed': true, 'crypto-intact': true, 'weather-attenuation-dominant': false };
    const holds = (rule: unknown): boolean => {
      const r = rule as { fact?: string; is?: boolean; all?: unknown[]; any?: unknown[] };
      if (r.fact) return (facts[r.fact] ?? false) === r.is;
      if (r.all) return r.all.every(holds);
      return (r.any ?? []).some(holds);
    };
    const correct = decision.params!.decisionOptions!.filter((o) => o.correctWhen && holds(o.correctWhen));
    expect(correct.map((o) => o.label.slice(0, 20))).toEqual(['Uplink denial on the']);
  });

  it('is the campaign capstone: 20 objectives, closing with the incident log and handover', () => {
    expect(scenario.objectives).toHaveLength(20);
    expect(scenario.objectives[0].id).toBe('take-command');
    expect(scenario.objectives.at(-1)!.id).toBe('incident-log-and-handover');
    const total = scenario.objectives.reduce((sum, o) => sum + o.points, 0);
    expect(total).toBeGreaterThanOrEqual(150);
    expect(total).toBeLessThanOrEqual(300);
  });
});
