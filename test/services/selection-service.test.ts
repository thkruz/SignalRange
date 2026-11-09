import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SelectionService } from '@app/services/selection-service';
import { PINNED_CAP, SatelliteRegistry } from '@app/simulation/satellite-registry';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers } from 'ootk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSyntheticTles } from '../../scripts/tle-sets/synth';

const holder: { registry?: SatelliteRegistry } = {};

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: { getInstance: () => holder },
}));

const observer = { name: 'T', lat: 30 as Degrees, lon: -100 as Degrees, alt: 0 as Kilometers };

function makeSet(n: number): TleSet {
  const tles = generateSyntheticTles({ count: n, seed: 1, epoch: '2026-11-09' });
  const shells = [...new Set(tles.map((t) => t.shell))];

  return {
    format: 'sr-tle-set/1',
    id: 'test-set',
    epoch: '2026-11-09',
    source: 'synthetic',
    groups: shells.map((id) => ({ id, label: id, count: tles.filter((t) => t.shell === id).length })),
    members: tles.map((t) => ({ noradId: t.noradId, name: t.name, tle1: t.tle1, tle2: t.tle2, group: t.shell })),
  };
}

describe('SelectionService', () => {
  const set = makeSet(60);
  const norads = set.members.map((m) => m.noradId);
  let registry: SatelliteRegistry;

  beforeEach(() => {
    registry = new SatelliteRegistry([], { observer });
    registry.addConstellation(set, { tleSet: set.id });
    holder.registry = registry;
    SelectionService.destroyInstance();
  });

  afterEach(() => {
    SelectionService.destroyInstance();
  });

  it('selecting a member hydrates it, holds it, emits and releases the hold when selection moves', () => {
    const service = SelectionService.getInstance();
    const seen: unknown[] = [];
    const handler = (d: unknown) => seen.push(d);

    EventBus.getInstance().on(Events.ASSET_SELECTED, handler as never);
    expect(registry.isHydrated(norads[0])).toBe(false);
    service.selectSatellite(norads[0]);
    expect(service.selectedNorad).toBe(norads[0]);
    expect(service.selectedAssetId).toBe(`sat-${norads[0]}`);
    expect(registry.isHydrated(norads[0])).toBe(true);
    expect(registry.release(norads[0])).toBe(false);
    expect(seen).toEqual([{ type: 'satellite', id: `sat-${norads[0]}` }]);

    service.selectSatellite(norads[1]);
    expect(registry.release(norads[0])).toBe(true);
    expect(registry.release(norads[1])).toBe(false);
    service.selectOverview();
    expect(service.selectedAssetId).toBeNull();
    expect(registry.release(norads[1])).toBe(true);
    EventBus.getInstance().off(Events.ASSET_SELECTED, handler as never);
  });

  it('folds in ASSET_SELECTED emitted by other surfaces', () => {
    const service = SelectionService.getInstance();

    EventBus.getInstance().emit(Events.ASSET_SELECTED, { type: 'satellite', id: `sat-${norads[3]}` });
    expect(service.selectedNorad).toBe(norads[3]);
    expect(registry.isHydrated(norads[3])).toBe(true);
    EventBus.getInstance().emit(Events.MISSION_OVERVIEW_SELECTED);
    expect(service.selectedAssetId).toBeNull();
  });

  it('pins hydrate, bump the registry revision, and unpin releases to the tiers', () => {
    const service = SelectionService.getInstance();
    const before = registry.revision;

    expect(service.pin(norads[5])).toBe(true);
    expect(service.isPinned(norads[5])).toBe(true);
    expect(registry.isHydrated(norads[5])).toBe(true);
    expect(registry.revision).toBeGreaterThan(before);
    expect(service.pinnedNorads).toEqual([norads[5]]);
    expect(registry.release(norads[5])).toBe(false);

    service.unpin(norads[5]);
    expect(service.isPinned(norads[5])).toBe(false);
    expect(service.pinnedNorads).toEqual([]);
    expect(registry.release(norads[5])).toBe(true);
  });

  it('caps the pinned set at 24 and refuses the next pin', () => {
    const service = SelectionService.getInstance();

    expect(PINNED_CAP).toBe(24);
    for (let i = 0; i < PINNED_CAP; i++) {
      expect(service.pin(norads[i])).toBe(true);
    }
    expect(service.pinnedCount).toBe(24);
    expect(service.canPin(norads[30])).toBe(false);
    expect(service.pin(norads[30])).toBe(false);
    expect(service.isPinned(norads[30])).toBe(false);
    expect(registry.isHydrated(norads[30])).toBe(false);
    // Pinning an already pinned member stays fine, and unpinning frees a slot.
    expect(service.pin(norads[0])).toBe(true);
    service.unpin(norads[0]);
    expect(service.pin(norads[30])).toBe(true);
  });

  it('ignores non-members and emits SELECTION_CHANGED on pin changes', () => {
    const service = SelectionService.getInstance();
    const changes: { pinned: number[] }[] = [];
    const handler = (d: { pinned: number[] }) => changes.push(d);

    EventBus.getInstance().on(Events.SELECTION_CHANGED, handler as never);
    expect(service.pin(1)).toBe(false);
    service.pin(norads[2]);
    service.togglePin(norads[2]);
    expect(changes.map((c) => c.pinned)).toEqual([[norads[2]], []]);
    EventBus.getInstance().off(Events.SELECTION_CHANGED, handler as never);
  });

  it('starts clean when a new registry replaces the old one', () => {
    const service = SelectionService.getInstance();

    service.pin(norads[0]);
    holder.registry = new SatelliteRegistry([], { observer });
    holder.registry.addConstellation(set, { tleSet: set.id });
    expect(service.pinnedNorads).toEqual([]);
    expect(service.isPinned(norads[0])).toBe(false);
  });
});
