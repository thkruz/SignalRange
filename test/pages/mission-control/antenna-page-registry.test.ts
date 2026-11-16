import { AntennaPageRegistry, createMissionControlApi } from '../../../src/pages/mission-control/antenna-page-registry';

describe('AntennaPageRegistry station tabs', () => {
  const factory = vi.fn();

  beforeEach(() => AntennaPageRegistry.destroy());
  afterAll(() => AntennaPageRegistry.destroy());

  it('filters by station class and keeps registration order', () => {
    const registry = AntennaPageRegistry.getInstance();
    registry.registerStationTab({ id: 'a', label: 'A', stationClasses: ['field'], factory });
    registry.registerStationTab({ id: 'b', label: 'B', stationClasses: ['field', 'backyard'], factory });
    registry.registerStationTab({ id: 'c', label: 'C', stationClasses: ['backyard'], factory });
    expect(registry.stationTabsFor('field').map((t) => t.id)).toEqual(['a', 'b']);
    expect(registry.stationTabsFor('backyard').map((t) => t.id)).toEqual(['b', 'c']);
    expect(registry.stationTabsFor(undefined)).toEqual([]);
  });

  it('replaces on re-register, resolves by tab id and unregisters', () => {
    const registry = AntennaPageRegistry.getInstance();
    registry.registerStationTab({ id: 'a', label: 'A', stationClasses: ['field'], factory });
    registry.registerStationTab({ id: 'a', label: 'A2', stationClasses: ['field'], factory });
    expect(registry.stationTabsFor('field')).toHaveLength(1);
    expect(registry.stationTabByTabId('station-a')?.label).toBe('A2');
    expect(registry.stationTabByTabId('a')).toBeUndefined();
    expect(registry.unregisterStationTab('a')).toBe(true);
    expect(registry.unregisterStationTab('a')).toBe(false);
  });

  it('rejects an empty id, label or class list', () => {
    const registry = AntennaPageRegistry.getInstance();
    expect(() => registry.registerStationTab({ id: '', label: 'A', stationClasses: ['field'], factory })).toThrow();
    expect(() => registry.registerStationTab({ id: 'a', label: 'A', stationClasses: [], factory })).toThrow();
  });

  it('is exposed on the plugin api', () => {
    const registry = AntennaPageRegistry.getInstance();
    const api = createMissionControlApi(registry);
    api.registerStationTab({ id: 'a', label: 'A', stationClasses: ['field'], factory });
    expect(registry.stationTabsFor('field')).toHaveLength(1);
    expect(api.unregisterStationTab('a')).toBe(true);
  });
});
