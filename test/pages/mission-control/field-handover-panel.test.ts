/**
 * M14 handover panel: hidden without forms, per-rule widgets, fill from reading, stale-reading
 * wording, plain rule failures, submit files the record.
 */

import { describeReading, FieldHandoverPanel, STALE_NOTE } from '@app/pages/mission-control/tabs/field-handover-panel';
import { EvidenceLog } from '@app/physical/evidence-log';
import { FieldRecords, type FieldRecordsDeps, type HandoverFormConfig } from '@app/physical/field-records';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { WorkloadRun } from '@app/physical/workload-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it } from 'vitest';

const FORM: HandoverFormConfig = {
  id: 'h1',
  title: 'Shift handover',
  documentSection: 'Handover',
  fields: [
    { key: 'reg', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'registration' } } },
    { key: 'soc', label: 'Battery Wh', required: true, rule: { powerWithin: { metric: 'socWh', tol: 20, partId: 'battery' } } },
    { key: 'why', label: 'Basis', required: true, rule: { cites: 'observation', min: 1 } },
    { key: 'cause', label: 'Cause', required: false, rule: { choice: ['none', 'seating'] } },
    { key: 'run', label: 'Run', required: false, rule: { workload: { cardId: 'card', is: ['supported'] } } },
  ],
};

function rig(withForms = true) {
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
      if (!streams.has(name)) streams.set(name, new RngStream(fnv1a(`m14:${name}`)));

      return streams.get(name) as RngStream;
    },
  });
  const service = new ServiceModel(cfg.service as never, plant, undefined, { now: () => t });
  const log = new EvidenceLog(plant, service);
  plant.update(1);
  const lines: Array<[string, string]> = [];
  const runs: WorkloadRun[] = [];
  const deps: FieldRecordsDeps = { plant, service, evidence: log, runs: () => runs, getCardVersion: () => 1, writeLine: (s, l) => lines.push([s, l]) };
  const records = new FieldRecords(withForms ? [FORM] : [], deps);
  const host = document.createElement('div');
  const panel = new FieldHandoverPanel(host, {
    records: () => (withForms ? records : null),
    evidence: () => log,
    service: () => service,
    runs: () => runs,
    plant: () => plant,
  });

  return { plant, service, log, records, host, panel, lines };
}

function pick(host: HTMLElement, sel: string, value: string): void {
  const el = host.querySelector<HTMLSelectElement>(sel);
  if (el) {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

describe('M14 handover panel', () => {
  it('is hidden without forms', () => {
    const r = rig(false);
    r.panel.sync();
    expect(r.host.style.display).toBe('none');
  });

  it('renders a widget per rule and the stale-reading note', () => {
    const r = rig();
    r.panel.sync();
    expect(r.host.style.display).toBe('');
    expect(r.host.querySelector('[data-fhf="stale"]')?.textContent).toBe(STALE_NOTE);
    expect(STALE_NOTE).toContain('Take the reading again');
    expect(r.host.querySelector('input[data-hf-field="reg"]')).not.toBeNull();
    expect(r.host.querySelector('input[type="number"][data-hf-field="soc"]')).not.toBeNull();
    expect(r.host.querySelector('[data-hf-cites="why"]')?.textContent).toContain('No observed entries yet');
    const opts = [...r.host.querySelectorAll<HTMLOptionElement>('select[data-hf-field="cause"] option')].map((o) => o.value);
    expect(opts).toEqual(['', 'none', 'seating', 'other']);
    expect(r.host.querySelector('select[data-hf-field="run"]')?.textContent).toContain('No runs yet');
  });

  it('fills from the latest reading and says when it is out of date', () => {
    const r = rig();
    r.panel.sync();
    expect(r.host.querySelector('[data-fhf="reading-reg"]')?.textContent).toContain('No registration reading');
    expect(r.panel.fillFromReading('reg')).toBe(false);
    const sample = r.service.takeSample('skylink', 'registration', 'device-indicator');
    r.panel.sync();
    expect(r.panel.fillFromReading('reg')).toBe(true);
    expect(r.host.querySelector<HTMLInputElement>('input[data-hf-field="reg"]')?.value).toBe(String(sample.value));
    expect(r.host.querySelector('[data-fhf="reading-reg"]')?.textContent).toContain('still current');
    r.service.bumpConfig('test');
    r.panel.sync();
    expect(r.host.querySelector('[data-fhf="reading-reg"]')?.textContent).toContain('out of date, take a new one');
    expect(describeReading(r.service, 'skylink', 'registration').current).toBe(false);
    r.panel.check();
    expect(r.host.querySelector('[data-hf-note="reg"]')?.textContent).toContain('out of date');
  });

  it('check shows plain failures without recording; submit files the record', () => {
    const r = rig();
    r.panel.sync();
    r.panel.check();
    expect(r.host.querySelector('[data-hf-note="reg"]')?.textContent).toContain('is empty');
    expect(r.records.allRecords()).toHaveLength(0);
    expect(r.records.attempts('h1')).toBe(0);

    r.plant.inspect('skylink');
    r.service.takeSample('skylink', 'registration', 'device-indicator');
    r.panel.sync();
    r.host.querySelector<HTMLButtonElement>('button[data-hf-fill="reg"]')?.click();
    r.host.querySelector<HTMLButtonElement>('button[data-hf-fill="soc"]')?.click();
    const cite = r.host.querySelector<HTMLInputElement>('[data-hf-cites="why"] input[data-hf-cite]');
    expect(cite).not.toBeNull();
    if (cite) {
      cite.checked = true;
      cite.dispatchEvent(new Event('change', { bubbles: true }));
    }
    pick(r.host, 'select[data-hf-field="cause"]', 'other');
    r.host.querySelector<HTMLButtonElement>('button[data-hf-act="submit"]')?.click();
    expect(r.host.querySelector('[data-hf-note="cause"]')?.textContent).toContain('not one of the answers');
    expect(r.records.allRecords()).toHaveLength(0);
    expect(r.records.attempts('h1')).toBe(1);

    pick(r.host, 'select[data-hf-field="cause"]', 'seating');
    r.host.querySelector<HTMLButtonElement>('button[data-hf-act="submit"]')?.click();
    expect(r.records.allRecords()).toHaveLength(1);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.host.textContent).toContain('Submitted at');
    expect(r.host.querySelector('[data-fhf="filed"]')?.textContent).toContain('Filed 1 time');
  });

  it('a plant action after reading fails the check with the re-read wording', () => {
    const r = rig();
    r.plant.inspect('skylink');
    r.service.takeSample('skylink', 'registration', 'device-indicator');
    r.panel.sync();
    r.panel.fillFromReading('reg');
    r.plant.inspect('router');
    r.panel.check();
    expect(r.host.querySelector('[data-hf-note="reg"]')?.textContent).toContain('out of date');
  });
});
