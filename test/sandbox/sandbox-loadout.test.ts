import type { Degrees } from 'ootk';
import { vi } from 'vitest';
import type { GroundStationConfig } from '../../src/assets/ground-station/ground-station-state';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { ANTENNA_CONFIGS } from '../../src/equipment/antenna/antenna-configs';
import { AntennaRegistry } from '../../src/equipment/antenna/antenna-registry';
import type { ScenarioData } from '../../src/ScenarioData';
import { SandboxLoadoutService } from '../../src/sandbox/sandbox-loadout';

const station = (id: string): GroundStationConfig => ({
  id,
  name: `Station ${id}`,
  location: { latitude: 0, longitude: 0, elevation: 0 },
  antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
  antennasState: [{ azimuth: 200 as Degrees, elevation: 2 as Degrees, isLocked: true, isBeaconLocked: true, isPowered: true }],
  rfFrontEnds: [{}],
});

const scenario = (missionType: string, stations: GroundStationConfig[] = [station('A'), station('B')]): ScenarioData => ({
  id: 'test-sandbox',
  url: 'test/sandbox',
  imageUrl: '',
  number: 0,
  title: 'Test',
  subtitle: '',
  duration: 'Unlimited',
  difficulty: 'beginner',
  missionType,
  description: '',
  equipment: [],
  settings: { isSync: true, groundStations: stations, satellites: [] },
});

describe('SandboxLoadoutService', () => {
  let service: SandboxLoadoutService;

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    AntennaRegistry.destroy();
    SandboxLoadoutService.destroy();
    AntennaRegistry.getInstance().register(
      'PLUGIN_NARROW',
      { ...ANTENNA_CONFIGS[ANTENNA_CONFIG_KEYS.KA_BAND_1M8], name: 'Narrow', elRange_deg: [10, 85], azContinuous: false, azRange_deg: [0, 180] },
      { source: 'plugin:Test' }
    );
    service = SandboxLoadoutService.getInstance();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    SandboxLoadoutService.destroy();
    AntennaRegistry.destroy();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('identifies sandboxes by missionType', () => {
    expect(SandboxLoadoutService.isSandboxScenario({ missionType: 'Sandbox' })).toBe(true);
    expect(SandboxLoadoutService.isSandboxScenario({ missionType: 'Training' })).toBe(false);
  });

  it('stores, reads, and clears a loadout per scenario', () => {
    service.set('s1', { stations: { 0: { antenna: 'PLUGIN_NARROW' } } });

    expect(service.get('s1')).toEqual({ stations: { 0: { antenna: 'PLUGIN_NARROW' } } });
    expect(service.get('s2')).toBeNull();
    expect(localStorage.getItem(`${SandboxLoadoutService.STORAGE_PREFIX}s1`)).toBeTruthy();

    service.clear('s1');

    expect(service.get('s1')).toBeNull();
  });

  it('treats malformed storage as no loadout', () => {
    localStorage.setItem(`${SandboxLoadoutService.STORAGE_PREFIX}s1`, '{oops');

    expect(service.get('s1')).toBeNull();

    localStorage.setItem(`${SandboxLoadoutService.STORAGE_PREFIX}s1`, '{"stations":"nope"}');

    expect(service.get('s1')).toBeNull();
  });

  it('parses ?antenna= for station 0 and ?antenna.N= for others, ignoring unknown ids', () => {
    expect(service.readUrlOverride('')).toBeNull();
    expect(service.readUrlOverride('?antenna=PLUGIN_NARROW&antenna.1=KU_BAND_9M_LIMIT&antenna.2=BOGUS&foo=bar')).toEqual({
      stations: { 0: { antenna: 'PLUGIN_NARROW' }, 1: { antenna: 'KU_BAND_9M_LIMIT' } },
    });
    expect(service.readUrlOverride('?antenna=BOGUS')).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('resolve() merges storage with the URL, URL winning per station', () => {
    service.set('test-sandbox', { stations: { 0: { antenna: 'KU_BAND_9M_LIMIT' }, 1: { antenna: 'KU_BAND_9M_LIMIT' } } });
    window.history.replaceState({}, '', '/x?antenna=PLUGIN_NARROW');

    expect(service.resolve('test-sandbox')).toEqual({ stations: { 0: { antenna: 'PLUGIN_NARROW' }, 1: { antenna: 'KU_BAND_9M_LIMIT' } } });
    expect(service.resolve('other')).toEqual({ stations: { 0: { antenna: 'PLUGIN_NARROW' } } });

    window.history.replaceState({}, '', '/');

    expect(service.resolve('other')).toBeNull();
  });

  describe('applyToScenario', () => {
    it('returns the same settings object for non-sandbox scenarios even with a stored loadout', () => {
      const data = scenario('Training');

      service.set(data.id, { stations: { 0: { antenna: 'PLUGIN_NARROW' } } });

      expect(service.applyToScenario(data)).toBe(data.settings);
    });

    it('returns the same settings object for a sandbox with no loadout', () => {
      const data = scenario('Sandbox');

      expect(service.applyToScenario(data)).toBe(data.settings);
    });

    it('returns the same settings object when the loadout matches the authored antenna', () => {
      const data = scenario('Sandbox');

      service.set(data.id, { stations: { 0: { antenna: ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK } } });

      expect(service.applyToScenario(data)).toBe(data.settings);
    });

    it('swaps the chosen station, clamps pointing, drops locks, and leaves other stations alone', () => {
      const data = scenario('Sandbox');

      service.set(data.id, { stations: { 0: { antenna: 'PLUGIN_NARROW' } } });

      const applied = service.applyToScenario(data);

      expect(applied).not.toBe(data.settings);
      expect(applied.groundStations[1]).toBe(data.settings.groundStations[1]);

      const swapped = applied.groundStations[0];

      expect(swapped.antennas[0]).toBe('PLUGIN_NARROW');
      expect(swapped.antennaConfigKey).toBe('PLUGIN_NARROW');
      expect(swapped.antennasState?.[0]).toEqual(
        expect.objectContaining({ azimuth: 180, elevation: 10, isLocked: false, isBeaconLocked: false, isSlewing: false, isPowered: true })
      );
      // The authored scenario is untouched.
      expect(data.settings.groundStations[0].antennas[0]).toBe(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK);
      expect(data.settings.groundStations[0].antennasState?.[0].isLocked).toBe(true);
    });

    it('fills a neutral pointing when the station authored no antenna state', () => {
      const bare = { ...station('A'), antennasState: undefined };
      const data = scenario('Sandbox', [bare]);

      service.set(data.id, { stations: { 0: { antenna: 'PLUGIN_NARROW' } } });

      const applied = service.applyToScenario(data);

      expect(applied.groundStations[0].antennasState?.[0]).toEqual(expect.objectContaining({ azimuth: 180, elevation: 30 }));
    });

    it('ignores a stored id that is no longer registered', () => {
      const data = scenario('Sandbox');

      service.set(data.id, { stations: { 0: { antenna: 'GONE_PLUGIN' } } });

      expect(service.applyToScenario(data)).toBe(data.settings);
    });
  });
});
