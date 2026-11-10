/**
 * M09 field service panel: provenance menus per layer, timed samples with freshness badges,
 * no layer truth leaked, symptom history, hidden without services.
 */

import {
  badgeText,
  buildServicePanelModel,
  FieldServicePanel,
  formatAge,
  formatSampleValue,
  isNumericCheck,
  provenancesFor,
} from '@app/pages/mission-control/tabs/field-service-panel';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceModelConfig } from '@app/physical/service-types';
import { describe, expect, it } from 'vitest';

const serviceCfg = (): ServiceModelConfig => ({
  paths: [
    {
      id: 'skylink',
      label: 'SkyLink',
      terminalPartId: 'skylink',
      localPartIds: ['router'],
      accountId: 'acct',
      providerId: 'prov',
      endpointIds: ['hq'],
      profile: { downMbps: 100, upMbps: 20, rttMs: 40, lossPct: 0.5 },
    },
  ],
  accounts: [{ id: 'acct', unitId: 'u', authorized: true, capacityFactor: 1 }],
  providers: [{ id: 'prov', status: 'normal', capacityFactor: 1, noticeIds: [] }],
  endpoints: [{ id: 'hq', reachable: true }],
});

function rig() {
  let t = 100;
  const cfg: PlantConfig = {
    parts: [
      { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
      { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
      {
        id: 'skylink',
        kind: 'terminal',
        label: 'SkyLink',
        poweredBy: 'battery',
        nominalV: 12,
        mode: 'standby',
        modes: [
          { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
          { id: 'active', label: 'Active', loadW: 50, servesTraffic: true },
        ],
      },
    ],
    connectors: [],
    cables: [],
  };
  const plant = new PhysicalPlantManager(cfg, {
    now: () => t,
    skip: (s) => {
      t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: () => ({ next: () => 0.5 }),
  });
  const model = new ServiceModel(serviceCfg(), plant, undefined, { now: () => t });
  plant.update(1);

  return { plant, model, advance: (s: number) => (t += s), now: () => t };
}

describe('M09 field service panel', () => {
  it('offers only provenances that can see a layer', () => {
    expect(provenancesFor('power')).toEqual(['device-indicator']);
    expect(provenancesFor('application')).toEqual(['endpoint-report', 'workload-run']);
    expect(provenancesFor('registration')).not.toContain('workload-run');
    expect(isNumericCheck('local-probe', 'registration')).toBe(true);
    expect(isNumericCheck('device-indicator', 'power')).toBe(false);
  });

  it('model has a row per layer plus one per endpoint, unchecked at first', () => {
    const { model, now } = rig();
    const [svc] = buildServicePanelModel(model, now());
    expect(svc.rows.map((r) => r.layer)).toEqual(['power', 'local', 'registration', 'account', 'provider', 'application', 'application']);
    expect(svc.rows.every((r) => r.sample === null && r.value === 'Not checked' && r.freshness === null)).toBe(true);
  });

  it('a check records a timed sample and ages to stale', () => {
    const { model, advance, now } = rig();
    const host = document.createElement('div');
    const panel = new FieldServicePanel(host, () => model, now);
    panel.sync();
    const s = panel.check('skylink', 'power', 'device-indicator');
    expect(s?.tS).toBe(now());
    expect(host.querySelector('[data-fsp="badge-skylink|power|"]')?.textContent).toMatch(/^Current, fresh until [0-9]{2}:[0-9]{2}$/u);
    advance(30);
    panel.sync();
    expect(host.querySelector('[data-fsp="badge-skylink|power|"]')?.textContent).toBe('Stale');
    expect(host.querySelector('[data-fsp="age-skylink|power|"]')?.textContent).toBe('30 s ago');
    expect(host.querySelector('[data-fsp="source-skylink|power|"]')?.textContent).toBe('Device light');
  });

  it('adds a note when the step that reads the sample has not started', () => {
    const { model, now } = rig();
    const host = document.createElement('div');
    let state: 'later' | 'active' = 'later';
    const panel = new FieldServicePanel(
      host,
      () => model,
      now,
      null,
      () => state
    );
    panel.sync();
    panel.check('skylink', 'power', 'device-indicator');
    expect(host.querySelector('[data-fsp="last"]')?.textContent).toContain('A later checklist step reads');
    state = 'active';
    panel.check('skylink', 'power', 'device-indicator');
    expect(host.querySelector('[data-fsp="last"]')?.textContent).not.toContain('A later checklist step reads');
  });

  it('the Check button reads the selects; numeric probe gives units; a config change invalidates', () => {
    const { model, plant, now } = rig();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new FieldServicePanel(host, () => model, now);
    panel.sync();
    plant.setPartMode('skylink', 'active');
    plant.update(120);
    const row = host.querySelector<HTMLElement>('[data-svc-layer="registration"]') as HTMLElement;
    const via = row.querySelector('select[data-svc-via]') as HTMLSelectElement;
    via.value = 'local-probe';
    via.dispatchEvent(new Event('change', { bubbles: true }));
    const metric = row.querySelector('select[data-svc-metric]') as HTMLSelectElement;
    expect(metric.style.display).toBe('');
    metric.value = 'rttMs';
    (row.querySelector('button[data-svc-check]') as HTMLButtonElement).click();
    const sample = model.latest('skylink', 'registration');
    expect(sample?.metric).toBe('rttMs');
    expect(host.querySelector('[data-fsp="value-skylink|registration|"]')?.textContent).toMatch(/Latency .* ms/u);
    plant.setPartMode('skylink', 'standby');
    panel.sync();
    expect(host.querySelector('[data-fsp="badge-skylink|registration|"]')?.textContent).toBe('Invalidated');
    host.remove();
  });

  it('a light cannot see the application layer, and nothing prints layer truth', () => {
    const { model, now } = rig();
    const host = document.createElement('div');
    const panel = new FieldServicePanel(host, () => model, now);
    panel.sync();
    const bad = model.takeSample('skylink', 'application', 'device-indicator');
    expect(formatSampleValue(bad)).toBe('No reading');
    expect(host.textContent).not.toContain('mode-standby');
  });

  it('history lists status changes newest first and the panel hides without services', () => {
    const { model, plant, now } = rig();
    model.update();
    plant.setPartMode('skylink', 'active');
    plant.update(60);
    model.update();
    const [svc] = buildServicePanelModel(model, now());
    expect(svc.history.length).toBeGreaterThan(0);
    expect(svc.history[0].text).toMatch(/^\d\d:\d\d /u);
    const host = document.createElement('div');
    new FieldServicePanel(host, () => null, now).sync();
    expect(host.style.display).toBe('none');
    expect(formatAge(200)).toBe('3 min ago');
  });
});

describe('badgeText', () => {
  it('says when a Current reading goes out of date', () => {
    const sample = { tS: 600, maxAgeS: 120 } as never;
    expect(badgeText({ freshness: 'current', sample })).toBe('Current, fresh until 12:00');
    expect(badgeText({ freshness: 'stale', sample })).toBe('Stale');
    expect(badgeText({ freshness: null, sample: null })).toBe('');
  });
});
