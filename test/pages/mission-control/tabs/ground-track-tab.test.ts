import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { GroundTrackTab } from '@app/pages/mission-control/tabs/ground-track-tab';
import { KeepTrackEmbedHost } from '@app/services/keeptrack-embed-host';
import { SettingsManager } from '@app/settings/settings-manager';
import type { KeepTrackEmbed } from '@app/vendor/keeptrack-embed';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sats, reg, geoMapInstances } = vi.hoisted(() => ({
  sats: [] as unknown[],
  reg: { current: undefined as unknown },
  geoMapInstances: [] as Array<{ setLayers: ReturnType<typeof vi.fn>; centerOn: ReturnType<typeof vi.fn> }>,
}));

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: () => ({
      satellites: sats,
      registry: reg.current,
      groundStations: [{ state: { id: 'GS-1', location: { latitude: 10, longitude: 20, elevation: 0 } } }],
    }),
  },
}));
vi.mock('@app/simulation/sim-time', () => ({ getSimulatedNowMs: () => Date.UTC(2027, 0, 1), getSimulatedNow: () => new Date(Date.UTC(2027, 0, 1)) }));
vi.mock('@app/services/ground-track-math', () => ({
  groundTrack: () => [{ lat: 0, lon: 0, timeMs: Date.UTC(2027, 0, 1) }],
  visibilityRadiusDeg: () => 20,
}));
vi.mock('@app/logging/logger', () => ({ Logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn() } }));
vi.mock('@app/components/geo-map/geo-map', () => ({
  GeoMap: vi.fn(function (this: unknown) {
    const map = {
      outerHtml: '<canvas id="fake-geomap"></canvas>',
      attach: vi.fn(),
      dispose: vi.fn(),
      setLayers: vi.fn(),
      centerOn: vi.fn(),
    };

    geoMapInstances.push(map);

    return map;
  }),
}));

function fakeSat(noradId: number, name: string): OrbitalSatellite {
  const sat = Object.create(OrbitalSatellite.prototype) as OrbitalSatellite;

  Object.defineProperties(sat, {
    noradId: { value: noradId },
    name: { value: name },
    trueElements: { value: { tle1: 'T1', tle2: 'T2' } },
    lla: { value: { lat: 40, lon: -30, alt: 700 } },
  });

  return sat;
}

function mockEmbed() {
  return {
    whenReady: vi.fn(async () => undefined),
    setCamera: vi.fn(),
    setLayers: vi.fn(),
    setTime: vi.fn(),
    getTime: vi.fn(() => ({ timeMs: 0, rate: 1, paused: false })),
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
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

describe('GroundTrackTab renderer', () => {
  let embed: ReturnType<typeof mockEmbed>;
  let createEmbed: ReturnType<typeof vi.fn>;

  const useHost = (licenseKey: string): KeepTrackEmbedHost => {
    const host = new KeepTrackEmbedHost({ licenseKey, createEmbed: createEmbed as never });

    KeepTrackEmbedHost.setInstance(host);

    return host;
  };

  beforeEach(() => {
    localStorage.clear();
    SettingsManager.destroy();
    document.body.innerHTML = '<div id="canvas-content"></div>';
    sats.length = 0;
    sats.push(fakeSat(100, 'ALPHA'), fakeSat(200, 'BRAVO'));
    geoMapInstances.length = 0;
    reg.current = undefined;
    embed = mockEmbed();
    createEmbed = vi.fn(async () => embed as unknown as KeepTrackEmbed);
  });

  afterEach(() => {
    KeepTrackEmbedHost.destroyInstance();
    SettingsManager.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  const constellationRegistry = {
    size: 2,
    memberCount: 2,
    revision: 0,
    memberNoradIds: () => Int32Array.from([5000, 5001]),
    memberTleLines: () => ({ tle1: ['A', 'A'], tle2: ['B', 'B'] }),
    memberName: (i: number) => `M${i}`,
    memberGroupIndex: (i: number) => i,
    groupName: (g: number) => (g === 0 ? 'shell-a' : 'geo'),
    constellationRefs: () => [{ tleSet: 'starlink-2026-11' }, { tleSet: 'geo-belt-2026-11' }],
    groupIdsByRef: () => [['shell-a'], ['geo']],
    ref: () => undefined,
    peek: () => undefined,
    hot: () => [],
  };

  it('shows one layer switch per constellation and drives the group visibility', async () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    reg.current = constellationRegistry;
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    await flush();
    const switches = document.querySelectorAll<HTMLInputElement>('input[data-gt-constellation]');

    expect([...switches].map((el) => el.dataset.gtConstellation)).toEqual(['starlink-2026-11', 'geo-belt-2026-11']);
    expect(document.querySelector('#gt-fallback-banner')?.classList.contains('d-none')).toBe(true);
    switches[1].checked = false;
    switches[1].dispatchEvent(new Event('change'));
    expect(embed.setGroupStyle).toHaveBeenCalledWith('geo', { visible: false });
    tab.dispose();
  });

  it('shows no layer switches and no banner without constellations', async () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    await flush();
    expect(document.querySelectorAll('input[data-gt-constellation]')).toHaveLength(0);
    tab.dispose();
  });

  it('GeoMap fallback with constellations shows the renderer banner', () => {
    SettingsManager.getInstance().setGroundTrackRenderer('geomap');
    reg.current = constellationRegistry;
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    expect(document.querySelector('#gt-fallback-banner')?.classList.contains('d-none')).toBe(false);
    expect(document.querySelectorAll('input[data-gt-constellation]')).toHaveLength(0);
    tab.dispose();
  });

  it('renders GeoMap and never touches the embed when the renderer is geomap', () => {
    SettingsManager.getInstance().setGroundTrackRenderer('geomap');
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    expect(geoMapInstances).toHaveLength(1);
    expect(geoMapInstances[0].setLayers).toHaveBeenCalled();
    expect(document.querySelector('#fake-geomap')).not.toBeNull();
    expect(document.querySelector('#gt-embed-anchor')).toBeNull();
    expect(createEmbed).not.toHaveBeenCalled();
    tab.dispose();
  });

  it('world map placement: embed anchor instead of a canvas, all satellites equal, no access toggle', async () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    await flush();

    expect(document.querySelector('#gt-embed-anchor')).not.toBeNull();
    expect(document.querySelector('#fake-geomap')).toBeNull();
    expect(document.querySelector('#gt-toggle-access')).toBeNull();
    expect(geoMapInstances).toHaveLength(0);
    expect(embed.show).toHaveBeenCalled();
    expect(embed.setObjectStyles.mock.calls[0][0].map((c: { style: { highlight: boolean } }) => c.style.highlight)).toEqual([true, true]);
    expect(embed.setCamera).toHaveBeenLastCalledWith({ mode: 'flat-map', zoom: 1 });
    expect(document.querySelectorAll('#gt-subpoint-rows tr')).toHaveLength(2);
    tab.dispose();
  });

  it('per-satellite placement: focus highlight, centring once, access toggle drives circles, toggles update the view', async () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content', sats[1] as OrbitalSatellite);

    tab.activate();
    await flush();

    expect(embed.setObjectStyles.mock.calls[0][0].map((c: { style: { highlight: boolean } }) => c.style.highlight)).toEqual([false, true]);
    expect(embed.setCamera).toHaveBeenLastCalledWith({ mode: 'flat-map', center: { lat: 40, lon: -30 }, zoom: 2 });
    expect(embed.addOverlay.mock.calls.every((c) => c[0].type === 'footprint')).toBe(true);

    embed.addOverlay.mockClear();
    embed.setCamera.mockClear();
    const access = document.querySelector<HTMLInputElement>('#gt-toggle-access');

    access!.checked = true;
    access!.dispatchEvent(new Event('change'));
    expect(embed.addOverlay.mock.calls.some((c) => c[0].type === 'circle' && c[0].radius.accessOf.hostId === 'sat-200')).toBe(true);

    const coverage = document.querySelector<HTMLInputElement>('#gt-toggle-footprints');

    embed.addOverlay.mockClear();
    coverage!.checked = false;
    coverage!.dispatchEvent(new Event('change'));
    expect(embed.addOverlay.mock.calls.every((c) => c[0].type === 'circle')).toBe(true);

    const terminator = document.querySelector<HTMLInputElement>('#gt-toggle-terminator');

    terminator!.checked = false;
    terminator!.dispatchEvent(new Event('change'));
    expect(embed.setLayers).toHaveBeenLastCalledWith(expect.objectContaining({ dayNight: false }));
    expect(embed.setCamera).not.toHaveBeenCalled();
    tab.dispose();
  });

  it('deactivate() and dispose() park the embed', async () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    await flush();
    embed.hide.mockClear();
    tab.deactivate();
    expect(embed.hide).toHaveBeenCalledOnce();
    tab.dispose();
    expect(embed.hide).toHaveBeenCalledOnce();
  });

  it('falls back to GeoMap in place when the embed fails to boot', async () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    createEmbed.mockRejectedValue(new Error('KeepTrack not found at /keeptrack/index.html (HTTP 404)'));
    useHost('kt1.test');
    const tab = new GroundTrackTab('canvas-content');

    tab.activate();
    expect(document.querySelector('#gt-embed-anchor')).not.toBeNull();
    await flush();

    expect(document.querySelector('#gt-embed-anchor')).toBeNull();
    expect(document.querySelector('#fake-geomap')).not.toBeNull();
    expect(geoMapInstances).toHaveLength(1);
    expect(geoMapInstances[0].setLayers).toHaveBeenCalled();
    tab.dispose();
  });

  it('uses GeoMap from the start when the host already failed (empty license)', () => {
    SettingsManager.getInstance().setGroundTrackRenderer('embed');
    const host = useHost('');

    host.preload();
    expect(host.state).toBe('failed');
    const tab = new GroundTrackTab('canvas-content');

    expect(document.querySelector('#fake-geomap')).not.toBeNull();
    expect(geoMapInstances).toHaveLength(1);
    tab.dispose();
  });
});
