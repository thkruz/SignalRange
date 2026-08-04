import type { Degrees } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * E1 - terrestrial emitter path (Campaign 3 S5/S7/S8).
 *
 * Covers the three plan-mandated angles:
 * 1. spectrum presence: an active terrestrial event is heard by an antenna
 *    with an attached station location, at a power that follows the link
 *    budget (EIRP - FSPL - pol - feed + pattern gain);
 * 2. pattern gain vs bearing: sweeping the yagi across the emitter bearing
 *    changes received power by the front-to-back ratio (DF gameplay);
 * 3. transponder path regression: legacy events (no `path`) still inject at
 *    the satellite and terrestrial events never touch satellite state.
 */

const fakeSatellite = { noradId: 63002, externalSignal: [] as unknown[] };

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({
      update: vi.fn(),
      draw: vi.fn(),
      sync: vi.fn(),
      getSatByNoradId: vi.fn(),
      getSatsByAzEl: () => [],
      satellites: [fakeSatellite],
      isDeveloperMode: false,
    })),
    destroy: vi.fn(),
  },
}));

// Station: Riley's backyard. Emitter: ~10 km due north of it.
const STATION = { latitude: 44.48, longitude: -73.21 };
const EMITTER = { latitude: 44.57, longitude: -73.21 };

const scenarioSettings: { interferenceEvents: unknown[] } = { interferenceEvents: [] };

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({ settings: scenarioSettings })),
  },
}));

import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, AntennaState } from '../../src/equipment/antenna/antenna-core';
import { InterferenceManager } from '../../src/interference/interference-manager';

class TestableAntenna extends AntennaCore {
  constructor(configId: ANTENNA_CONFIG_KEYS, initialState: Partial<AntennaState> = {}) {
    super(configId, initialState, 1, 1);
  }
  protected override addListeners_(): void { /* headless */ }
  syncDomWithState(): void { /* headless */ }
  draw(): void { /* headless */ }

  terrestrialSignals(): { power: number; frequency: number; signalId: string }[] {
    return (this as any).terrestrialRxSignals_();
  }
}

const RFI_EVENT = {
  id: 'backyard-rfi',
  frequency: 435.25e6,
  bandwidth: 200e3,
  power: 30, // EIRP dBm
  polarization: 'V',
  startTime: 0,
  duration: 1e6,
  periodSeconds: 100,
  onSeconds: 100,
  path: 'terrestrial',
  emitter: EMITTER,
};

describe('E1: terrestrial emitter path', () => {
  beforeEach(() => {
    InterferenceManager.destroy();
    fakeSatellite.externalSignal = [];
    scenarioSettings.interferenceEvents = [];
  });

  it('activates and deactivates terrestrial events without touching satellites', () => {
    scenarioSettings.interferenceEvents = [
      RFI_EVENT,
      { ...RFI_EVENT, id: 'not-yet', startTime: 99999 },
    ];
    const manager = InterferenceManager.getInstance();
    (manager as any).update_();

    const active = manager.getActiveTerrestrialEmissions();
    expect(active).toHaveLength(1);
    expect(active[0].signalId).toBe('INTERFERER-backyard-rfi');
    expect(active[0].eirpDbm).toBe(30);
    // Terrestrial events never inject at a satellite
    expect(fakeSatellite.externalSignal).toHaveLength(0);
    expect(manager.isEventActive('backyard-rfi')).toBe(true);
    expect(manager.isEventActive('not-yet')).toBe(false);
  });

  it('legacy transponder events still inject at the satellite (regression)', () => {
    scenarioSettings.interferenceEvents = [{
      id: 'pirate',
      satelliteNoradId: 63002,
      frequency: 435.9e6,
      bandwidth: 15e3,
      power: -60,
      polarization: 'H',
      startTime: 0,
      duration: 1e6,
      periodSeconds: 100,
      onSeconds: 100,
      // no path field: default transponder behavior
    }];
    const manager = InterferenceManager.getInstance();
    (manager as any).update_();

    expect(fakeSatellite.externalSignal).toHaveLength(1);
    expect((fakeSatellite.externalSignal[0] as { signalId: string }).signalId).toBe('INTERFERER-pirate');
    expect(manager.getActiveTerrestrialEmissions()).toHaveLength(0);
  });

  it('an antenna with a station location hears the emitter at link-budget power', () => {
    scenarioSettings.interferenceEvents = [RFI_EVENT];
    const manager = InterferenceManager.getInstance();
    (manager as any).update_();

    const yagi = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      azimuth: 0 as Degrees, // pointed at the emitter bearing (due north)
      elevation: 0 as Degrees,
    });
    yagi.attachStationLocation(STATION.latitude, STATION.longitude);

    const signals = yagi.terrestrialSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].frequency).toBe(435.25e6);
    // 30 dBm EIRP - ~105 dB FSPL(10 km, 435 MHz) - pol - feed + 12 dBi boresight
    expect(signals[0].power).toBeGreaterThan(-85);
    expect(signals[0].power).toBeLessThan(-55);
  });

  it('sweeping the yagi off the bearing drops the signal by the front-to-back ratio', () => {
    scenarioSettings.interferenceEvents = [RFI_EVENT];
    const manager = InterferenceManager.getInstance();
    (manager as any).update_();

    const front = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      azimuth: 0 as Degrees, elevation: 0 as Degrees,
    });
    front.attachStationLocation(STATION.latitude, STATION.longitude);
    const back = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      azimuth: 180 as Degrees, elevation: 0 as Degrees,
    });
    back.attachStationLocation(STATION.latitude, STATION.longitude);

    const frontPower = front.terrestrialSignals()[0].power;
    const backPower = back.terrestrialSignals()[0].power;
    // fixedFrontToBack_dB for the 70cm crossed yagi is 18 dB
    expect(frontPower - backPower).toBeCloseTo(18, 1);
  });

  it('hears nothing without a station location or without the manager (legacy)', () => {
    scenarioSettings.interferenceEvents = [RFI_EVENT];
    const manager = InterferenceManager.getInstance();
    (manager as any).update_();

    const noLocation = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      azimuth: 0 as Degrees, elevation: 0 as Degrees,
    });
    expect(noLocation.terrestrialSignals()).toHaveLength(0);

    InterferenceManager.destroy();
    const located = new TestableAntenna(ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM, {
      azimuth: 0 as Degrees, elevation: 0 as Degrees,
    });
    located.attachStationLocation(STATION.latitude, STATION.longitude);
    expect(located.terrestrialSignals()).toHaveLength(0);
  });
});
