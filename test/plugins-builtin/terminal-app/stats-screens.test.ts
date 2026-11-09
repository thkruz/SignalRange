// @vitest-environment jsdom
import { PhysicalPlantManager } from '@app/physical/physical-plant-manager';
import type { PlantConfig, SkylinkStatus } from '@app/physical/physical-plant-types';
import { ServiceModel } from '@app/physical/service-model';
import type { ServiceModelConfig } from '@app/physical/service-types';
import { WorkloadRunner } from '@app/physical/workload-runner';
import { fnv1a, RngStream } from '@app/simulation/rng';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSpeedTestScreenFor, runSpeedTest, SPEED_TEST_WINDOW_S, speedTestLimit } from '../../../src/plugins-builtin/terminal-app/screens/speed-test-screen';
import { createStatisticsScreen } from '../../../src/plugins-builtin/terminal-app/screens/statistics-screen';
import type { TerminalScreen, TerminalScreenContext } from '../../../src/plugins-builtin/terminal-app/screens/terminal-screen';
import { TerminalAppModel } from '../../../src/plugins-builtin/terminal-app/terminal-app-model';
import { TerminalLink } from '../../../src/plugins-builtin/terminal-app/terminal-link';
import { SKYLINK_SKIN } from '../../../src/plugins-builtin/terminal-app/terminal-skin';

afterEach(() => {
  document.body.innerHTML = '';
});

const serviceCfg = (): ServiceModelConfig => ({
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
});

const plantConfig = (): PlantConfig => ({
  parts: [
    { id: 'battery', kind: 'battery', label: 'Battery', capacityWh: 1000, socWh: 900, maxOutputW: 600, nominalV: 12, loadW: 0 },
    { id: 'router', kind: 'router', label: 'Router', poweredBy: 'battery', loadW: 10, nominalV: 12 },
    {
      id: 'skylink',
      kind: 'terminal',
      label: 'SkyLink',
      poweredBy: 'battery',
      nominalV: 12,
      mode: 'active',
      modes: [
        { id: 'standby', label: 'Standby', loadW: 0, servesTraffic: false },
        { id: 'active', label: 'Active', loadW: 50, servesTraffic: true },
      ],
    },
  ],
  connectors: [],
  cables: [],
});

function rig() {
  const linkState = { up: true };
  const w = { t: 1000, status: 'online' as SkylinkStatus };
  const streams = new Map<string, RngStream>();
  const plant = new PhysicalPlantManager(plantConfig(), {
    now: () => w.t,
    skip: (s) => {
      w.t += s;
    },
    env: () => ({ windMps: 0, rainMmH: 0, ambientC: 15 }),
    rng: (name) => {
      if (!streams.has(name)) {
        streams.set(name, new RngStream(fnv1a(`wp4:${name}`)));
      }

      return streams.get(name) as RngStream;
    },
  });
  const services = new ServiceModel(serviceCfg(), plant, undefined, { now: () => w.t });
  const runner = new WorkloadRunner({ cards: [] }, services, {
    now: () => w.t,
    skip: (s) => {
      w.t += s;
      plant.update(s);
      services.update();
    },
  });
  const model = new TerminalAppModel({
    skin: SKYLINK_SKIN,
    plant: { nowS: () => w.t, dishStatus: () => w.status, powerDrawW: () => 55 },
    link: new TerminalLink({
      routerPowered: () => linkState.up,
      routerBooted: () => true,
      laptopOnRouter: () => true,
      dishCablePathIntact: () => linkState.up,
      dishBooted: () => linkState.up,
    }),
    services,
    serviceId: 'skylink',
  });
  const step = (n: number, dt = 30): void => {
    for (let i = 0; i < n; i++) {
      w.t += dt;
      model.update();
    }
  };
  const ctx = { skin: SKYLINK_SKIN, model, refresh: vi.fn() } as unknown as TerminalScreenContext;

  return { w, model, runner, ctx, step, linkState };
}

function mount(screen: TerminalScreen): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  screen.mount(el as unknown as HTMLElement);

  return el;
}

describe('Statistics screen', () => {
  it('draws charts and switches windows', () => {
    const r = rig();
    r.step(40);
    const screen = createStatisticsScreen(r.ctx);
    const el = mount(screen);
    screen.sync(r.model.view());
    expect(el.querySelectorAll('svg').length).toBe(3);
    expect(el.querySelector('[data-window="15m"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('#stats-axis')?.textContent).toContain('15 min');
    (el.querySelector('[data-window="6h"]') as HTMLElement).click();
    expect(el.querySelector('[data-window="6h"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[data-window="15m"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('#stats-axis')?.textContent).toContain('6 h');
    (el.querySelector('[data-window="12h"]') as HTMLElement).click();
    expect(el.querySelector('#stats-axis')?.textContent).toContain('12 h');
    screen.dispose();
  });

  it('lists outages with cause labels and respects the window', () => {
    const r = rig();
    r.step(4);
    r.w.status = 'obstructed';
    r.step(4);
    r.w.status = 'online';
    r.step(80);
    const screen = createStatisticsScreen(r.ctx);
    const el = mount(screen);
    screen.sync(r.model.view());
    // The outage is about 40 minutes old: outside 15 minutes, inside 6 hours
    expect(el.querySelectorAll('[data-outage]').length).toBe(0);
    expect(el.querySelector('#stats-outage-rows')?.textContent).toContain('No outages');
    (el.querySelector('[data-window="6h"]') as HTMLElement).click();
    const rows = el.querySelectorAll('[data-outage]');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Obstructed');
    expect(rows[0].textContent).toContain('ago');
    screen.dispose();
  });

  it('shows an empty note without data and keeps data after a reboot', () => {
    const r = rig();
    const screen = createStatisticsScreen(r.ctx);
    const el = mount(screen);
    screen.sync(r.model.view());
    expect(el.querySelector('#stats-empty')?.textContent).toContain('No data');
    r.step(10);
    r.model.noteReboot(r.w.t, 100);
    r.w.t += 100;
    r.step(2);
    screen.sync(r.model.view());
    expect(el.querySelector('#stats-empty')?.textContent).toBe('');
    expect(el.querySelectorAll('svg').length).toBe(3);
    screen.dispose();
  });
});

describe('Speed test screen', () => {
  const factory = (r: ReturnType<typeof rig>) => createSpeedTestScreenFor(() => ({ runner: r.runner, serviceId: 'skylink' }));

  it('runs a job, advances sim time and shows the result', () => {
    const r = rig();
    r.step(4);
    const screen = factory(r)(r.ctx);
    const el = mount(screen);
    screen.sync(r.model.view());
    const start = el.querySelector('#speed-start') as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    const t0 = r.w.t;
    start.click();
    expect(r.w.t - t0).toBeGreaterThanOrEqual(SPEED_TEST_WINDOW_S);
    expect(el.querySelector('#speed-down')?.textContent).toContain('Mbps');
    expect(el.querySelector('#speed-lat')?.textContent).toBe('40 ms');
    expect(el.querySelector('#speed-limit')?.textContent).toBe('SkyLink');
    // The run is evidence: the runner holds a finished run with samples
    const runs = r.runner.getRuns();
    expect(runs.length).toBe(1);
    expect(runs[0].sampleIds.length).toBeGreaterThan(0);
    expect(r.model.speedTests().length).toBe(1);
    start.click();
    screen.sync(r.model.view());
    expect(el.querySelector('#speed-history-card')?.hasAttribute('hidden')).toBe(false);
    screen.dispose();
  });

  it('is disabled with a plain message when the link is not connected', () => {
    const r = rig();
    r.step(4);
    r.model.view();
    r.linkState.up = false;
    const screen = factory(r)(r.ctx);
    const el = mount(screen);
    screen.sync(r.model.view());
    expect((el.querySelector('#speed-start') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('#speed-note')?.textContent).toContain('cannot be reached');
    const t0 = r.w.t;
    (el.querySelector('#speed-start') as HTMLButtonElement).click();
    expect(r.w.t).toBe(t0);
    expect(r.runner.getRuns().length).toBe(0);
    screen.dispose();
  });

  it('says the local network limited a result below what the dish reports', () => {
    expect(speedTestLimit(100, 100, 100)).toBe('skylink');
    expect(speedTestLimit(50, 50, 100)).toBe('local-network');
    expect(speedTestLimit(300, 500, 500)).toBe('local-network');
  });

  it('returns nothing when the job cannot start', () => {
    const r = rig();
    r.step(4);
    expect(runSpeedTest({ runner: r.runner, serviceId: 'unknown-path' }, r.model)).toBeNull();
    expect(r.model.speedTests().length).toBe(0);
  });
});
