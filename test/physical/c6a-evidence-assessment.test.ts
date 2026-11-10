/**
 * Campaign 6 gap package A: typed evidence predicates, hypothesis scope/target/route checks, choice
 * backing, the answer-key-free panel, and frozen typed citations.
 */

import { FieldHandoverPanel } from '@app/pages/mission-control/tabs/field-handover-panel';
import { type EvidenceEntry, EvidenceLog } from '@app/physical/evidence-log';
import { assessEvidence, assessHypothesis, type EvidenceGroup } from '@app/physical/evidence-predicates';
import { FieldRecords, type FieldRecordsDeps, type HandoverFormConfig } from '@app/physical/field-records';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const EVENT = 'incident';
const FIRED_AT = 1000;
const ctx = { eventFiredAtS: (id: string) => (id === EVENT ? FIRED_AT : null) };

let seq = 0;
function sampleEntry(layer: string, value: string, tS: number, serviceId = 'eurosat'): EvidenceEntry {
  seq += 1;

  return {
    id: `ev-${seq}`,
    kind: 'observation',
    tS,
    subject: serviceId,
    source: { sampleId: `s-${seq}` },
    sample: { serviceId, layer, metric: 'status', value, unit: 'state', provenance: 'probe' },
    facts: [],
    text: `${layer} status: ${value}`,
  };
}
function action(over: Partial<EvidenceEntry> & { tS: number }): EvidenceEntry {
  seq += 1;

  return { id: `ev-${seq}`, kind: 'action', subject: 'part', source: {}, facts: [], text: 'did a thing', ...over };
}

const LOCAL: EvidenceGroup = { id: 'local', label: 'local up after', match: { serviceId: 'eurosat', layer: 'local', valueIn: ['up'], afterEvent: EVENT } };
const DOWN: EvidenceGroup = { id: 'down', label: 'registration down after', match: { serviceId: 'eurosat', layer: 'registration', valueIn: ['down'], afterEvent: EVENT } };

describe('C6 gap A: evidence predicates', () => {
  it('three arbitrary observations of another service cannot satisfy an incident pattern', () => {
    const entries = [sampleEntry('application', 'up', 1100, 'skylink'), sampleEntry('local', 'up', 1110, 'skylink'), sampleEntry('registration', 'up', 1120, 'skylink')];
    const v = assessEvidence(
      entries.map((e) => e.id),
      [LOCAL, DOWN],
      entries,
      ctx
    );
    expect(v.ok).toBe(false);
    expect(v.missing).toEqual([LOCAL.label, DOWN.label]);
  });

  it('repeating one id cannot satisfy a count, and one entry cannot fill two groups', () => {
    const down = sampleEntry('registration', 'down', 1100);
    const two: EvidenceGroup = { ...DOWN, min: 2 };
    expect(assessEvidence([down.id, down.id, down.id], [two], [down], ctx).ok).toBe(false);
    const second = sampleEntry('registration', 'down', 1200);
    expect(assessEvidence([second.id, down.id, down.id], [two], [down, second], ctx).ok).toBe(true);
    const both: EvidenceGroup = { ...DOWN, id: 'down-b', label: 'another down' };
    expect(assessEvidence([down.id], [DOWN, both], [down], ctx).ok).toBe(false);
  });

  it('distinct but irrelevant entries do not satisfy evidence groups', () => {
    const noise = [action({ tS: 1100 }), action({ tS: 1101 }), action({ tS: 1102 })];
    expect(
      assessEvidence(
        noise.map((e) => e.id),
        [LOCAL],
        noise,
        ctx
      ).ok
    ).toBe(false);
  });

  it('a pre-incident sample supports a baseline but cannot prove recovery', () => {
    const before = sampleEntry('registration', 'up', 900);
    const baseline: EvidenceGroup = {
      id: 'baseline',
      label: 'registration up before',
      match: { serviceId: 'eurosat', layer: 'registration', valueIn: ['up'], beforeEvent: EVENT },
    };
    const recovery: EvidenceGroup = { id: 'recovery', label: 'registration up after', match: { serviceId: 'eurosat', layer: 'registration', valueIn: ['up'], afterEvent: EVENT } };
    expect(assessEvidence([before.id], [baseline], [before], ctx).ok).toBe(true);
    expect(assessEvidence([before.id], [recovery], [before], ctx).ok).toBe(false);
    // An event that has not fired proves nothing in either direction
    expect(assessEvidence([before.id], [{ ...baseline, match: { ...baseline.match, beforeEvent: 'never' } }], [before], ctx).ok).toBe(false);
  });

  it('entries without typed sample metadata cannot satisfy a sample predicate', () => {
    const legacy: EvidenceEntry = { id: 'old-1', kind: 'observation', tS: 1100, subject: 'eurosat', source: { sampleId: 's' }, facts: [], text: 'local status: up' };
    expect(assessEvidence([legacy.id], [LOCAL], [legacy], ctx).ok).toBe(false);
    expect(assessEvidence([legacy.id], [{ id: 'any', label: 'any observation', match: { kind: 'observation' } }], [legacy], ctx).ok).toBe(true);
  });
});

describe('C6 gap A: hypothesis assessment', () => {
  const local = sampleEntry('local', 'up', 1100);
  const down = sampleEntry('registration', 'down', 1110);
  const all = [local, down];
  const spec = { causes: ['suspected-interference', 'unexplained-outage'], scopes: ['segment'], targets: ['eurosat'], minCited: 2, routes: [[LOCAL, DOWN]] };
  const claim = (over: Partial<{ scope: string; targetId: string; cause: string }> = {}) => ({
    claim: { scope: 'segment', targetId: 'eurosat', cause: 'unexplained-outage', ...over },
    citedEntryIds: [local.id, down.id],
  });

  it('accepts a matching cause with relevant backing', () => {
    expect(assessHypothesis(claim(), spec, all, ctx).ok).toBe(true);
  });

  it('rejects a matching cause with the wrong scope or target and says why', () => {
    const scope = assessHypothesis(claim({ scope: 'part' }), spec, all, ctx);
    const target = assessHypothesis(claim({ targetId: 'skylink' }), spec, all, ctx);
    expect(scope.ok).toBe(false);
    expect(scope.reason).toContain('wrong kind');
    expect(target.ok).toBe(false);
    expect(target.reason).toContain('wrong target');
    expect(assessHypothesis(claim({ cause: 'named-source' }), spec, all, ctx).ok).toBe(false);
  });

  it('rejects duplicate citations and irrelevant backing', () => {
    expect(assessHypothesis({ ...claim(), citedEntryIds: [local.id, local.id] }, spec, all, ctx).ok).toBe(false);
    const noise = [action({ tS: 1100 }), action({ tS: 1101 })];
    const bad = assessHypothesis({ ...claim(), citedEntryIds: noise.map((e) => e.id) }, { ...spec, minCited: 2 }, noise, ctx);
    expect(bad.ok).toBe(false);
  });

  it('accepts either of two valid evidence routes, including a recovery route after a blind repair', () => {
    const fix = action({ tS: 1050, effective: true, subject: 'vsat-modem' });
    const pre = sampleEntry('registration', 'down', 1000);
    const post = sampleEntry('registration', 'up', 1100);
    const diagnostic: EvidenceGroup = {
      id: 'pre-fix',
      label: 'a reading before the repair',
      match: { kind: 'observation', beforeFirstFix: true, serviceId: 'eurosat', layer: 'registration' },
    };
    const recovery: EvidenceGroup = {
      id: 'post-fix',
      label: 'a reading after the repair',
      match: { kind: 'observation', afterFirstFix: true, serviceId: 'eurosat', layer: 'registration', valueIn: ['up'] },
    };
    const routed = { causes: ['terminal-fault'], minCited: 1, routes: [[diagnostic], [recovery]] };
    const entries = [pre, fix, post];
    const h = (ids: string[]) => ({ claim: { scope: 'part', targetId: 'vsat-modem', cause: 'terminal-fault' }, citedEntryIds: ids });
    expect(assessHypothesis(h([pre.id]), routed, entries, ctx).ok).toBe(true);
    expect(assessHypothesis(h([post.id]), routed, entries, ctx).ok).toBe(true);
    // An action alone is neither a diagnostic nor a recovery reading
    expect(assessHypothesis(h([fix.id]), routed, entries, ctx).ok).toBe(false);
  });

  it('applies backing per cause', () => {
    const strict = { ...spec, routes: undefined, routesByCause: { 'suspected-interference': [[LOCAL, { ...DOWN, min: 2 }]], 'unexplained-outage': [[LOCAL, DOWN]] } };
    expect(assessHypothesis(claim({ cause: 'unexplained-outage' }), strict, all, ctx).ok).toBe(true);
    expect(assessHypothesis(claim({ cause: 'suspected-interference' }), strict, all, ctx).ok).toBe(false);
  });
});

// ------------------------------------------------------------------ rig with the real log

const AFTER: EvidenceGroup = { id: 'after', label: 'a SkyLink reading after the incident', match: { serviceId: 'skylink', layer: 'registration', afterEvent: EVENT } };

const FORM: HandoverFormConfig = {
  id: 'f',
  title: 'Assessment',
  documentSection: 'Assessment',
  fields: [
    {
      key: 'class',
      label: 'Classification',
      required: true,
      rule: {
        choice: ['interference', 'outage', 'terminal'],
        labels: { interference: 'Suspected interference', outage: 'Unexplained outage', terminal: 'Terminal fault' },
        accept: ['interference', 'outage'],
        backing: { outage: [AFTER] },
      },
    },
    { key: 'basis', label: 'Basis', required: true, rule: { evidence: [AFTER] } },
  ],
};

function rig(form: HandoverFormConfig) {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const cfg = {
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
  } as PlantConfig;
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`c6a:${name}`)));

      return streams.get(name) as RngStream;
    },
  });
  const service = new ServiceModel(cfg.service as never, plant, undefined, { now: () => t });
  const log = new EvidenceLog(plant, service);
  plant.update(1);
  const deps: FieldRecordsDeps = { plant, service, evidence: log, runs: () => [], getCardVersion: () => 1, eventFiredAtS: (id) => (id === EVENT ? 150 : null) };
  const records = new FieldRecords([form], deps);

  return {
    plant,
    service,
    log,
    records,
    deps,
    advance: (s: number) => {
      t += s;
    },
  };
}

describe('C6 gap A: records and panel', () => {
  it('a correct label without the required backing fails; with it passes', () => {
    const r = rig(FORM);
    const early = r.service.takeSample('skylink', 'registration', 'device-indicator');
    r.advance(100);
    const late = r.service.takeSample('skylink', 'registration', 'device-indicator');
    const ev = (sampleId: string) => r.log.entries('observation').find((e) => e.source.sampleId === sampleId)?.id ?? '';
    const unbacked = r.records.validate('f', { class: { value: 'outage' }, basis: { cites: [ev(late.id)] } });
    expect(unbacked.fields.find((f) => f.key === 'class')?.reason).toContain('back this answer');
    const preIncident = r.records.validate('f', { class: { value: 'outage', cites: [ev(early.id)] }, basis: { cites: [ev(early.id)] } });
    expect(preIncident.ok).toBe(false);
    const good = r.records.validate('f', { class: { value: 'outage', cites: [ev(late.id)] }, basis: { cites: [ev(late.id)] } });
    expect(good.ok).toBe(true);
    // The unaccepted visible alternative is refused
    expect(r.records.validate('f', { class: { value: 'terminal', cites: [ev(late.id)] }, basis: { cites: [ev(late.id)] } }).ok).toBe(false);
  });

  it('shows meaningful alternatives, not only the accepted answer, and lists what evidence is needed', () => {
    const r = rig(FORM);
    const host = document.createElement('div');
    const panel = new FieldHandoverPanel(host, { records: () => r.records, evidence: () => r.log, service: () => r.service, runs: () => [], plant: () => r.plant });
    panel.sync();
    const opts = [...host.querySelectorAll<HTMLOptionElement>('select[data-hf-field="class"] option')].map((o) => o.textContent);
    expect(opts).toEqual(['Pick one', 'Suspected interference', 'Unexplained outage', 'Terminal fault', 'Other']);
    expect(host.querySelector('[data-fhf="needs-basis"]')?.textContent).toContain('a SkyLink reading after the incident');
  });

  it('frozen typed evidence survives checkpoint storage and later state', () => {
    const r = rig(FORM);
    r.advance(100);
    const late = r.service.takeSample('skylink', 'registration', 'device-indicator');
    const id = r.log.entries('observation').find((e) => e.source.sampleId === late.id)?.id ?? '';
    const res = r.records.submit('f', { class: { value: 'outage', cites: [id] }, basis: { cites: [id] } });
    expect(res.ok).toBe(true);
    const saved = JSON.parse(JSON.stringify(r.records.getState())) as ReturnType<FieldRecords['getState']>;
    r.service.bumpConfig('later change');
    r.service.takeSample('skylink', 'registration', 'device-indicator');
    const again = new FieldRecords([FORM], r.deps);
    again.restoreState(saved);
    const frozen = again.allRecords()[0].citations.basis[0];
    expect(frozen.sample).toMatchObject({ serviceId: 'skylink', layer: 'registration' });
    expect(frozen.tS).toBe(late.tS);
    expect(frozen.text).toBe(r.log.entries().find((e) => e.id === id)?.text);
    // Mutating the checkpoint copy cannot rewrite the stored record
    saved.records[0].citations.basis[0].text = 'edited';
    expect(again.allRecords()[0].citations.basis[0].text).not.toBe('edited');
  });
});
