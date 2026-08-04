import type { Degrees, Kilometers, TleLine1, TleLine2 } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E3 additive: spaceEvents[].initialTle - the tampered element set forced
 * onto the bird at scenario load (Campaign 3 S6). Applied at manager
 * construction so replays re-tamper the (reloadTle-mutated) instance;
 * applyEphemerisUpdate restores the authored truth.
 */

const scenarioSettings: { spaceEvents: unknown[] } = { spaceEvents: [] };
const simSatellites: unknown[] = [];

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({ settings: scenarioSettings })),
  },
}));

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    hasInstance: vi.fn(() => true),
    getInstance: vi.fn(() => ({ satellites: simSatellites })),
    destroy: vi.fn(),
  },
}));

import { OrbitalSatellite } from '../../src/equipment/satellite/orbital-satellite';
import { SpaceEventManager } from '../../src/space-events/space-event-manager';

const OBSERVER = { lat: 44.48 as Degrees, lon: -73.21 as Degrees, alt: 0.05 as Kilometers };
const TRUTH_TLE1 = '1 63002U 27042A   27170.66666667  .00001000  00000-0  10000-3 0  9997';
const TRUTH_TLE2 = '2 63002  97.5000  94.0000 0010000  90.0000 226.0000 14.90000000123456';
const TAMPERED_TLE2 = '2 63002  97.5000 154.0000 0010000  90.0000 226.0000 14.90000000123456';

describe('SpaceEventManager initialTle', () => {
  beforeEach(() => {
    SpaceEventManager.destroy();
    simSatellites.length = 0;
    scenarioSettings.spaceEvents = [];
  });

  it('applies the tampered TLE at construction and restores truth on update', () => {
    const sat = new OrbitalSatellite('CUBEHOP-1', 63002, [], [], {
      tle1: TRUTH_TLE1 as TleLine1,
      tle2: TRUTH_TLE2 as TleLine2,
      observer: OBSERVER,
    });
    simSatellites.push(sat);
    scenarioSettings.spaceEvents = [{
      id: 'CUBEHOP-TLE',
      satelliteNoradId: 63002,
      maneuverAtS: 30,
      newTle: { tle1: TRUTH_TLE1, tle2: TRUTH_TLE2 },
      initialTle: { tle1: TRUTH_TLE1, tle2: TAMPERED_TLE2 },
    }];

    // Compare orbits at one fixed instant so propagation timestamps cancel out
    const fixedDate = new Date(Date.UTC(2027, 5, 23, 16, 0, 0));
    const truthAz = sat.ootkSatellite.rae(sat.groundObserver, fixedDate).az;

    const manager = SpaceEventManager.getInstance();

    // Construction tampered the bird: same instant, different sky position
    const tamperedAz = sat.ootkSatellite.rae(sat.groundObserver, fixedDate).az;
    expect(Math.abs(tamperedAz - truthAz)).toBeGreaterThan(1);

    // Player loads fresh elements -> truth restored
    manager.triggerManeuver('CUBEHOP-TLE');
    manager.applyEphemerisUpdate('CUBEHOP-TLE');
    const restoredAz = sat.ootkSatellite.rae(sat.groundObserver, fixedDate).az;
    expect(restoredAz).toBeCloseTo(truthAz, 6);
    expect(manager.isEphemerisUpdated('CUBEHOP-TLE')).toBe(true);
  });

  it('events without initialTle leave their satellite untouched (legacy)', () => {
    const sat = new OrbitalSatellite('SAR-1', 61701, [], [], {
      tle1: TRUTH_TLE1.replace('63002', '61701') as TleLine1,
      tle2: TRUTH_TLE2.replace('63002', '61701') as TleLine2,
      observer: OBSERVER,
    });
    simSatellites.push(sat);
    scenarioSettings.spaceEvents = [{
      id: 'SAR1-CAM',
      satelliteNoradId: 61701,
      maneuverAtS: 60,
      newTle: { tle1: TRUTH_TLE1, tle2: TRUTH_TLE2 },
    }];

    const fixedDate = new Date(Date.UTC(2027, 5, 23, 16, 0, 0));
    const beforeAz = sat.ootkSatellite.rae(sat.groundObserver, fixedDate).az;
    SpaceEventManager.getInstance();
    const afterAz = sat.ootkSatellite.rae(sat.groundObserver, fixedDate).az;

    expect(afterAz).toBe(beforeAz);
  });
});
