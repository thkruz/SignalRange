/**
 * M14 handover panel: hidden without forms, per-rule widgets, fill from reading, stale-reading
 * wording, plain rule failures, submit files the record.
 */

import { describeReading, FieldHandoverPanel, STALE_NOTE, splitLatestPerSource } from '@app/pages/mission-control/tabs/field-handover-panel';
import { EvidenceLog } from '@app/physical/evidence-log';
import { FieldRecords, type FieldRecordsDeps, type HandoverFormConfig } from '@app/physical/field-records';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { WorkloadRun } from '@app/physical/workload-types';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { describe, expect, it, vi } from 'vitest';

const FORM: HandoverFormConfig = {
  id: 'h1',
  title: 'Shift handover',
  documentSection: 'Handover',
  fields: [
    { key: 'reg', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'registration' } } },
    { key: 'soc', label: 'Battery Wh', required: true, rule: { powerWithin: { metric: 'socWh', tol: 20, partId: 'battery' } } },
    { key: 'fuel', label: 'Fuel L', required: false, rule: { powerWithin: { metric: 'fuelL', tol: 0.5, partId: 'gen' } } },
    { key: 'why', label: 'Basis', required: true, rule: { cites: 'observation', min: 1 } },
    { key: 'cause', label: 'Cause', required: false, rule: { choice: ['none', 'seating'] } },
    { key: 'run', label: 'Run', required: false, rule: { workload: { cardId: 'card', is: ['supported'] } } },
  ],
};

function rig(withForms = true, form: HandoverFormConfig = FORM) {
  let t = 100;
  const streams = new Map<string, RngStream>();
  const cfg = {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'gen', kind: 'generator', label: 'Generator', running: true, fuelL: 5.9, tankL: 7, burnLPerHour: 1.5, nominalV: 230 },
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
  const records = new FieldRecords(withForms ? [form] : [], deps);
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

/** Tick the answer `value` of a written-in choice (a printed tick box), as a click on it does */
function pick(host: HTMLElement, sel: string, value: string): void {
  const el = host.querySelector<HTMLInputElement>(`${sel}[value="${value}"]`);
  if (el) {
    el.checked = true;
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
    expect(STALE_NOTE).not.toContain('as soon as you do anything');
    expect(r.host.querySelector('input[data-hf-field="reg"]')).not.toBeNull();
    expect(r.host.querySelector('input[type="number"][data-hf-field="soc"]')).not.toBeNull();
    expect(r.host.querySelector('[data-hf-cites="why"]')?.textContent).toContain('No observed entries yet');
    const opts = [...r.host.querySelectorAll<HTMLInputElement>('input[type="radio"][data-hf-field="cause"]')].map((o) => o.value);
    expect(opts).toEqual(['none', 'seating', 'other']);
    expect(r.host.querySelector('[data-hf-field-group="run"]')?.textContent).toContain('No runs yet');
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
    r.plant.inspect('battery');
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
    pick(r.host, 'input[type="radio"][data-hf-field="cause"]', 'other');
    r.host.querySelector<HTMLButtonElement>('button[data-hf-act="submit"]')?.click();
    expect(r.host.querySelector('[data-hf-note="cause"]')?.textContent).toContain('not one of the answers');
    expect(r.records.allRecords()).toHaveLength(0);
    expect(r.records.attempts('h1')).toBe(1);

    pick(r.host, 'input[type="radio"][data-hf-field="cause"]', 'seating');
    r.host.querySelector<HTMLButtonElement>('button[data-hf-act="submit"]')?.click();
    expect(r.records.allRecords()).toHaveLength(1);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.host.textContent).toContain('Submitted at');
    expect(r.host.querySelector('[data-fhf="filed"]')?.textContent).toBe('');
  });

  it('a plant action after reading fails the check with the re-read wording', () => {
    const r = rig();
    r.plant.inspect('skylink');
    r.service.takeSample('skylink', 'registration', 'device-indicator');
    r.panel.sync();
    r.panel.fillFromReading('reg');
    r.plant.spendTime(400);
    r.plant.inspect('router');
    r.panel.check();
    expect(r.host.querySelector('[data-hf-note="reg"]')?.textContent).toContain('out of date');
  });

  it('use-my-reading fills fuel only after the generator was inspected', () => {
    const r = rig();
    r.panel.sync();
    expect(r.panel.fillFromReading('fuel')).toBe(false);
    r.plant.inspect('gen');
    r.panel.sync();
    expect(r.panel.fillFromReading('fuel')).toBe(true);
  });

  it('use-my-reading fills stored energy only after the power station was inspected, and the inspect text carries the figure', () => {
    const r = rig();
    r.panel.sync();
    expect(r.panel.fillFromReading('soc')).toBe(false);
    const seen = r.plant.inspect('battery');
    expect(seen.observation).toMatch(/\d+ Wh stored/u);
    r.panel.sync();
    expect(r.panel.fillFromReading('soc')).toBe(true);
  });

  it('a reading under an empty line is labelled as a reading to copy, not a bare figure that looks entered', () => {
    const r = rig();
    r.plant.inspect('battery');
    r.panel.sync();
    const input = r.host.querySelector<HTMLInputElement>('input[data-hf-field="soc"]');
    expect(input?.value).toBe('');
    const hint = r.host.querySelector('[data-fhf="reading-soc"]')?.textContent ?? '';
    expect(hint).toMatch(/^Latest reading: \d+(\.\d)?\./u);
    expect(hint).toMatch(/write it on the line/u);
  });

  it('the fuel hint names the body or fuel cap, and the generator inspect text carries the gauge figure that the hint promises', () => {
    const r = rig();
    r.panel.sync();
    const hint = r.host.querySelector('[data-hf-row="fuel"]')?.textContent ?? '';
    expect(hint).toMatch(/body or the fuel cap/u);
    expect(r.host.querySelector('[data-hf-row="soc"]')?.textContent ?? '').not.toMatch(/fuel cap/u);
    expect(r.plant.inspect('gen').observation).toMatch(/\d+(\.\d)? L/u);
  });

  it('keeps Check and Sign in a foot with a how-to line that says how to finish the form', () => {
    const r = rig();
    r.panel.sync();
    const foot = r.host.querySelector('.fhf-foot');
    expect(foot?.querySelector('[data-hf-act="check"]')).not.toBeNull();
    expect(foot?.querySelector('[data-hf-act="submit"]')).not.toBeNull();
    expect(foot?.querySelector('[data-fhf="howto"]')?.textContent).toMatch(/Sign here to file/u);
  });
});

describe('M14 handover panel typing and wording (P42)', () => {
  it('a periodic sync never rebuilds or overwrites a field the player is typing in', () => {
    const r = rig();
    document.body.appendChild(r.host);
    r.panel.sync();
    const input = r.host.querySelector<HTMLInputElement>('input[data-hf-field="soc"]');
    expect(input).not.toBeNull();
    (input as HTMLInputElement).focus();
    (input as HTMLInputElement).value = '443';
    input?.dispatchEvent(new Event('input', { bubbles: true }));
    // Something the form depends on changes, so a naive sync would rebuild the fields
    r.plant.inspect('battery');
    r.panel.sync();
    r.panel.sync();
    const after = r.host.querySelector<HTMLInputElement>('input[data-hf-field="soc"]');
    expect(after).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(after?.value).toBe('443');
    // Once focus leaves, the next sync catches up with the new reading hint
    (input as HTMLInputElement).blur();
    r.panel.sync();
    expect(r.host.querySelector('[data-fhf="reading-soc"]')?.textContent ?? '').toContain('Latest reading');
    expect(r.host.querySelector<HTMLInputElement>('input[data-hf-field="soc"]')?.value).toBe('443');
    r.host.remove();
  });

  it('a mode answer matches without regard to case or surrounding spaces', () => {
    const mode = 'run';
    const form: HandoverFormConfig = {
      id: 'm',
      title: 'Mode',
      documentSection: 'M',
      fields: [{ key: 'mode', label: 'Generator mode', required: true, rule: { modeIs: { partId: 'gen' } } }],
    };
    const r = rig(true, form);
    vi.spyOn(r.plant, 'getPartMode').mockReturnValue('run');
    r.panel.selectForm('m');
    r.panel.setValue('mode', `  ${mode.toUpperCase()} `);
    expect(r.panel.check()?.ok).toBe(true);
    r.panel.setValue('mode', `${mode}x`);
    expect(r.panel.check()?.ok).toBe(false);
  });

  it('a mode answer accepts the label the Power panel shows as well as the stored key, and rejects another mode', () => {
    const form: HandoverFormConfig = {
      id: 'm',
      title: 'Mode',
      documentSection: 'M',
      fields: [{ key: 'mode', label: 'Terminal mode', required: true, rule: { modeIs: { partId: 'gen' } } }],
    };
    const r = rig(true, form);
    vi.spyOn(r.plant, 'getPartMode').mockReturnValue('run');
    vi.spyOn(r.plant, 'getModeOptions').mockReturnValue([
      { id: 'standby', label: 'Standby', loadW: 0 },
      { id: 'run', label: 'Running', loadW: 50 },
    ]);
    r.panel.selectForm('m');
    for (const typed of ['run', 'Running', '  RUNNING ', 'ru n']) {
      r.panel.setValue('mode', typed);
      expect(r.panel.check()?.ok, typed).toBe(true);
    }
    for (const typed of ['standby', 'Standby', 'stopped', '']) {
      r.panel.setValue('mode', typed);
      expect(r.panel.check()?.ok, typed).toBe(false);
    }
  });

  it('Copy latest reading on an empty run-rate field says to start the run, not to inspect a power part', () => {
    const form: HandoverFormConfig = {
      id: 'rr',
      title: 'RR',
      documentSection: 'R',
      fields: [{ key: 'w', label: 'Run rate W', required: true, rule: { runRate: { cardId: 'card' } } }],
    };
    const r = rig(true, form);
    r.panel.selectForm('rr');
    expect(r.panel.fillFromReading('w')).toBe(false);
    const msg = r.host.querySelector('[data-fhf="msg"]')?.textContent ?? '';
    expect(msg).not.toMatch(/Inspect|Power panel/u);
    expect(msg).toMatch(/start the run/iu);
    expect(msg).not.toMatch(/Finish the task run first/u);
  });
});

describe('splitLatestPerSource', () => {
  const e = (id: string, tS: number, layer: string): never =>
    ({ id, tS, kind: 'observation', subject: 'svc', text: id, sample: { serviceId: 'svc', layer, metric: 'status', value: 'up', unit: 'state', provenance: 'x' } }) as never;

  it('puts the newest entry per layer first and the rest under older', () => {
    const { latest, older } = splitLatestPerSource([e('a1', 10, 'power'), e('b1', 20, 'local'), e('a2', 30, 'power'), e('b2', 40, 'local')]);
    expect(latest.map((x) => x.id)).toEqual(['b2', 'a2']);
    expect(older.map((x) => x.id)).toEqual(['b1', 'a1']);
  });
});

describe('M14 handover panel unread readings and ticks (P46)', () => {
  const form: HandoverFormConfig = {
    id: 'p46',
    title: 'Baseline',
    documentSection: 'B',
    fields: [
      { key: 'service', label: 'Service checked', required: true, rule: { choice: ['skylink', 'both'], labels: { skylink: 'SkyLink', both: 'Both' } } },
      { key: 'power', label: 'Terminal power', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'power' } } },
      { key: 'reg', label: 'Registration', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'registration' } } },
      { key: 'app', label: 'Application', required: true, rule: { matchesCurrent: { serviceId: 'skylink', layer: 'application' } } },
    ],
  };

  it('a terminal power field with no reading names the light to look at and where, not just that there is none', () => {
    const r = rig(true, form);
    r.panel.selectForm('p46');
    const hint = r.host.querySelector('[data-fhf="reading-power"]')?.textContent ?? '';
    expect(hint).toMatch(/Power light/u);
    expect(hint).toMatch(/Router/u);
    expect(hint).toMatch(/close-up/u);
  });

  it('a registration field with no reading names the NetProbe command and the light', () => {
    const r = rig(true, form);
    r.panel.selectForm('p46');
    const hint = r.host.querySelector('[data-fhf="reading-reg"]')?.textContent ?? '';
    expect(hint).toMatch(/Link status/u);
    expect(hint).toMatch(/NetProbe/u);
  });

  it('an application or account field never prints Service checks, in the hint or the Copy refusal', () => {
    const r = rig(true, form);
    r.panel.selectForm('p46');
    const hint = r.host.querySelector('[data-fhf="reading-app"]')?.textContent ?? '';
    expect(hint).toMatch(/No application reading taken yet./u);
    expect(hint).not.toMatch(/Service checks/u);
    expect(r.panel.fillFromReading('app')).toBe(false);
    expect(r.host.querySelector('[data-fhf="msg"]')?.textContent ?? '').not.toMatch(/Service checks/u);
  });

  it('Copy latest reading with no reading to copy says how to take it, beside the field message', () => {
    const r = rig(true, form);
    r.panel.selectForm('p46');
    expect(r.panel.fillFromReading('reg')).toBe(false);
    const msg = r.host.querySelector('[data-fhf="msg"]')?.textContent ?? '';
    expect(msg).toMatch(/terminal link reading to copy/u);
    expect(msg).not.toMatch(/registration/u);
    expect(msg).toMatch(/Link status/u);
    expect(msg).not.toMatch(/Inspect that part/u);
  });

  it('ticking an answer clears the "is empty" note on that field at once', () => {
    const r = rig(true, form);
    r.panel.selectForm('p46');
    r.panel.check();
    expect(r.host.querySelector('[data-hf-note="service"]')?.textContent).toMatch(/is empty/u);
    expect(r.host.querySelector('[data-fhf="msg"]')?.textContent).toMatch(/Service checked is empty/u);
    document.body.appendChild(r.host);
    r.host.querySelector<HTMLInputElement>('input[type="radio"][data-hf-field="service"][value="skylink"]')?.click();
    expect(r.host.querySelector('[data-hf-note="service"]')).toBeNull();
    expect(r.host.querySelector('[data-fhf="msg"]')?.textContent).not.toMatch(/Service checked is empty/u);
    expect(r.host.querySelector<HTMLInputElement>('input[data-hf-field="service"][value="skylink"]')?.checked).toBe(true);
    expect(r.panel.check()?.fields.find((c) => c.key === 'service')?.ok).toBe(true);
  });
});
