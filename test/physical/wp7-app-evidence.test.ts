/**
 * Phase 40 WP7: app views and actions as evidence (D7), wrong-cause scoring, E6 transmit time (D10).
 */

import { transmitTimeAtLeast, transmitTimeUnder } from '@app/campaigns/frontline/frontline-conditions';
import { DependencyGraph } from '@app/physical/dependency-graph';
import { diagnosticPercentEffect, matchWrongCauseActions, scoreDiagnosis } from '@app/physical/diagnostic-scorer';
import { APP_VIEW_DEDUPE_S, EvidenceLog } from '@app/physical/evidence-log';
import { setActiveField } from '@app/physical/field-hooks';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { AppWrongCauseRule, PlantConfig, PlantFault } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import { describeFieldDiagnosis } from '@app/scoring/field-diagnosis';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { afterEach, describe, expect, it } from 'vitest';

function plantConfig(): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'router', viaCable: 'dish-cable', nominalV: 12, loadW: 40 },
    ],
    connectors: [
      { id: 'router:dc', feeds: 'router', partId: 'router' },
      { id: 'dish-plug', cableId: 'dish-cable', partId: 'skylink' },
    ],
    cables: [{ id: 'dish-cable', lengthM: 10, cableType: 'power-data', carries: ['power', 'data'], from: 'router', to: 'skylink' }],
    faults: [],
    service: {
      paths: [
        {
          id: 'skylink',
          label: 'SkyLink',
          terminalPartId: 'skylink',
          localPartIds: ['router'],
          accountId: 'acct',
          providerId: 'prov',
          profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
        },
      ],
      accounts: [{ id: 'acct', unitId: 'unit-1', authorized: true, capacityFactor: 1 }],
      providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
    },
  };
}

function rig(faults: PlantFault[] = []) {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const cfg = plantConfig();
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`wp7:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
  for (const f of faults) {
    plant.injectFault(f);
  }
  const service = cfg.service ? new ServiceModel(cfg.service, plant, undefined, { now: () => t }) : null;
  const log = new EvidenceLog(plant, service);
  plant.update(1);

  return {
    plant,
    service,
    log,
    graph: new DependencyGraph(cfg),
    /** Advance sim time in whole seconds, stepping the plant each second */
    run: (s: number) => {
      for (let i = 0; i < s; i++) {
        t += 1;
        plant.update(1);
      }
    },
    now: () => t,
  };
}

const gnss: PlantFault = { id: 'f-gnss', target: 'skylink', kind: 'gnss-denied' };
const rebootRule: AppWrongCauseRule = { id: 'reboot-through-gnss', verbs: ['reboot'], faultKinds: ['gnss-denied', 'snow'], note: 'Rebooting does not bring back a GNSS fix' };

afterEach(() => setActiveField(null));

describe('WP7 app view and action evidence', () => {
  it('records a view as a frozen terminal-app observation naming the screen', () => {
    const { log } = rig();
    const entry = log.recordAppView('advanced', 'SkyLink app, advanced: location valid.');
    expect(entry).toMatchObject({ kind: 'observation', verb: 'app-view', provenance: 'terminal-app', screen: 'advanced', subject: 'skylink-app:advanced' });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  it('dedupes an unchanged view inside the window, records a change at once and the same view after the window', () => {
    const { log, run } = rig();
    expect(log.recordAppView('home', 'Online')).not.toBeNull();
    expect(log.recordAppView('home', 'Online')).toBeNull();
    run(30);
    expect(log.recordAppView('home', 'Online')).toBeNull();
    expect(log.recordAppView('statistics', 'Online')).not.toBeNull();
    expect(log.recordAppView('home', 'Searching')).not.toBeNull();
    run(APP_VIEW_DEDUPE_S);
    expect(log.recordAppView('home', 'Searching')).not.toBeNull();
    expect(log.entries().filter((e) => e.screen === 'home')).toHaveLength(3);
  });

  it('records app-only actions as non-effective actions and does not double a plant verb', () => {
    const { log, plant } = rig();
    log.recordAppAction('speed-test', 'app-speed-test', 'Ran a speed test');
    plant.reboot();
    const actions = log.entries('action');
    expect(actions.map((a) => a.verb)).toEqual(['app-speed-test', 'reboot']);
    expect(actions[0].effective).toBeUndefined();
    expect(actions[0].provenance).toBe('terminal-app');
  });

  it('stamps the injected fault kinds on plant actions and app entries', () => {
    const { log, plant } = rig([gnss]);
    plant.reboot();
    log.recordAppView('home', 'Searching');
    expect(log.entries('action')[0].faultKinds).toEqual(['gnss-denied']);
    expect(log.entries('observation')[0].faultKinds).toEqual(['gnss-denied']);
  });

  it('keeps app entries out of the test-verb scoring', () => {
    const { log, graph, plant } = rig();
    log.recordAppView('home', 'x');
    log.recordAppAction('speed-test', 'app-speed-test', 'y');
    const s = scoreDiagnosis(log, plant, graph);
    expect(s.relevantTests + s.irrelevantTests).toBe(0);
    expect(s.unsupportedFixes).toBe(0);
  });
});

describe('WP7 wrong-cause scoring', () => {
  it('counts a reboot through a declared cause and ignores it without one', () => {
    const wrong = rig([gnss]);
    wrong.plant.reboot();
    const s = scoreDiagnosis(wrong.log, wrong.plant, wrong.graph, [rebootRule]);
    expect(s.wrongCauseActions).toBe(1);
    expect(s.wrongCauseRuleIds).toEqual(['reboot-through-gnss']);

    const clean = rig();
    clean.plant.reboot();
    expect(scoreDiagnosis(clean.log, clean.plant, clean.graph, [rebootRule]).wrongCauseActions).toBe(0);
    expect(scoreDiagnosis(wrong.log, wrong.plant, wrong.graph).wrongCauseActions).toBe(0);
  });

  it('matches app-only verbs and counts each entry once under the first matching rule', () => {
    const { log, plant } = rig([gnss]);
    log.recordAppAction('speed-test', 'app-speed-test', 'Ran a speed test');
    plant.reboot();
    const rules: AppWrongCauseRule[] = [
      { id: 'a', verbs: ['reboot', 'app-speed-test'], faultKinds: ['gnss-denied'], note: 'n' },
      { id: 'b', verbs: ['reboot'], faultKinds: ['gnss-denied'], note: 'n' },
    ];
    expect(matchWrongCauseActions(log, rules).map((m) => m.ruleId)).toEqual(['a', 'a']);
  });

  it('adds 5 percent per wrong-cause action to the shared capped penalty and explains it', () => {
    const base = {
      relevantTests: 0,
      usefulNegatives: 0,
      irrelevantTests: 0,
      supportedFixes: 0,
      unsupportedFixes: 0,
      unsupportedSpares: 0,
      wrongCauseRuleIds: [],
      firstCorrectActionS: null,
      timeToCauseS: null,
      trips: 0,
      spotted: false,
    };
    expect(diagnosticPercentEffect({ ...base, wrongCauseActions: 2 }, 100).penalty).toBe(10);
    expect(diagnosticPercentEffect({ ...base, wrongCauseActions: 9 }, 100).penalty).toBe(20);
    const d = describeFieldDiagnosis({ ...base, wrongCauseActions: 1, wrongCauseRuleIds: ['r'] }, 100, ['Rebooting does not bring back a GNSS fix']);
    expect(d.lines.join('\n')).toContain('wrong cause: 1 (Rebooting does not bring back a GNSS fix)');
    expect(describeFieldDiagnosis({ ...base, wrongCauseActions: 0, wrongCauseRuleIds: [] }, 100).lines.join('\n')).not.toContain('wrong cause');
  });
});

describe('WP7 E6 transmit time', () => {
  it('counts seconds while online and none while booting', () => {
    const { plant, run } = rig();
    run(120);
    expect(plant.getTransmitSeconds()).toBeGreaterThan(100);
    plant.reboot();
    const afterPress = plant.getTransmitSeconds();
    run(60);
    expect(plant.getTransmitSeconds() - afterPress).toBeLessThan(15);
  });

  it('does not count a dish without a location or without power', () => {
    const a = rig([gnss]);
    a.run(100);
    expect(a.plant.getTransmitSeconds()).toBeLessThan(5);
    const b = rig([{ id: 'f-dc', target: 'router:dc', kind: 'unseated' }]);
    b.run(100);
    expect(b.plant.getTransmitSeconds()).toBeLessThan(5);
  });

  it('answers window queries and survives a checkpoint and a reset', () => {
    const { plant, run, now } = rig();
    const t0 = now();
    run(100);
    expect(plant.getTransmitSeconds(t0, t0 + 50)).toBeCloseTo(50, 0);
    const total = plant.getTransmitSeconds();
    const state = plant.getState();
    plant.reset();
    expect(plant.getTransmitSeconds()).toBe(0);
    plant.restoreState(state);
    expect(plant.getTransmitSeconds()).toBe(total);
  });

  it('exposes pass/fail objective conditions', () => {
    const { plant, service, log, run, now } = rig();
    setActiveField({ plant, service, evidence: log, events: null, workloads: null, records: null });
    const ev = (c: { params?: unknown }): boolean => (c.params as { evaluator: () => boolean }).evaluator();
    const from = now();
    const under = transmitTimeUnder({ maxSeconds: 60, fromS: from, toS: from + 100 });
    const budget = transmitTimeUnder({ maxSeconds: 60 });
    const atLeast = transmitTimeAtLeast({ minSeconds: 30 });
    expect(ev(under)).toBe(false);
    expect(ev(budget)).toBe(true);
    expect(ev(atLeast)).toBe(false);
    run(100);
    expect(ev(budget)).toBe(false);
    expect(ev(under)).toBe(false);
    expect(ev(atLeast)).toBe(true);
    setActiveField(null);
    expect(ev(budget)).toBe(false);
  });

  it('a quiet dish passes the window condition once the window closes', () => {
    const { plant, service, log, run, now } = rig([gnss]);
    setActiveField({ plant, service, evidence: log, events: null, workloads: null, records: null });
    const from = now();
    const quiet = transmitTimeUnder({ maxSeconds: 60, fromS: from, toS: from + 100 });
    run(100);
    expect((quiet.params as { evaluator: () => boolean }).evaluator()).toBe(true);
  });
});
