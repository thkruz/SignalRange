import enBundle from '@app/locales/en.json';
import { describe, expect, it } from 'vitest';
import type { SkylinkStatus } from '../../../src/physical/physical-plant-types';
import { tr } from '../../../src/plugins-builtin/terminal-app/strings';
import { TerminalAppModel, type TerminalPhasedArraySlice, type TerminalServiceReader } from '../../../src/plugins-builtin/terminal-app/terminal-app-model';
import { causeLabelText, OUTAGE_LABEL_KEY, type OutageObservation } from '../../../src/plugins-builtin/terminal-app/terminal-labels';
import { TerminalLink, type TerminalLinkReader } from '../../../src/plugins-builtin/terminal-app/terminal-link';
import { bootAcquisitionSeconds, SKYLINK_SKIN, type TerminalSkin } from '../../../src/plugins-builtin/terminal-app/terminal-skin';

interface World {
  t: number;
  status: SkylinkStatus;
  link: { router: boolean; booted: boolean; laptop: boolean; cable: boolean; dish: boolean };
  net: { down: number; up: number; rtt: number; loss: number; account: string; registration: string };
  array: TerminalPhasedArraySlice | null;
}

function makeWorld(): World {
  return {
    t: 1000,
    status: 'online',
    link: { router: true, booted: true, laptop: true, cable: true, dish: true },
    net: { down: 100, up: 10, rtt: 40, loss: 0, account: 'up', registration: 'up' },
    array: null,
  };
}

function makeModel(w: World, skin: TerminalSkin = SKYLINK_SKIN): TerminalAppModel {
  const reader: TerminalLinkReader = {
    routerPowered: () => w.link.router,
    routerBooted: () => w.link.booted,
    laptopOnRouter: () => w.link.laptop,
    dishCablePathIntact: () => w.link.cable,
    dishBooted: () => w.link.dish,
  };
  const services: TerminalServiceReader = {
    peekSample: (_id, layer, _via, _ep, metric = 'status') => {
      if (metric === 'status') {
        return { value: layer === 'account' ? (w.net.account as 'up') : (w.net.registration as 'up'), tS: w.t };
      }
      const map = { downMbps: w.net.down, upMbps: w.net.up, rttMs: w.net.rtt, lossPct: w.net.loss } as const;

      return { value: map[metric], tS: w.t };
    },
  };

  return new TerminalAppModel({
    skin,
    plant: { nowS: () => w.t, dishStatus: () => w.status, powerDrawW: () => 55 },
    link: new TerminalLink(reader),
    services,
    serviceId: 'skylink',
    phasedArray: () => w.array,
  });
}

/** Advance sim time in 1 s ticks */
function run(model: TerminalAppModel, w: World, seconds: number, step = 1): void {
  for (let i = 0; i < seconds; i += step) {
    w.t += step;
    model.update();
  }
}

describe('TerminalLink', () => {
  const state = (patch: Partial<World['link']>): string => {
    const w = makeWorld();
    Object.assign(w.link, patch);
    const m = makeModel(w);
    m.update();

    return m.view().link;
  };

  it('is connected when everything is up', () => {
    expect(state({})).toBe('connected');
  });

  it('is no-router when the router is dark, still booting, or the laptop is off it', () => {
    expect(state({ router: false })).toBe('no-router');
    expect(state({ booted: false })).toBe('no-router');
    expect(state({ laptop: false })).toBe('no-router');
  });

  it('is dish-unreachable when the cable path is cut or the dish is not booted', () => {
    expect(state({ cable: false })).toBe('dish-unreachable');
    expect(state({ dish: false })).toBe('dish-unreachable');
  });
});

describe('stale data over an unreachable dish', () => {
  it('keeps the sample sim time and ages it; no router shows nothing', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, 60);
    const live = m.view();
    expect(live.stale).toBe(false);
    const sampledAt = live.data?.sampleTimeS;
    expect(sampledAt).toBe(w.t);

    w.link.cable = false;
    run(m, w, 240);
    const stale = m.view();
    expect(stale.link).toBe('dish-unreachable');
    expect(stale.stale).toBe(true);
    expect(stale.data?.sampleTimeS).toBe(sampledAt);
    expect(stale.ageS).toBe(240);

    w.link.router = false;
    expect(m.view().data).toBeNull();
  });

  it('the dish keeps recording while unreachable, and the app catches up on reconnect', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.link.cable = false;
    w.status = 'booting';
    run(m, w, 100);
    w.status = 'online';
    w.link.cable = true;
    run(m, w, 5);
    const view = m.view();
    expect(view.stale).toBe(false);
    expect(view.data?.outages.some((o) => o.causeLabel === 'Booting' && o.durationS >= 99)).toBe(true);
  });
});

describe('cause labels', () => {
  const outageLabel = (setup: (w: World) => void): string | undefined => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, 10);
    setup(w);
    run(m, w, 60);
    w.status = 'online';
    w.net = { ...w.net, account: 'up', registration: 'up' };
    w.array = null;
    run(m, w, 5);

    return m.view().data?.outages.at(-1)?.causeLabel;
  };

  it('cable fault (plant: booting) reads Booting', () => {
    expect(outageLabel((w) => (w.status = 'booting'))).toBe('Booting');
  });

  it('power sag (plant: no-power) reads Booting too, the same as a cable fault', () => {
    expect(outageLabel((w) => (w.status = 'no-power'))).toBe('Booting');
  });

  it('snow / net / tree (plant: obstructed) reads Obstructed with an alert', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.status = 'obstructed';
    run(m, w, 30);
    const d = m.view().data;
    expect(d?.alerts.map((a) => a.text)).toEqual(['Obstructed']);
    expect(d?.hero).toBe('searching');
    expect(d?.outages.at(-1)?.causeLabel).toBe('Obstructed');
    expect(d?.outages.at(-1)?.ongoing).toBe(true);
  });

  it('thermal shutdown reads Thermal shutdown with an alert; throttle is an alert, not an outage', () => {
    expect(outageLabel((w) => (w.status = 'thermal-shutdown'))).toBe('Thermal shutdown');
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.status = 'thermal-throttle';
    run(m, w, 60);
    const d = m.view().data;
    expect(d?.alerts.map((a) => a.id)).toEqual(['thermal-throttle']);
    expect(d?.hero).toBe('online');
    expect(d?.outages).toHaveLength(0);
  });

  it('array outage with a healthy dish reads Searching, no alert', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.array = { inOutage: true, lastLinkDrop: null };
    run(m, w, 5);
    const d = m.view().data;
    expect(d?.hero).toBe('searching');
    expect(d?.alerts).toEqual([]);
    w.array = { inOutage: false, lastLinkDrop: null };
    run(m, w, 2);
    expect(m.view().data?.outages.at(-1)?.causeLabel).toBe('Searching');
  });

  it('new link drops are logged as short Searching entries, without double counting', () => {
    const w = makeWorld();
    const m = makeModel(w);
    w.array = { inOutage: false, lastLinkDrop: { atMs: 1, servingNorad: 1, nextNorad: 2, reason: 'handover' as never } };
    m.update();
    run(m, w, 5);
    w.array = { inOutage: false, lastLinkDrop: { atMs: 9000, servingNorad: 2, nextNorad: 3, reason: 'handover' as never } };
    run(m, w, 5);
    const out = m.view().data?.outages ?? [];
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ causeLabel: 'Searching', durationS: SKYLINK_SKIN.handoverDropS });
  });

  it('refused account reads Offline with the generic network message', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.net.account = 'down';
    run(m, w, 40);
    const d = m.view().data;
    expect(d?.hero).toBe('offline');
    expect(d?.message).toBe('Network unavailable');
    expect(d?.outages.at(-1)?.causeLabel).toBe('Offline');
  });

  it('GNSS denial (plant: no-location) displays as Searching, no alert', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.status = 'no-location';
    run(m, w, 10);
    const d = m.view().data;
    expect(d?.heroText).toBe('Searching');
    expect(d?.alerts).toEqual([]);
  });

  it('sleeping is a hero state, not an outage', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.status = 'sleeping';
    run(m, w, 60);
    expect(m.view().data?.heroText).toBe('Sleeping');
    expect(m.view().data?.outages).toHaveLength(0);
  });

  it('every observation maps to a defined label, and the table never names a true cause', () => {
    const all: OutageObservation[] = Object.keys(OUTAGE_LABEL_KEY) as OutageObservation[];
    for (const o of all) {
      expect(causeLabelText(OUTAGE_LABEL_KEY[o])).toBeTruthy();
    }
    expect(OUTAGE_LABEL_KEY['power-loss']).toBe(OUTAGE_LABEL_KEY.booting);
    expect(OUTAGE_LABEL_KEY['no-location']).toBe(OUTAGE_LABEL_KEY.handover);
    const texts = (Object.keys(OUTAGE_LABEL_KEY) as OutageObservation[])
      .map((o) => causeLabelText(OUTAGE_LABEL_KEY[o]))
      .join(' ')
      .toLowerCase();
    for (const forbidden of ['cable', 'power', 'gnss', 'interference', 'snow']) {
      expect(texts).not.toContain(forbidden);
    }
  });

  it('the app string table never names a true cause (D5) and every placeholder is filled', () => {
    const strings: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        strings.push(node);
      } else if (node && typeof node === 'object') {
        Object.values(node).forEach(walk);
      }
    };
    walk(enBundle.skylink);
    expect(strings.length).toBeGreaterThan(150);
    for (const text of strings) {
      expect(text.toLowerCase()).not.toMatch(/jam|interfer|spoof|cable cut|sabotage/u);
    }
    expect(tr('shell.updatedAgo', { age: '5 min' })).toBe('Last updated 5 min ago');
  });
});

describe('history, uptime and boot count', () => {
  it('counts boots and resets uptime, but history survives the reboot', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, 600);
    expect(m.view().data?.uptimeS).toBe(600);
    expect(m.view().data?.bootCount).toBe(1);

    w.status = 'obstructed';
    run(m, w, 60);
    w.status = 'online';
    run(m, w, 10);
    w.status = 'no-power';
    run(m, w, 30);
    w.status = 'booting';
    run(m, w, 120);
    w.status = 'online';
    run(m, w, 20);

    const d = m.view().data;
    expect(d?.bootCount).toBe(2);
    expect(d?.uptimeS).toBeGreaterThanOrEqual(19);
    expect(d?.uptimeS).toBeLessThanOrEqual(20);
    expect(d?.outages.map((o) => o.causeLabel)).toEqual(['Obstructed', 'Booting']);
    expect(d?.stats['15m'].points.some((p) => p.downMbps !== null)).toBe(true);
  });

  it('flapping boots (cable fault) climb the boot count', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    for (let i = 0; i < 3; i++) {
      w.status = 'booting';
      run(m, w, 20);
      w.status = 'online';
      run(m, w, 20);
    }
    expect(m.view().data?.bootCount).toBe(4);
  });

  it('noteReboot records a Booting outage and zero samples for a skipped reboot', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, 300);
    const start = w.t;
    w.t += 180;
    m.noteReboot(start, 180);
    m.update();
    const d = m.view().data;
    expect(d?.bootCount).toBe(2);
    expect(d?.outages.at(-1)).toMatchObject({ startS: start, durationS: 180, causeLabel: 'Booting' });
    const pts = m.stats('15m').points.filter((p) => p.pingDropPct === 100);
    expect(pts.length).toBeGreaterThan(0);
  });

  it('state round-trips', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.status = 'obstructed';
    run(m, w, 90);
    w.status = 'online';
    run(m, w, 90);
    const copy = makeModel(w);
    copy.restoreState(m.getState());
    expect(copy.view().data?.outages).toEqual(m.view().data?.outages);
  });
});

describe('statistics windows', () => {
  it('buckets 15 min, 6 h and 12 h; older samples fall out of the shorter window', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, 7 * 3600, 30);
    const d = m.view().data;
    expect(d?.stats['15m'].points).toHaveLength(30);
    expect(d?.stats['6h'].points).toHaveLength(72);
    expect(d?.stats['12h'].points).toHaveLength(72);
    expect(d?.stats['15m'].windowS).toBe(900);
    // 12 h window is only 7 h old: the early buckets are empty
    const twelve = d?.stats['12h'].points ?? [];
    expect(twelve[0].downMbps).toBeNull();
    expect(twelve.at(-1)?.downMbps).toBe(100);
    expect(twelve.at(-1)?.latencyMs).toBe(40);
  });

  it('an outage shows as zero throughput and 100 percent ping drop; a stable link drops 0', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, 600, 30);
    w.status = 'obstructed';
    run(m, w, 300, 30);
    const pts = m.stats('15m').points.filter((p) => p.pingDropPct !== null);
    expect(pts.some((p) => p.pingDropPct === 100 && p.downMbps === 0)).toBe(true);
    expect(pts.some((p) => p.pingDropPct === 0)).toBe(true);
  });

  it('RF interference shows only as latency and loss, with no outage and no alert', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.net.rtt = 180;
    w.net.loss = 12;
    run(m, w, 300, 30);
    const d = m.view().data;
    expect(d?.alerts).toEqual([]);
    expect(d?.outages).toHaveLength(0);
    expect(d?.latencyMs).toBe(180);
    expect(m.stats('15m').points.at(-1)?.pingDropPct).toBe(12);
  });

  it('outage list is filtered by window', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    w.status = 'obstructed';
    run(m, w, 60, 10);
    w.status = 'online';
    run(m, w, 3 * 3600, 30);
    expect(m.stats('15m').outages).toHaveLength(0);
    expect(m.stats('6h').outages).toHaveLength(1);
  });
});

describe('skins', () => {
  it('SkyLink skin is the full set with realistic boot time', () => {
    expect(SKYLINK_SKIN.screens).toContain('advanced');
    expect(bootAcquisitionSeconds(SKYLINK_SKIN, 0)).toBe(120);
    expect(bootAcquisitionSeconds(SKYLINK_SKIN, 1)).toBe(300);
  });

  it('a smaller skin can drop screens and debug fields', () => {
    const small: TerminalSkin = { ...SKYLINK_SKIN, id: 'eurosat', productName: 'EuroSat', screens: ['home', 'settings'], debugFields: [] };
    const w = makeWorld();
    const m = makeModel(w, small);
    m.update();
    expect(m.view().link).toBe('connected');
    expect(small.screens).not.toContain('statistics');
  });
});

describe('first sample', () => {
  it('is not measured until a service sample is in, so Home never shows a false 0', () => {
    const w = makeWorld();
    const m = makeModel(w);
    m.update();
    run(m, w, SKYLINK_SKIN.sampleIntervalS - 5);
    const early = m.view().data;
    expect(early?.hero).toBe('online');
    expect(early?.measured).toBe(false);
    run(m, w, 10);
    const later = m.view().data;
    expect(later?.measured).toBe(true);
    expect(later?.downMbps).toBe(100);
  });

  it('stays unmeasured when the terminal has no service model', () => {
    const w = makeWorld();
    const m = new TerminalAppModel({
      skin: SKYLINK_SKIN,
      plant: { nowS: () => w.t, dishStatus: () => w.status, powerDrawW: () => 55 },
      link: new TerminalLink({ routerPowered: () => true, routerBooted: () => true, laptopOnRouter: () => true, dishCablePathIntact: () => true, dishBooted: () => true }),
    });
    m.update();
    run(m, w, 120);
    expect(m.view().data?.measured).toBe(false);
  });
});
