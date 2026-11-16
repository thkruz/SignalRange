/**
 * Phase 27 (2.B lint gate): nats objectives must not complete before the
 * player acts.
 *
 * Static half. Every nats scenario's stations are built headlessly from the
 * authored start state (the real GroundStation, equipment wired as mission
 * control wires it) and settled for a few seconds of simulation. Then each
 * objective's conditions are evaluated against that state with the engine's
 * own evaluator, under the Phase 27 semantics:
 *
 *  - quiz rows (status-check, decision) and UI/navigation rows (tab,
 *    selection, brief, Ops Log) are the player's to do, never pre-satisfied;
 *  - requiresObservation rows need the player on the tab, so they are skipped;
 *  - rows with an effective requiresChange (B1, condition-semantics.ts) cannot
 *    tick on activation, so they are skipped too.
 *
 * Whatever is left and already true at start would tick the moment its
 * objective activates. It is flagged unless the objective declares
 * `intent: 'confirm'` (the row is meant to confirm a pre-staged state). This
 * is the scenario START state, so it over-reports objectives late in a chain
 * (the player has changed the station by then) and is the static half only:
 * the dynamic half is e2e.
 *
 * Also flagged: hidden tab-active rows whose description does not name the
 * tab (the B5 hint names it; the description is what authors and e2e read).
 *
 * The content rows found on 2026-10-07 are listed in KNOWN_CONTENT_ROWS. A
 * ratchet fails on any row not in that list; the full gate is `.fails` until
 * the content pass clears the list, then flip it to `it`.
 */

import { vi } from 'vitest';

const sim = vi.hoisted(() => ({ groundStations: [] as unknown[], satellites: [] as Array<{ noradId: number }> }));
const scenarioState = vi.hoisted(() => ({ settings: {} as Record<string, unknown>, data: {} as Record<string, unknown> }));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      groundStations: sim.groundStations,
      satellites: sim.satellites,
      getSatByNoradId: (noradId: number) => sim.satellites.find((s) => s.noradId === noradId) ?? null,
      getSatsByAzEl: () => [],
      isDeveloperMode: false,
      update: () => undefined,
      draw: () => undefined,
      sync: () => undefined,
    }),
    hasInstance: () => true,
    destroy: () => undefined,
  },
}));

vi.mock('@app/scenario-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@app/scenario-manager')>();

  return {
    ...actual,
    ScenarioManager: {
      getInstance: () => ({ settings: scenarioState.settings, data: scenarioState.data }),
    },
  };
});

import '@app/campaigns/nats/satellites';
import { GroundStation } from '@app/assets/ground-station/ground-station';
import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { isQuizCondition, resolveRequiresChange } from '@app/objectives/condition-semantics';
import type { Condition, ConditionType, Objective, ObjectiveState } from '@app/objectives/objective-types';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import type { ScenarioData } from '@app/ScenarioData';
import { SCENARIOS } from '@app/scenario-manager';
import { FIXED_STEP_MS, SimClock } from '@app/simulation/sim-clock';

/** Rows the player always does: never pre-satisfied by the station state */
const PLAYER_ACTION_TYPES: ReadonlySet<ConditionType> = new Set<ConditionType>([
  'tab-active',
  'mission-brief-opened',
  'ground-station-selected',
  'satellite-selected',
  'ops-log-entry',
  'campaign-document-reviewed',
]);

/** Seconds of simulation to settle the start state (power-on, AGC, lock delays) */
const SETTLE_SECONDS = 5;

const TAB_NAMES: Record<string, string[]> = {
  dashboard: ['dashboard'],
  'mission-overview': ['overview'],
  'rx-analysis': ['rx analysis', 'rx-analysis', 'receive'],
  'tx-chain': ['tx chain', 'tx-chain', 'transmit'],
  'gps-timing': ['gps timing', 'gps-timing', 'gps', 'timing'],
  'acu-control': ['acu'],
};

interface Flag {
  scenario: string;
  objective: string;
  index: number;
  type: string;
  description: string;
}

function natsScenarios(): ScenarioData[] {
  return SCENARIOS.filter((s) => /^nats-(scenario\d+|level-8-night-shift)$/u.test(s.id));
}

/** Build every station of a scenario the way mission control does, then settle it */
function buildStations(scenario: ScenarioData): void {
  EventBus.destroy();
  SimClock.reset();
  sim.groundStations.length = 0;
  sim.satellites = (scenario.settings.satellites ?? []) as unknown as Array<{ noradId: number }>;
  scenarioState.settings = scenario.settings as unknown as Record<string, unknown>;
  scenarioState.data = scenario as unknown as Record<string, unknown>;
  document.body.innerHTML = '<div id="root"></div>';

  for (const config of scenario.settings.groundStations as GroundStationConfig[]) {
    const station = new GroundStation(config);
    const containers: string[] = [];
    for (let i = 1; i <= 8; i++) {
      containers.push(
        `gs-${station.uuid}-rf-front-end${i}-container`,
        `gs-${station.uuid}-specA${i}-container`,
        `gs-${station.uuid}-tx${i}-container`,
        `gs-${station.uuid}-rx${i}-container`
      );
    }
    document.getElementById('root')!.insertAdjacentHTML('beforeend', containers.map((id) => `<div id="${id}"></div>`).join(''));
    station.initializeEquipment();
  }

  const bus = EventBus.getInstance();
  for (let i = 0; i < SETTLE_SECONDS * 60; i++) {
    SimClock.step();
    bus.emit(Events.UPDATE, FIXED_STEP_MS);
  }
}

function lint(scenario: ScenarioData): { preSatisfied: Flag[]; changeAtStart: Flag[]; unnamedTabs: Flag[]; errors: string[] } {
  const objectives = (scenario.objectives ?? []) as Objective[];
  const requiresChange = resolveRequiresChange(objectives);
  const preSatisfied: Flag[] = [];
  const changeAtStart: Flag[] = [];
  const unnamedTabs: Flag[] = [];
  const errors: string[] = [];

  for (const objective of objectives) {
    objective.conditions.forEach((condition: Condition, index: number) => {
      if (condition.type === 'tab-active' && condition.hidden) {
        const tab = condition.params?.tab ?? '';
        const names = TAB_NAMES[tab] ?? [tab.replace(/-/gu, ' ')];
        if (!names.some((name) => condition.description.toLowerCase().includes(name))) {
          unnamedTabs.push({ scenario: scenario.id, objective: objective.id, index, type: condition.type, description: condition.description });
        }
      }
    });
  }

  try {
    buildStations(scenario);
  } catch (error) {
    errors.push(`${scenario.id}: could not build stations (${(error as Error).message})`);

    return { preSatisfied, changeAtStart, unnamedTabs, errors };
  }

  ObjectivesManager.destroy();
  const manager = ObjectivesManager.initialize(objectives);
  const evaluate = (manager as unknown as { evaluateCondition_: (c: Condition, s: ObjectiveState) => boolean }).evaluateCondition_.bind(manager);

  for (const state of manager.getObjectiveStates()) {
    const objective = state.objective;
    objective.conditions.forEach((condition, index) => {
      if (isQuizCondition(condition.type) || PLAYER_ACTION_TYPES.has(condition.type)) return;
      if (condition.params?.requiresObservation) return;
      let isTrue = false;
      try {
        isTrue = evaluate(condition, state);
      } catch (error) {
        errors.push(`${scenario.id}/${objective.id}[${index}] ${condition.type}: ${(error as Error).message}`);
      }
      const flag = { scenario: scenario.id, objective: objective.id, index, type: condition.type, description: condition.description };
      if (requiresChange.get(condition)) {
        // B1 holds it back: the player must move it off and back, which is
        // wrong for a "keep it so" row (opt out with requiresChange: false)
        if (isTrue) changeAtStart.push(flag);
        return;
      }
      if (isTrue && objective.intent !== 'confirm') {
        preSatisfied.push(flag);
      }
    });
  }
  ObjectivesManager.destroy();

  return { preSatisfied, changeAtStart, unnamedTabs, errors };
}

const format = (f: Flag): string => `${f.scenario} ${f.objective}[${f.index}] ${f.type} "${f.description}"`;

/**
 * Rows the lint found on 2026-10-07, after the Phase 27 engine semantics.
 * Each needs a content decision: a real action (re-stage the start state or
 * add the step that breaks it), a read quiz (Q3), `intent: 'confirm'`, or a
 * `requiresChange: true` on the row. Remove rows as they are fixed; when the
 * list is empty, flip the `.fails` gate below to `it`.
 */
/**
 * Set-type rows (B1 requiresChange ON by default) that already match the
 * scenario start state, found 2026-10-07. Under B1 each ticks only after the
 * player moves the value off and back. Right for "set it" rows whose start
 * state should not already match (re-stage the start state instead); WRONG for
 * "keep it so" rows ("BUC Stays Unmuted", "Program-Track Held (no chasing)",
 * "Customer Traffic Still Flowing", "Uplink Untouched"): those need
 * `requiresChange: false` or the player has to break the link to tick them.
 * Informational ratchet: a new row here is a content regression.
 */
const KNOWN_REQUIRES_CHANGE_ROWS: readonly string[] = [
  'nats-scenario2 repoint-antenna[1] antenna-tracking-mode-set "Tracking Mode Set to Program Track"',
  'nats-scenario2 power-up-lnb[1] equipment-powered "LNB Powered On"',
  'nats-scenario2 power-up-lnb[2] lnb-lo-set "LNB LO Set to 5,250 MHz"',
  'nats-scenario2 power-up-lnb[3] lnb-gain-set "LNB Gain Set to 60 dB"',
  'nats-scenario2 start-modem-transmitting[1] tx-modem-transmitting "Modem Transmitting"',
  'nats-scenario2 power-on-buc[1] equipment-powered "BUC Powered On"',
  'nats-scenario2 power-on-hpa[1] equipment-powered "HPA Powered On"',
  'nats-scenario2 enable-hpa-output[1] hpa-enabled "HPA Output Enabled"',
  'nats-scenario7 enable-loopback[1] buc-loopback-enabled "BUC Loopback Enabled"',
  'nats-scenario7 enable-loopback[2] buc-unmuted "BUC Unmuted"',
  'nats-level-8-night-shift verify-loopback-signal[3] speca-max-amplitude "Max Amplitude -30 dBm"',
  'nats-level-8-night-shift resolve-lnb-fault[1] equipment-powered "LNB Power-Cycled (Off, Then On)"',
  'nats-level-8-night-shift enable-hpa-sequence[1] hpa-enabled "HPA Output Enabled"',
  'nats-scenario9 return-to-tidemark1[1] speca-center-frequency "Spectrum Analyzer at 1074.5 MHz IF"',
  'nats-scenario9 restore-vt-tx[1] hpa-enabled "HPA Output Enabled"',
  'nats-scenario10 restore-conservative-backoff[0] hpa-back-off-set "Backoff: 10 dB"',
  // Late-chain "bring it back" rows: true at scenario start, but the chain
  // turns them off first (S16 mutes the BUC for cooldown, S20 disables the
  // overdriven HPA), so at activation they are false and requiresChange is
  // what the player does. Static false positives of this lint.
  'nats-scenario16 unmute-buc-restore-tx[1] buc-unmuted "BUC Unmuted"',
  // S8 backs the BUC off to 15 dB for the loop (Phase 28 D3), so the 23 dB
  // restore is false at activation
  'nats-level-8-night-shift disable-loopback-prepare-uplink[2] buc-gain-set "BUC Gain Back to 23 dB"',
  'nats-scenario20 me-reenable-hpa[1] hpa-enabled "HPA Output Enabled"',
];

const KNOWN_CONTENT_ROWS: readonly string[] = [
  'nats-scenario2 repoint-antenna[2] antenna-position "Antenna Pointed at TIDEMARK-1"',
  'nats-scenario2 power-up-lnb[4] lnb-thermally-stable "LNB Thermally Stabilized"',
  'nats-scenario4 enable-transmit-path[2] hpa-not-overdriven "HPA Not Overdriven"',
  'nats-scenario6 enable-transmit-path[2] hpa-not-overdriven "HPA Not Overdriven"',
  'nats-scenario7 enable-hpa-output[2] hpa-not-overdriven "HPA Not Overdriven"',
  'nats-level-8-night-shift disable-loopback-prepare-uplink[1] buc-loopback-disabled "Loopback Disabled"',
  'nats-scenario9 return-to-tidemark1[0] antenna-locked "Locked on TIDEMARK-1"',
  'nats-scenario10 acquire-stable-beacon[0] antenna-beacon-locked "Beacon Lock Sustained"',
  'nats-scenario10 verify-no-overdrive[0] hpa-not-overdriven "HPA Not Overdriven"',
  'nats-scenario10 stand-by-for-window[0] antenna-beacon-locked "Beacon Held on Standby"',
  'nats-scenario10 sustain-rx-margin[0] receiver-snr-threshold "C/N Held Above 9 dB"',
  'nats-scenario10 sustain-beacon-track[0] antenna-beacon-locked "Beacon Stays Locked"',
  'nats-scenario10 restore-conservative-backoff[1] hpa-not-overdriven "HPA Healthy"',
  'nats-scenario11 me-stage-tx-for-handover[2] buc-muted "BUC Stays Muted Until the Swap"',
  'nats-scenario11 me-stage-tx-for-handover[3] hpa-disabled "HPA Stays Disabled Until the Swap"',
  'nats-scenario12 execute-handover-return[1] traffic-transferred "Traffic Returned to VT-01"',
];

/**
 * Receiver and transmitter panels both render `id="modem-1"`. Browsers scope
 * `el.querySelector('#modem-1')` to `el`; jsdom's id fast path finds the
 * document's first match and returns null when it sits outside `el`. Retry a
 * bare `#id` as an attribute selector, which jsdom scopes correctly (same shim
 * as the player-replay harness).
 */
const originalQuerySelector = Element.prototype.querySelector;
function shimScopedIdQuery(): void {
  Element.prototype.querySelector = function (this: Element, selector: string) {
    const found = originalQuerySelector.call(this, selector);
    const id = found ? null : /^#([\w-]+)$/u.exec(selector)?.[1];

    return id ? originalQuerySelector.call(this, `[id="${id}"]`) : found;
  } as typeof Element.prototype.querySelector;
}

describe('nats objective intent lint (Phase 27 2.B)', () => {
  const results = new Map<string, ReturnType<typeof lint>>();

  beforeAll(() => {
    shimScopedIdQuery();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    for (const scenario of natsScenarios()) {
      results.set(scenario.id, lint(scenario));
    }
    vi.restoreAllMocks();
  }, 120_000);

  afterAll(() => {
    Element.prototype.querySelector = originalQuerySelector;
    ObjectivesManager.destroy();
    EventBus.destroy();
    SimClock.reset();
    document.body.innerHTML = '';
  });

  it('lints every nats scenario, and every station builds headlessly', () => {
    expect(results.size).toBeGreaterThanOrEqual(24);
    const errors = [...results.values()].flatMap((r) => r.errors);
    expect(errors).toEqual([]);
  });

  it('flags no row beyond the known content list (ratchet: new rows are regressions)', () => {
    const flags = [...results.values()].flatMap((r) => r.preSatisfied).map(format);
    expect(flags.filter((flag) => !KNOWN_CONTENT_ROWS.includes(flag))).toEqual([]);
  });

  it('flags no set-type row matching the start state beyond the known list (ratchet)', () => {
    const flags = [...results.values()].flatMap((r) => r.changeAtStart).map(format);
    expect(flags.filter((flag) => !KNOWN_REQUIRES_CHANGE_ROWS.includes(flag))).toEqual([]);
  });

  it.fails('no objective row is already satisfied by the start state (mark intent: "confirm" if it should be)', () => {
    const flags = [...results.values()].flatMap((r) => r.preSatisfied).map(format);
    expect(flags).toEqual([]);
  });

  it('every hidden tab-active row names its tab', () => {
    const flags = [...results.values()].flatMap((r) => r.unnamedTabs).map(format);
    expect(flags).toEqual([]);
  });
});
