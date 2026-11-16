import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { AssetTreeSidebar } from '@app/pages/mission-control/asset-tree-sidebar';
import { SelectedStation } from '@app/pages/mission-control/selected-station';
import { afterEach, describe, expect, it, vi } from 'vitest';

const stations = [
  { state: { id: 'GW-01', location: { latitude: 53.27, longitude: -9.05, elevation: 20 } } },
  { state: { id: 'SH-02', location: { latitude: 60.15, longitude: -1.15, elevation: 10 } } },
];

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => ({ groundStations: stations }) },
}));

describe('SelectedStation', () => {
  afterEach(() => {
    AssetTreeSidebar.selectedGroundStationId = null;
    EventBus.destroy();
  });

  it('falls back to the first station when nothing was selected', () => {
    const station = new SelectedStation();

    expect(station.stationId).toBe('GW-01');
    station.destroy();
  });

  it('reports a station selected before it was constructed', () => {
    AssetTreeSidebar.selectedGroundStationId = 'SH-02';
    const station = new SelectedStation();

    expect(station.stationId).toBe('SH-02');
    station.destroy();
  });

  it('follows later selections', () => {
    const station = new SelectedStation();
    EventBus.getInstance().emit(Events.ASSET_SELECTED, { type: 'ground-station', id: 'SH-02' });

    expect(station.stationId).toBe('SH-02');
    station.destroy();
  });
});
