// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AntennaPageRegistry, createMissionControlApi } from '../../../src/pages/mission-control/antenna-page-registry';
import type { SleepSchedule, SnowMeltMode, TerminalSettings } from '../../../src/physical/physical-plant-types';
import { builtinPluginManifest } from '../../../src/plugins/plugin-manifest';
import type { PluginApi } from '../../../src/plugins/signal-range-plugin';
import { SkylinkDashboardPage } from '../../../src/plugins-builtin/terminal-app/skylink-dashboard';
import { TerminalAppModel } from '../../../src/plugins-builtin/terminal-app/terminal-app-model';
import { TerminalAppPlugin } from '../../../src/plugins-builtin/terminal-app/terminal-app-plugin';
import { TerminalLink } from '../../../src/plugins-builtin/terminal-app/terminal-link';
import { TerminalRuntime, type TerminalRuntimePlant } from '../../../src/plugins-builtin/terminal-app/terminal-runtime';
import { SKYLINK_SKIN } from '../../../src/plugins-builtin/terminal-app/terminal-skin';

function setup(linkOk = { router: true, dish: true }) {
  const w = { t: 1000, status: 'online' as const, link: linkOk };
  const settings: TerminalSettings = { snowMelt: 'off', sleep: null, wifi: { ssid: 'SKYLINK', password: 'password1' } };
  const calls: string[] = [];
  const plant: TerminalRuntimePlant = {
    getTimeSeconds: () => w.t,
    reboot: () => {
      calls.push('reboot');

      return { observation: '', costSeconds: 10, downtimeSeconds: 100 };
    },
    setSnowMelt: (m: SnowMeltMode) => {
      calls.push(`snow:${m}`);
      settings.snowMelt = m;

      return { observation: '', costSeconds: 5 };
    },
    setSleep: (s: SleepSchedule | null) => {
      calls.push(`sleep:${s ? `${s.startS}-${s.endS}` : 'off'}`);
      settings.sleep = s;

      return { observation: '', costSeconds: 5 };
    },
    setRouterWifi: (wifi) => {
      calls.push(`wifi:${wifi.ssid}`);
      settings.wifi = wifi;

      return { observation: '', costSeconds: 0 };
    },
    getTerminalSettings: () => settings,
  };
  const model = new TerminalAppModel({
    skin: SKYLINK_SKIN,
    plant: { nowS: () => w.t, dishStatus: () => w.status, powerDrawW: () => 55 },
    link: new TerminalLink({
      routerPowered: () => w.link.router,
      routerBooted: () => w.link.router,
      laptopOnRouter: () => true,
      dishCablePathIntact: () => w.link.dish,
      dishBooted: () => w.link.dish,
    }),
    services: {
      peekSample: (_i, _l, _v, _e, metric = 'status') => ({ value: metric === 'status' ? 'up' : ({ downMbps: 120, upMbps: 12, rttMs: 38, lossPct: 0 } as const)[metric], tS: w.t }),
    },
    serviceId: 'skylink',
  });
  for (let i = 0; i < 4; i++) {
    w.t += 30;
    model.update();
  }
  const runtime = new TerminalRuntime(plant, model);
  document.body.innerHTML = '<div id="host"></div>';
  const page = new SkylinkDashboardPage('host', runtime);
  page.activate();

  return { w, model, runtime, page, calls, settings };
}

const text = (sel: string): string => document.querySelector(sel)?.textContent ?? '';
const click = (sel: string): void => (document.querySelector(sel) as HTMLElement).click();
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('SkyLink dashboard shell', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the nav and Home with live data when connected', () => {
    const { page } = setup();

    expect(document.querySelectorAll('[data-screen]')).toHaveLength(6);
    expect(text('#home-hero')).toBe('Online');
    expect(text('#home-down')).toBe('120 Mbps');
    expect(text('#home-latency')).toBe('38 ms');
    expect(text('#home-alerts')).toContain('No active alerts');
    expect((document.querySelector('#skylink-banner') as HTMLElement).hidden).toBe(true);
    page.dispose();
  });

  it('every nav screen mounts its own screen, not a placeholder', () => {
    const { page } = setup();
    for (const id of ['obstructions', 'statistics', 'speed-test', 'advanced'] as const) {
      page.showScreen(id);

      const host = document.querySelector(`[data-screen-host="${id}"]`);
      expect(host?.childElementCount).toBeGreaterThan(0);
      expect(host?.textContent).not.toContain('Coming soon');
    }
    page.dispose();
  });

  it('dish unreachable keeps last data under a banner with the age', () => {
    const { w, page } = setup();
    w.link.dish = false;
    w.t += 300;
    page.activate();

    expect((document.querySelector('#skylink-banner') as HTMLElement).hidden).toBe(false);
    expect(text('#skylink-banner')).toContain("Can't reach your SkyLink");
    expect(text('#skylink-banner')).toContain('Last updated 5 min ago');
    expect(text('#home-hero')).toBe('Online');
    page.dispose();
  });

  it('no router shows the cannot-connect panel and hides the screens', () => {
    const { w, page } = setup();
    w.link.router = false;
    page.activate();

    expect((document.querySelector('#skylink-blocked') as HTMLElement).hidden).toBe(false);
    expect(text('#skylink-blocked')).toContain('Cannot connect');
    expect((document.querySelector('[data-screen-host="home"]') as HTMLElement).hidden).toBe(true);
    page.dispose();
  });
});

describe('Settings screen verbs', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reboot confirms first and cancel does nothing', async () => {
    const { page, calls } = setup();
    page.showScreen('settings');
    click('#set-reboot');
    expect((document.querySelector('#skylink-confirm') as HTMLElement).hidden).toBe(false);
    click('#skylink-confirm-no');
    await flush();

    expect(calls).toEqual([]);
    click('#set-reboot');
    click('#skylink-confirm-yes');
    await flush();

    expect(calls).toEqual(['reboot']);
    page.dispose();
  });

  it('reboot the model never saw is booked through noteReboot', async () => {
    const { page, model } = setup();
    page.showScreen('settings');
    click('#set-reboot');
    click('#skylink-confirm-yes');
    await flush();

    expect(model.view().data?.bootCount).toBeGreaterThanOrEqual(1);
    page.dispose();
  });

  it('snow melt applies at once; sleep schedule confirms first', async () => {
    const { page, calls } = setup();
    page.showScreen('settings');
    click('#set-snow-preheat');

    expect(calls).toContain('snow:preheat');
    (document.querySelector('#set-sleep-on') as HTMLInputElement).checked = true;
    (document.querySelector('#set-sleep-start') as HTMLInputElement).value = '23:00';
    (document.querySelector('#set-sleep-end') as HTMLInputElement).value = '05:30';
    click('#set-sleep-save');
    expect(calls.some((c) => c.startsWith('sleep'))).toBe(false);
    click('#skylink-confirm-yes');
    await flush();

    expect(calls).toContain(`sleep:${23 * 3600}-${5 * 3600 + 1800}`);
    page.dispose();
  });

  it('Wi-Fi validates the password and saves', () => {
    const { page, calls } = setup();
    page.showScreen('settings');
    (document.querySelector('#set-ssid') as HTMLInputElement).value = 'Camp';
    (document.querySelector('#set-password') as HTMLInputElement).value = 'short';
    click('#set-wifi-save');

    expect(calls).toEqual([]);
    (document.querySelector('#set-password') as HTMLInputElement).value = 'longenough';
    click('#set-wifi-save');

    expect(calls).toEqual(['wifi:Camp']);
    page.dispose();
  });

  it('sync does not overwrite a focused input and actions are disabled when unreachable', () => {
    const { page, w } = setup();
    page.showScreen('settings');
    const ssid = document.querySelector('#set-ssid') as HTMLInputElement;
    ssid.value = 'typing';
    w.link.dish = false;
    page.activate();

    expect(ssid.value).toBe('typing');
    expect((document.querySelector('#set-reboot') as HTMLButtonElement).disabled).toBe(true);
    page.dispose();
  });
});

describe('TerminalAppPlugin', () => {
  it('registers the default SkyLink tab for field stations and is in the manifest', () => {
    AntennaPageRegistry.destroy();
    const api = { missionControl: createMissionControlApi() } as unknown as PluginApi;
    new TerminalAppPlugin().register(api);
    const tabs = AntennaPageRegistry.getInstance().stationTabsFor('field');

    expect(tabs.map((t) => t.id)).toEqual(['skylink-app']);
    expect(tabs[0]?.isDefault).toBe(true);
    expect(builtinPluginManifest.find((p) => p.id === 'TerminalApp')?.className).toBe('TerminalAppPlugin');
  });
});
