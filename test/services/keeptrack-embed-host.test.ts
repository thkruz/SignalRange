import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { type EmbedMapView, hexToEmbedColor, KeepTrackEmbedHost, resetEmbedFailureLog } from '@app/services/keeptrack-embed-host';
import { SimClock } from '@app/simulation/sim-clock';
import type { KeepTrackEmbed } from '@app/vendor/keeptrack-embed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sats, stations, reg } = vi.hoisted(() => ({
  sats: [] as unknown[],
  stations: [] as unknown[],
  reg: { current: undefined as unknown },
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({ satellites: sats, groundStations: stations, registry: reg.current }),
  },
}));

const warn = vi.hoisted(() => vi.fn());

vi.mock('@app/logging/logger', () => ({ Logger: { warn, error: vi.fn(), info: vi.fn(), log: vi.fn() } }));

function fakeSat(noradId: number, name: string, tle2 = 'TLE2'): OrbitalSatellite {
  const sat = Object.create(OrbitalSatellite.prototype) as OrbitalSatellite;

  Object.defineProperties(sat, {
    noradId: { value: noradId },
    name: { value: name },
    trueElements: { value: { tle1: 'TLE1', tle2 }, configurable: true },
  });

  return sat;
}

function mockEmbed() {
  let timeMs = 0;
  const embed = {
    whenReady: vi.fn(async () => undefined),
    setCamera: vi.fn(),
    setLayers: vi.fn(),
    setTime: vi.fn((t: number) => {
      timeMs = t;
    }),
    getTime: vi.fn(() => ({ timeMs, rate: 1, paused: false })),
    setRate: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    upsertObjects: vi.fn(),
    upsertSensors: vi.fn(),
    setGroundTracks: vi.fn(),
    clearOverlays: vi.fn(),
    addOverlay: vi.fn(() => 'ov'),
    setObjectStyle: vi.fn(),
    setObjectStyles: vi.fn(),
    defineGroups: vi.fn(),
    setGroupStyle: vi.fn(),
    removeObjects: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
  };

  return embed;
}

const VIEW: EmbedMapView = { focusNoradId: null, showCoverage: true, showAccess: false, showDayNight: true };

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe('KeepTrackEmbedHost', () => {
  let embed: ReturnType<typeof mockEmbed>;
  let createEmbed: ReturnType<typeof vi.fn>;
  let anchor: HTMLDivElement;

  const makeHost = (licenseKey = 'kt1.test'): KeepTrackEmbedHost => new KeepTrackEmbedHost({ licenseKey, createEmbed: createEmbed as never, readyTimeoutMs: 1000 });

  beforeEach(() => {
    warn.mockClear();
    resetEmbedFailureLog();
    sats.length = 0;
    stations.length = 0;
    sats.push(fakeSat(100, 'ALPHA'), fakeSat(200, 'BRAVO'));
    stations.push({ state: { id: 'GS-1', location: { latitude: 10, longitude: 20, elevation: 500 } } });
    embed = mockEmbed();
    createEmbed = vi.fn(async () => embed as unknown as KeepTrackEmbed);
    anchor = document.createElement('div');
    document.body.appendChild(anchor);
    SimClock.reset(Date.UTC(2027, 0, 1));
  });

  afterEach(() => {
    KeepTrackEmbedHost.destroyInstance();
    document.body.innerHTML = '';
    SimClock.reset();
    reg.current = undefined;
  });

  describe('constellation scale', () => {
    const fakeRegistry = (hot: unknown[] = []) => ({
      size: 5002,
      memberCount: 5000,
      revision: 1,
      memberNoradIds: () => Int32Array.from({ length: 5000 }, (_v, i) => 10_000 + i),
      memberTleLines: () => ({ tle1: Array.from({ length: 5000 }, () => 'T1'), tle2: Array.from({ length: 5000 }, () => 'T2') }),
      memberName: (i: number) => `M${i}`,
      memberGroupIndex: (i: number) => (i < 4000 ? 0 : 1),
      groupName: (g: number) => (g === 0 ? 'shell-a' : 'geo'),
      constellationRefs: () => [{ tleSet: 'starlink-2026-11' }, { tleSet: 'geo-belt-2026-11' }],
      groupIdsByRef: () => [['shell-a'], ['geo']],
      ref: (norad: number) => ({ noradId: norad, name: `M${norad}`, groupId: norad >= 10_000 ? (norad < 14_000 ? 'shell-a' : 'geo') : 'authored' }),
      peek: () => undefined,
      hot: () => hot,
    });

    it('boots with capacity, defines groups and upserts every member and authored satellite in one call', async () => {
      reg.current = fakeRegistry();
      const host = makeHost();

      host.preload();
      await flush();
      expect(createEmbed.mock.calls[0][0].config.catalog.capacity).toBe(5002 + 256);
      expect(embed.defineGroups).toHaveBeenCalledTimes(1);
      expect(embed.defineGroups.mock.calls[0][0].map((g: { id: string }) => g.id)).toEqual(['shell-a', 'geo']);
      expect(embed.upsertObjects).toHaveBeenCalledTimes(1);
      const objects = embed.upsertObjects.mock.calls[0][0];

      expect(objects).toHaveLength(5002);
      expect(objects[0]).toMatchObject({ hostId: 'sat-10000', group: 'shell-a' });
      expect(objects[4500]).toMatchObject({ group: 'geo' });
      expect(objects[5000]).toEqual({ hostId: 'sat-100', name: 'ALPHA', tle1: 'TLE1', tle2: 'TLE2' });
      expect(host.constellationLayers().map((l) => [l.label, l.visible])).toEqual([
        ['Starlink', true],
        ['GEO belt', true],
      ]);
    });

    it('layer toggles hide a set through its groups and survive a reboot of the view', async () => {
      reg.current = fakeRegistry();
      const host = makeHost();

      host.preload();
      await flush();
      host.setConstellationVisible('geo-belt-2026-11', false);
      expect(embed.setGroupStyle).toHaveBeenCalledWith('geo', { visible: false });
      expect(host.constellationLayers()[1].visible).toBe(false);
    });

    it('restyles only what changed and caps tracks at 10 explicit refs', async () => {
      sats.length = 0;
      for (let i = 0; i < 12; i++) {
        sats.push(fakeSat(100 + i, `S${i}`));
      }
      reg.current = fakeRegistry();
      const host = makeHost();

      host.show(anchor, VIEW);
      await flush();
      const tracks = embed.setGroundTracks.mock.calls.at(-1)?.[0];

      expect(tracks).toHaveLength(10);
      expect(embed.setObjectStyles.mock.calls[0][0]).toHaveLength(12);
      embed.setObjectStyles.mockClear();
      host.setView({ ...VIEW, focusNoradId: 10_500 });
      // Everything lost its highlight, the selected member is added and tracked first.
      expect(embed.setObjectStyles.mock.calls[0][0]).toHaveLength(13);
      expect(embed.setGroundTracks.mock.calls.at(-1)?.[0]).toHaveLength(10);
      expect(embed.setGroundTracks.mock.calls.at(-1)?.[0][0]).toEqual({ hostId: 'sat-10500' });
      expect(embed.addOverlay).toHaveBeenCalledTimes(1);
      embed.setObjectStyles.mockClear();
      host.setView({ ...VIEW, focusNoradId: 10_500 });
      expect(embed.setObjectStyles).not.toHaveBeenCalled();
    });

    it('removes all objects in one call on teardown', async () => {
      reg.current = fakeRegistry();
      const host = makeHost();

      host.preload();
      await flush();
      host.destroy();
      expect(embed.removeObjects).toHaveBeenCalledTimes(1);
      expect(embed.removeObjects.mock.calls[0][0]).toHaveLength(5002);
    });
  });

  it('boots invisibly with the embed config, syncs the scenario, then parks', async () => {
    const host = makeHost();

    host.preload();
    expect(host.state).toBe('booting');
    const el = document.querySelector<HTMLElement>('#kt-embed-host');

    expect(el?.style.opacity).toBe('0');
    expect(el?.style.pointerEvents).toBe('none');
    await flush();

    const options = createEmbed.mock.calls[0][0];

    expect(options.src).toBe('/keeptrack/index.html');
    expect(options.config.licenseKey).toBe('kt1.test');
    expect(options.config.plugins).toEqual({ allow: ['FlatMapView'] });
    expect(options.config.settings.propagatorBackend).toBe('sgp4');
    expect(options.config.ownership.camera).toBe('shared');
    expect(options.config.ui.infoBox).toBe(false);
    expect(options.config.layers).toMatchObject({ dayNight: true, orbits: false, labels: 'host' });

    expect(host.state).toBe('ready');
    expect(embed.upsertObjects).toHaveBeenCalledWith([
      { hostId: 'sat-100', name: 'ALPHA', tle1: 'TLE1', tle2: 'TLE2' },
      { hostId: 'sat-200', name: 'BRAVO', tle1: 'TLE1', tle2: 'TLE2' },
    ]);
    const sensors = embed.upsertSensors.mock.calls[0][0];

    expect(sensors[0]).toMatchObject({ hostId: 'GS-1', lat: 10, lon: 20, altKm: 0.5, label: true });
    expect(embed.setGroundTracks).toHaveBeenCalledWith([{ hostId: 'sat-100' }, { hostId: 'sat-200' }], { pastMin: 45, futureMin: 45, stepSec: 30 });
    expect(embed.defineGroups).not.toHaveBeenCalled();
    expect(options.config.catalog).toEqual({ mode: 'scenario', capacity: 2 + 256 });
    expect(options.config.layers.labelBudget).toBe(100);
    expect(embed.hide).toHaveBeenCalled();
    expect(el?.style.display).toBe('none');
    expect(embed.show).not.toHaveBeenCalled();
  });

  it('reveals with a fresh time, styles every satellite and draws coverage for the selected one only', async () => {
    const host = makeHost();

    host.preload();
    await flush();
    SimClock.setScenarioNowMs(Date.UTC(2027, 0, 1, 1));
    host.show(anchor, VIEW, { zoom: 1 });

    const el = document.querySelector<HTMLElement>('#kt-embed-host');

    expect(el?.style.display).toBe('block');
    expect(el?.style.opacity).toBe('1');
    expect(embed.show).toHaveBeenCalled();
    expect(embed.setTime).toHaveBeenLastCalledWith(Date.UTC(2027, 0, 1, 1));
    expect(embed.clearOverlays).toHaveBeenCalled();
    expect(embed.setObjectStyles).toHaveBeenCalledTimes(1);
    expect(embed.setObjectStyles.mock.calls[0][0]).toHaveLength(2);
    expect(embed.setObjectStyles.mock.calls[0][0][1]).toMatchObject({ ref: { hostId: 'sat-200' }, style: { color: hexToEmbedColor('#7ad0ff'), highlight: true, label: 'BRAVO' } });
    // No satellite is selected in the world view, so no footprint is drawn.
    expect(embed.addOverlay).not.toHaveBeenCalled();

    embed.addOverlay.mockClear();
    embed.setObjectStyles.mockClear();
    host.show(anchor, { ...VIEW, focusNoradId: 100 }, { zoom: 1 });
    // Only BRAVO lost its highlight; ALPHA keeps its style.
    expect(embed.setObjectStyles.mock.calls[0][0]).toEqual([{ ref: { hostId: 'sat-200' }, style: expect.objectContaining({ highlight: false }) }]);
    expect(embed.addOverlay).toHaveBeenCalledTimes(1);
    expect(embed.addOverlay.mock.calls[0][0]).toMatchObject({ type: 'footprint', object: { hostId: 'sat-100' }, minElDeg: 5, fill: true });
    expect(embed.setCamera).toHaveBeenLastCalledWith({ mode: 'flat-map', zoom: 1 });
  });

  it('highlights only the focus and adds access circles per station when asked', async () => {
    const host = makeHost();

    host.preload();
    await flush();
    host.show(anchor, { focusNoradId: 200, showCoverage: false, showAccess: true, showDayNight: false }, { center: { lat: 1, lon: 2 }, zoom: 2 });

    expect(embed.setObjectStyles.mock.calls[0][0].map((c: { style: { highlight: boolean } }) => c.style.highlight)).toEqual([false, true]);
    expect(embed.addOverlay).toHaveBeenCalledTimes(1);
    expect(embed.addOverlay.mock.calls[0][0]).toMatchObject({ type: 'circle', center: { sensor: 'GS-1' }, radius: { accessOf: { hostId: 'sat-200' }, minElDeg: 5 } });
    expect(embed.setLayers).toHaveBeenLastCalledWith(expect.objectContaining({ dayNight: false }));
    expect(embed.setCamera).toHaveBeenLastCalledWith({ mode: 'flat-map', center: { lat: 1, lon: 2 }, zoom: 2 });
  });

  it('honours a show() issued while still booting', async () => {
    const host = makeHost();

    host.show(anchor, VIEW);
    expect(host.state).toBe('booting');
    await flush();
    expect(embed.show).toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('#kt-embed-host')?.style.display).toBe('block');
  });

  it('parks on hide()', async () => {
    const host = makeHost();

    host.show(anchor, VIEW);
    await flush();
    embed.hide.mockClear();
    host.hide();
    expect(embed.hide).toHaveBeenCalledOnce();
    expect(document.querySelector<HTMLElement>('#kt-embed-host')?.style.display).toBe('none');
  });

  it('re-upserts only the satellite whose elements changed', async () => {
    const host = makeHost();

    host.preload();
    await flush();
    embed.upsertObjects.mockClear();
    Object.defineProperty(sats[1], 'trueElements', { value: { tle1: 'TLE1', tle2: 'BURNED' } });
    EventBus.getInstance().emit(Events.SATELLITE_ELEMENTS_CHANGED, { noradId: 200 });

    expect(embed.upsertObjects).toHaveBeenCalledWith([{ hostId: 'sat-200', name: 'BRAVO', tle1: 'TLE1', tle2: 'BURNED' }]);
  });

  describe('clock sync', () => {
    it('starts at the scenario rate and follows speed, pause and jumps', async () => {
      const host = makeHost();

      SimClock.setSpeed(2);
      host.preload();
      await flush();
      expect(embed.setRate).toHaveBeenCalledWith(2);
      expect(embed.play).toHaveBeenCalled();

      SimClock.setSpeed(5);
      expect(embed.setRate).toHaveBeenLastCalledWith(5);

      SimClock.pause('scenario');
      expect(embed.pause).toHaveBeenCalled();
      SimClock.resume('scenario');
      expect(embed.play).toHaveBeenCalledTimes(2);

      SimClock.skip(60_000);
      expect(embed.setTime).toHaveBeenLastCalledWith(SimClock.nowMs());
      SimClock.setScenarioNowMs(Date.UTC(2026, 11, 31));
      expect(embed.setTime).toHaveBeenLastCalledWith(Date.UTC(2026, 11, 31));
    });

    it('starts paused when the scenario clock is paused', async () => {
      SimClock.pause('scenario');
      const host = makeHost();

      host.preload();
      await flush();
      expect(embed.pause).toHaveBeenCalled();
      expect(embed.play).not.toHaveBeenCalled();
    });

    it('drift check corrects only when the clocks differ by more than a second', async () => {
      const host = makeHost();

      host.show(anchor, VIEW);
      await flush();
      embed.setTime.mockClear();
      embed.getTime.mockReturnValue({ timeMs: SimClock.nowMs() + 500, rate: 1, paused: false });
      EventBus.getInstance().emit(Events.UPDATE, 16 as never);
      expect(embed.setTime).not.toHaveBeenCalled();

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 5000);
      embed.getTime.mockReturnValue({ timeMs: SimClock.nowMs() + 3000, rate: 1, paused: false });
      EventBus.getInstance().emit(Events.UPDATE, 16 as never);
      vi.useRealTimers();
      expect(embed.setTime).toHaveBeenCalledWith(SimClock.nowMs());
    });
  });

  describe('fallback', () => {
    it('fails with no license, logs once, and creates no iframe host', () => {
      const host = makeHost('');
      const listener = vi.fn();

      host.onStateChange(listener);
      host.preload();
      expect(host.state).toBe('failed');
      expect(host.isUsable).toBe(false);
      expect(listener).toHaveBeenCalledWith('failed');
      expect(createEmbed).not.toHaveBeenCalled();
      expect(document.querySelector('#kt-embed-host')).toBeNull();
      expect(warn).toHaveBeenCalledOnce();

      makeHost('').preload();
      expect(warn).toHaveBeenCalledOnce();
    });

    it('fails on a boot error (ASSETS_MISSING, no WebGL2, timeout), removes the host and destroys the embed', async () => {
      createEmbed.mockRejectedValue(Object.assign(new Error('KeepTrack not found'), { name: 'EmbedError' }));
      const host = makeHost();

      host.show(anchor, VIEW);
      await flush();
      expect(host.state).toBe('failed');
      expect(host.failureReason).toContain('KeepTrack not found');
      expect(document.querySelector('#kt-embed-host')).toBeNull();
      expect(warn).toHaveBeenCalledOnce();
    });

    it('fails when ready never resolves with an error', async () => {
      embed.whenReady.mockRejectedValue(new Error('ready timeout'));
      const host = makeHost();

      host.preload();
      await flush();
      expect(host.state).toBe('failed');
      expect(embed.destroy).toHaveBeenCalled();
    });
  });

  it('destroy() tears everything down, also when the boot resolves afterwards', async () => {
    let resolveEmbed!: (e: KeepTrackEmbed) => void;

    createEmbed.mockReturnValue(
      new Promise<KeepTrackEmbed>((resolve) => {
        resolveEmbed = resolve;
      })
    );
    const host = makeHost();

    host.preload();
    host.destroy();
    expect(host.state).toBe('destroyed');
    expect(document.querySelector('#kt-embed-host')).toBeNull();
    resolveEmbed(embed as unknown as KeepTrackEmbed);
    await flush();
    expect(embed.destroy).toHaveBeenCalled();
    expect(embed.upsertObjects).not.toHaveBeenCalled();

    SimClock.setSpeed(5);
    expect(embed.setRate).not.toHaveBeenCalled();
  });

  it('destroyInstance() drops the singleton so the next page boots a fresh embed', async () => {
    const first = KeepTrackEmbedHost.getInstance();

    KeepTrackEmbedHost.destroyInstance();
    expect(first.state).toBe('destroyed');
    expect(KeepTrackEmbedHost.getInstance()).not.toBe(first);
  });

  it('converts hex colors', () => {
    expect(hexToEmbedColor('#ff0000')).toEqual([1, 0, 0, 1]);
  });
});
