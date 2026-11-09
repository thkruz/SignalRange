/**
 * M13 handover core: claim rules, frozen citations, Working Document lines, campaign record sink,
 * checkpoint round-trip and the handoverValid condition.
 */

import * as C from '@app/campaigns/frontline/frontline-conditions';
import { EventBus } from '@app/events/event-bus';
import { EvidenceLog } from '@app/physical/evidence-log';
import { FieldRecords, type FieldRecordsDeps, type HandoverFormConfig, type HandoverRecord } from '@app/physical/field-records';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import { PhysicalPlantService } from '@app/physical/physical-plant-service';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { WorkloadRun } from '@app/physical/workload-types';
import { ScenarioManager } from '@app/scenario-manager';
import { collectManagerStates, restoreManagerStates } from '@app/scenarios/checkpoint-manager-states';
import { fnv1a, Rng, RngStream } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function plantConfig(handovers?: HandoverFormConfig[]): PlantConfig {
  return {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      { id: 'skylink', kind: 'terminal', label: 'SkyLink', poweredBy: 'battery', nominalV: 12, loadW: 50 },
    ],
    connectors: [],
    cables: [],
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
    ...(handovers ? { handovers } : {}),
  } as PlantConfig;
}

const FORM: HandoverFormConfig = {
  id: 'h1',
  title: 'Shift handover',
  documentSection: 'Handover',
  fields: [
    { key: 'reg', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'registration' } } },
    { key: 'soc', label: 'Battery Wh', required: true, rule: { powerWithin: { metric: 'socWh', tol: 20, partId: 'battery' } } },
    { key: 'why', label: 'Basis', required: true, rule: { cites: 'observation', min: 1 } },
    { key: 'cause', label: 'Cause', required: false, rule: { choice: ['none', 'seating'] } },
  ],
};

function rig() {
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
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`m13:${name}`)));

      return streams.get(name) as RngStream;
    },
  });
  const service = new ServiceModel(cfg.service as never, plant, undefined, { now: () => t });
  const log = new EvidenceLog(plant, service);
  plant.update(1);
  const lines: Array<[string, string]> = [];
  const stored: HandoverRecord[] = [];
  const state = { runs: [] as WorkloadRun[] };
  const deps: FieldRecordsDeps = {
    plant,
    service,
    evidence: log,
    runs: () => state.runs,
    getCardVersion: () => 1,
    writeLine: (s, l) => lines.push([s, l]),
    storeRecord: (r) => stored.push(r),
  };
  const records = new FieldRecords([FORM], deps);

  return { plant, service, log, records, lines, stored, state };
}

/** Take a registration reading and an inspect; return the sample value and an observation entry id */
function observe(r: ReturnType<typeof rig>): { value: string; cite: string } {
  r.plant.inspect('skylink');
  const sample = r.service.takeSample('skylink', 'registration', 'device-indicator');
  const cite = r.log.entries().find((x) => x.kind === 'observation');

  return { value: String(sample.value), cite: cite?.id ?? 'missing' };
}

const field = (v: { fields: Array<{ key: string }> }, key: string) => v.fields.find((c) => c.key === key) as { key: string; ok: boolean; reason?: string };

describe('M13 handover validation', () => {
  it('rejects empty required fields with plain reasons and records nothing', () => {
    const r = rig();
    const res = r.records.submit('h1', {});
    expect(res.ok).toBe(false);
    expect(res.validation.fields.filter((f) => !f.ok).map((f) => f.key)).toEqual(['reg', 'soc', 'why']);
    expect(res.validation.fields[0].reason).toContain('empty');
    expect(r.records.isHandoverValid('h1')).toBe(false);
    expect(r.records.attempts('h1')).toBe(1);
    expect(r.lines).toHaveLength(0);
  });

  it('matchesCurrent needs a fresh reading equal to the value', () => {
    const r = rig();
    const f = (v: string) => field(r.records.validate('h1', { reg: { value: v } }), 'reg');
    expect(f('up').reason).toContain('no reading');
    const sample = r.service.takeSample('skylink', 'registration', 'device-indicator');
    expect(f(String(sample.value)).ok).toBe(true);
    expect(f('definitely-not').ok).toBe(false);
    r.service.bumpConfig('test');
    expect(f(String(sample.value)).reason).toContain('out of date');
  });

  it('powerWithin honours the tolerance and rejects non-numbers', () => {
    const r = rig();
    const f = (v: string | number) => field(r.records.validate('h1', { soc: { value: v } }), 'soc');
    expect(f(900).ok).toBe(true);
    expect(f(885).ok).toBe(true);
    expect(f(700).ok).toBe(false);
    expect(f('abc').ok).toBe(false);
  });

  it('cites needs real entries of the right kind', () => {
    const r = rig();
    const { cite } = observe(r);
    const f = (ids: string[]) => field(r.records.validate('h1', { why: { cites: ids } }), 'why');
    expect(f(['nope']).ok).toBe(false);
    expect(f([cite]).ok).toBe(true);
  });

  it('choice never matches an unlisted answer and optional blanks pass', () => {
    const r = rig();
    const f = (v?: string) => field(r.records.validate('h1', { cause: { value: v } }), 'cause');
    expect(f().ok).toBe(true);
    expect(f('seating').ok).toBe(true);
    expect(f('other').ok).toBe(false);
  });

  it('modeIs and workload rules', () => {
    const r = rig();
    const forms: HandoverFormConfig[] = [
      {
        id: 'm',
        title: 'M',
        documentSection: 'S',
        fields: [
          { key: 'mode', label: 'Mode', required: true, rule: { modeIs: { partId: 'router' } } },
          { key: 'run', label: 'Run', required: true, rule: { workload: { cardId: 'chat', is: ['supported'] } } },
        ],
      },
    ];
    const state = { runs: [] as WorkloadRun[] };
    const rec = new FieldRecords(forms, { plant: r.plant, service: r.service, evidence: r.log, runs: () => state.runs, getCardVersion: () => 2 });
    const base = {
      id: 'run-1',
      cardId: 'chat',
      cardVersion: 2,
      serviceId: 'skylink',
      startS: 0,
      endS: 10,
      status: 'supported',
      sampleIds: [],
      worst: 'supported',
      unmet: [],
      configEpoch: 0,
      eventEpoch: 0,
    } as WorkloadRun;
    const chk = () => field(rec.validate('m', { run: { value: 'run-1' } }), 'run');
    expect(chk().ok).toBe(false);
    state.runs = [base];
    expect(chk().ok).toBe(true);
    state.runs = [{ ...base, status: 'degraded' }];
    expect(chk().reason).toContain('degraded');
    state.runs = [{ ...base, invalidatedBy: 'config' }];
    expect(chk().reason).toContain('no longer counts');
    state.runs = [{ ...base, cardVersion: 1 }];
    expect(chk().ok).toBe(false);
    expect(field(rec.validate('m', { mode: { value: 'x' } }), 'mode').ok).toBe(false);
  });
});

describe('M13 submission', () => {
  it('accepts a valid form, freezes citations, writes lines and files the record', () => {
    const r = rig();
    const o = observe(r);
    const res = r.records.submit('h1', { reg: { value: o.value }, soc: { value: 900 }, why: { cites: [o.cite] }, cause: { value: 'none' } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(r.records.isHandoverValid('h1')).toBe(true);
    const entry = r.log.entries().find((x) => x.id === o.cite);
    expect(res.record.citations.why[0].text).toBe(entry?.text);
    expect(r.lines.length).toBe(res.record.lines.length);
    expect(r.lines.every(([s]) => s === 'Handover')).toBe(true);
    expect(r.lines.some(([, l]) => l.includes('backed by #'))).toBe(true);
    expect(r.stored).toEqual([res.record]);
  });

  it('unknown form is rejected', () => {
    const res = rig().records.submit('zzz', {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown-form');
  });

  it('round-trips state and refiles records', () => {
    const r = rig();
    const o = observe(r);
    r.records.submit('h1', { reg: { value: o.value }, soc: { value: 900 }, why: { cites: [o.cite] } });
    const saved = JSON.parse(JSON.stringify(r.records.getState()));
    const again = rig();
    again.records.restoreState(saved);
    expect(again.records.isHandoverValid('h1')).toBe(true);
    expect(again.stored).toHaveLength(1);
    expect(again.records.attempts('h1')).toBe(1);
  });
});

describe('M13 service wiring', () => {
  beforeEach(() => {
    EventBus.destroy();
    SimClock.reset();
    Rng.setSeed(5);
  });
  afterEach(() => {
    PhysicalPlantService.destroy();
    EventBus.destroy();
  });

  it('exists only with authored forms, feeds handoverValid and survives a checkpoint', () => {
    ScenarioManager.getInstance().settings = { physicalPlant: plantConfig() } as never;
    expect(PhysicalPlantService.getInstance().records).toBeNull();
    PhysicalPlantService.destroy();
    ScenarioManager.getInstance().settings = { physicalPlant: plantConfig([FORM]) } as never;
    const svc = PhysicalPlantService.getInstance();
    expect(svc.records).not.toBeNull();
    expect(PhysicalPlantService.recordsOrNull()).toBe(svc.records);
    const ev = (C.handoverValid('h1').params as { evaluator: () => boolean }).evaluator;
    expect(ev()).toBe(false);
    svc.plant.inspect('skylink');
    const sample = svc.services?.takeSample('skylink', 'registration', 'device-indicator');
    const cite = svc.evidence?.entries('observation')[0];
    const res = svc.records?.submit('h1', { reg: { value: String(sample?.value) }, soc: { value: 900 }, why: { cites: [cite?.id ?? ''] } });
    expect(res?.ok).toBe(true);
    expect(ev()).toBe(true);
    const states = JSON.parse(JSON.stringify(collectManagerStates()));
    expect(states.physicalPlant.records.records).toHaveLength(1);
    PhysicalPlantService.destroy();
    ScenarioManager.getInstance().settings = { physicalPlant: plantConfig([FORM]) } as never;
    const again = PhysicalPlantService.getInstance();
    restoreManagerStates(states);
    expect(again.records?.isHandoverValid('h1')).toBe(true);
  });
});
