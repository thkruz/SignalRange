import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { resetMissionClock } from '@app/simulation/mission-clock';
import { SatelliteRegistry } from '@app/simulation/satellite-registry';
import { TimeSkipController } from '@app/simulation/time-skip-controller';
import type { TleSet } from '@app/tle-sets/tle-set-types';
import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSyntheticTles } from '../../scripts/tle-sets/synth';

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

const set = makeSet(30);
let registry: SatelliteRegistry;
let hydratedScan = 0;

vi.mock('@app/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: () => true,
    getInstance: () => ({
      get satellites() {
        hydratedScan++;

        return registry.hydrated;
      },
      trackedOrbitalSatellites: () => registry.tracked().filter((s) => s instanceof OrbitalSatellite),
      registry,
      groundStations: [],
      scheduler: { service: null, stationIndexOf: () => -1 },
    }),
  },
}));

vi.mock('@app/scenario-manager', () => ({
  ScenarioManager: { getInstance: () => ({ settings: { timeSkip: { leadTimeS: 120, minSkipS: 60, horizonHours: 4 } } }) },
}));

function inView(sat: unknown): void {
  Object.defineProperty(sat, 'isAboveHorizon', { get: () => true, configurable: true });
}

describe('TimeSkipController blocking at constellation scale', () => {
  beforeEach(() => {
    EventBus.destroy();
    OpsLogManager.destroy();
    TimeSkipController.destroy();
    resetMissionClock();
    EventBus.getInstance();
    OpsLogManager.initialize('13:50:00', '2026-11-09');
    OpsLogManager.getInstance().resume();
    registry = new SatelliteRegistry([], { observer });
    registry.addConstellation(set, { tleSet: set.id });
    hydratedScan = 0;
  });

  afterEach(() => {
    TimeSkipController.destroy();
    OpsLogManager.destroy();
    EventBus.destroy();
    resetMissionClock();
  });

  it('does not block on an unpinned member in view', () => {
    inView(registry.get(set.members[0].noradId));

    expect(TimeSkipController.getInstance().getBlockedReason()).toBeNull();
  });

  it('blocks on a pinned member in view', () => {
    const norad = set.members[1].noradId;
    inView(registry.get(norad));
    registry.pin(norad);

    expect(TimeSkipController.getInstance().getBlockedReason()).toContain('is in view');
  });

  it('never scans every hydrated satellite', () => {
    registry.pin(set.members[2].noradId);
    TimeSkipController.getInstance().getBlockedReason();

    expect(hydratedScan).toBe(0);
  });
});
