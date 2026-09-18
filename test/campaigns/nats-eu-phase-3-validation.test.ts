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
import type { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import type { Condition } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { PassPlannerService } from '@app/services/pass-planner-service';

const PHASE_3: ScenarioData[] = [natsEuScenario17Data, natsEuScenario18Data, natsEuScenario19Data, natsEuScenario20Data];

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
    expect(ids).toEqual(['nats-eu-scenario17', 'nats-eu-scenario18', 'nats-eu-scenario19', 'nats-eu-scenario20']);

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
