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
import { RADIO_TX_MS } from '@app/pages/mission-control/tabs/radio/radio-app';
import { callLog, radioChannels, replyText } from '@app/pages/mission-control/tabs/radio/radio-calls';
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceModelConfig } from '@app/physical/service-types';
import { describe, expect, it, vi } from 'vitest';

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
  it('keeps readings with the instrument that actually took them', () => {
    const { model, now } = rig();
    const host = document.createElement('div');
    const panel = new FieldServicePanel(host, () => model, now);
    panel.check('skylink', 'registration', 'terminal-app');
    panel.setSource('pilot-report');
    // The radio's call log holds pilot and endpoint reports only: the terminal-app reading is not on it
    expect(host.querySelector('[data-radio="log"]')?.textContent).toContain('No calls yet.');
    panel.setSource('terminal-app');
    expect(host.querySelector('[data-fsp="source-skylink|registration|"]')?.textContent).toBe('Terminal app');
    expect(host.querySelector('[data-svc-layer="power"]')).toBeNull();
    expect(host.querySelector('select')).toBeNull();
    panel.destroy();
  });
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
    panel.setSource('device-indicator');
    expect(s?.tS).toBe(now());
    expect(host.querySelector('[data-fsp="badge-skylink|power|"]')?.textContent).toMatch(/^Current, fresh until elapsed [0-9]{2}:[0-9]{2}$/u);
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
    panel.setSource('device-indicator');
    panel.check('skylink', 'power', 'device-indicator');
    expect(host.querySelector('[data-fsp="last"]')?.textContent).toContain('A later checklist step reads');
    state = 'active';
    panel.check('skylink', 'power', 'device-indicator');
    expect(host.querySelector('[data-fsp="last"]')?.textContent).not.toContain('A later checklist step reads');
  });

  it('NetProbe pings through the terminal without a source menu; config changes invalidate the reading', () => {
    const { model, plant, now } = rig();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const panel = new FieldServicePanel(host, () => model, now);
    panel.setSource('local-probe');
    plant.setPartMode('skylink', 'active');
    plant.update(120);
    expect(host.querySelector('select')).toBeNull();
    panel.netprobe.selectHost('skylink', 'registration');
    const taken = panel.netprobe.run('ping', model);
    expect(taken.map((s) => s.metric)).toEqual(['rttMs', 'lossPct']);
    expect(taken.every((s) => s.provenance === 'local-probe')).toBe(true);
    panel.sync();
    expect(host.querySelector('[data-np="console"]')?.textContent).toMatch(/Latency .* ms/u);
    plant.setPartMode('skylink', 'standby');
    panel.sync();
    expect(model.freshness(taken[0])).toBe('invalidated');
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
    expect(svc.history[0].text).toMatch(/^elapsed \d\d:\d\d /u);
    const host = document.createElement('div');
    new FieldServicePanel(host, () => null, now).sync();
    expect(host.style.display).toBe('none');
    expect(formatAge(200)).toBe('3 min ago');
  });
});

describe('badgeText', () => {
  it('says when a Current reading goes out of date', () => {
    const sample = { tS: 600, maxAgeS: 120 } as never;
    expect(badgeText({ freshness: 'current', sample })).toBe('Current, fresh until elapsed 12:00');
    expect(badgeText({ freshness: 'stale', sample })).toBe('Stale');
    expect(badgeText({ freshness: null, sample: null })).toBe('');
  });
});

describe('Phase 44 field radio', () => {
  it('offers a channel per party: pilot, remote operator, each endpoint', () => {
    const { model } = rig();
    const channels = radioChannels(model);
    expect(channels.map((c) => [c.id, c.via, c.number])).toEqual([
      ['pilot', 'pilot-report', 1],
      ['operator', 'endpoint-report', 2],
      ['endpoint:hq', 'endpoint-report', 3],
    ]);
    expect(channels[0].questions.map((q) => q.layer)).toEqual(['registration', 'provider']);
    expect(channels[2].questions[0]).toMatchObject({ serviceId: 'skylink', layer: 'application', endpointId: 'hq' });
  });

  it('a push-to-talk call takes the same sample, costs the same time and logs it on the pad', () => {
    vi.useFakeTimers();
    try {
      const { model, now } = rig();
      const host = document.createElement('div');
      const spent: number[] = [];
      const panel = new FieldServicePanel(
        host,
        () => model,
        now,
        (s) => spent.push(s)
      );
      panel.setSource('endpoint-report');
      const lcd = host.querySelector<HTMLElement>('[data-radio-lcd]');
      expect(lcd?.dataset.radioChannel).toBe('operator');
      expect(lcd?.dataset.radioQuestion).toBe('skylink|application|');
      host.querySelector<HTMLButtonElement>('[data-radio-ptt]')?.click();
      expect(host.querySelector('[data-radio="mode"]')?.textContent).toBe('TX');
      expect(model.samplesFor('skylink')).toHaveLength(0);
      vi.advanceTimersByTime(RADIO_TX_MS);
      const [s] = model.samplesFor('skylink');
      expect(s).toMatchObject({ provenance: 'endpoint-report', layer: 'application', endpointId: undefined });
      expect(spent).toEqual([15]);
      expect(host.querySelector('[data-radio="reply"]')?.textContent).toMatch(/^Remote operator \(SkyLink\): .+Over\.$/u);
      const entry = host.querySelector(`[data-radio-entry="${s.id}"]`);
      expect(entry?.querySelector('[data-radio-reading]')?.textContent).toBeTruthy();
      expect(entry?.querySelector('[data-radio-badge]')?.textContent).toMatch(/^Current, fresh until/u);
      panel.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns the channel knob with the keyboard and steps questions with the keys', () => {
    const { model, now } = rig();
    const host = document.createElement('div');
    const panel = new FieldServicePanel(host, () => model, now);
    panel.setSource('pilot-report');
    const knob = host.querySelector<HTMLElement>('[data-radio-knob="channel"]')!;
    const lcd = () => host.querySelector<HTMLElement>('[data-radio-lcd]')!;
    expect(lcd().dataset.radioChannel).toBe('pilot');
    host.querySelector<HTMLButtonElement>('[data-radio-ask="next"]')?.click();
    expect(lcd().dataset.radioQuestion).toBe('skylink|provider|');
    knob.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(lcd().dataset.radioChannel).toBe('operator');
    expect(knob.getAttribute('aria-valuetext')).toBe('Channel 2, Remote operator');
    knob.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    knob.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(lcd().dataset.radioChannel).toBe('endpoint:hq');
    panel.destroy();
  });

  it('a second PTT press during TX takes one sample and PTT keeps focus (aria-disabled, not disabled)', () => {
    vi.useFakeTimers();
    try {
      const { model, now } = rig();
      const host = document.createElement('div');
      document.body.append(host);
      const panel = new FieldServicePanel(host, () => model, now);
      panel.setSource('pilot-report');
      const ptt = host.querySelector<HTMLButtonElement>('[data-radio-ptt]')!;
      ptt.focus();
      ptt.click();
      ptt.click();
      expect(ptt.getAttribute('aria-disabled')).toBe('true');
      expect(ptt.disabled).toBe(false);
      expect(document.activeElement).toBe(ptt);
      vi.advanceTimersByTime(RADIO_TX_MS * 3);
      expect(model.samplesFor('skylink')).toHaveLength(1);
      expect(document.activeElement).toBe(ptt);
      expect(ptt.getAttribute('aria-disabled')).toBe('false');
      panel.destroy();
      host.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it('an endpoint channel passes its endpoint id and the reply names the service', () => {
    vi.useFakeTimers();
    try {
      const { model, now } = rig();
      const host = document.createElement('div');
      const panel = new FieldServicePanel(host, () => model, now);
      panel.setSource('endpoint-report');
      host.querySelector<HTMLElement>('[data-radio-knob="channel"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(host.querySelector<HTMLElement>('[data-radio-lcd]')?.dataset.radioChannel).toBe('endpoint:hq');
      host.querySelector<HTMLButtonElement>('[data-radio-ptt]')?.click();
      vi.advanceTimersByTime(RADIO_TX_MS);
      expect(model.samplesFor('skylink')[0]).toMatchObject({ provenance: 'endpoint-report', endpointId: 'hq' });
      expect(host.querySelector('[data-radio="reply"]')?.textContent).toMatch(/^Hq \(SkyLink\): /u);
      // Changing the question clears the reply and the RX state
      host.querySelector<HTMLButtonElement>('[data-radio-ask="next"]')?.click();
      expect(host.querySelector<HTMLElement>('[data-radio="reply"]')?.hidden).toBe(true);
      expect(host.querySelector<HTMLElement>('.frd-radio')?.dataset.radioState).toBe('idle');
      panel.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('destroy() mid-TX takes no sample', () => {
    vi.useFakeTimers();
    try {
      const { model, now } = rig();
      const host = document.createElement('div');
      const panel = new FieldServicePanel(host, () => model, now);
      panel.setSource('pilot-report');
      host.querySelector<HTMLButtonElement>('[data-radio-ptt]')?.click();
      panel.destroy();
      vi.advanceTimersByTime(RADIO_TX_MS * 2);
      expect(model.samplesFor('skylink')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the wheel needs about 50 px of travel per detent', () => {
    const { model, now } = rig();
    const host = document.createElement('div');
    const panel = new FieldServicePanel(host, () => model, now);
    panel.setSource('pilot-report');
    const knob = host.querySelector<HTMLElement>('[data-radio-knob="channel"]')!;
    const lcd = () => host.querySelector<HTMLElement>('[data-radio-lcd]')!;
    const wheel = (deltaY: number) => knob.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
    for (let i = 0; i < 4; i++) wheel(10);
    expect(lcd().dataset.radioChannel).toBe('pilot');
    wheel(10);
    expect(lcd().dataset.radioChannel).toBe('operator');
    wheel(120);
    expect(lcd().dataset.radioChannel).toBe('pilot');
    panel.destroy();
  });

  it('words replies plainly and keeps the formal reading and freshness in the call log', () => {
    const { model, advance } = rig();
    const pilot = model.takeSample('skylink', 'registration', 'pilot-report');
    expect(replyText(model, pilot)).toMatch(/Over\.$/u);
    model.takeSample('skylink', 'registration', 'terminal-app');
    advance(700);
    const log = callLog(model);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ party: 'Pilot', subject: 'SkyLink · Terminal link', freshness: 'stale', badge: 'Stale' });
  });
});
