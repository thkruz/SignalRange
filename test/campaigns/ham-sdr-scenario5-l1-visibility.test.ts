import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Degrees } from 'ootk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Phase 19.3: NAVSTAR-77 at its real L1 EIRP (27 dBW). The S5 lesson is that
 * real GPS never shows on the analyzer (it sits under the receiver's own noise
 * until despread), while the terrestrial spoofer stands far above the floor,
 * and that visibility is itself the tell. Both halves are pinned here:
 * - NAVSTAR from the calibration ledger (the headless app's per-carrier rx IF
 *   power vs the noise in the carrier's bandwidth);
 * - the spoofer from the antenna's own terrestrial link budget vs kTB at the
 *   ledger's system temperature.
 */

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({ satellites: [], getSatsByAzEl: () => [], isDeveloperMode: false })),
    destroy: vi.fn(),
  },
}));

const scenarioSettings: { interferenceEvents: unknown[] } = { interferenceEvents: [] };

vi.mock('../../src/scenario-manager', () => ({
  ScenarioManager: {
    getInstance: vi.fn(() => ({ settings: scenarioSettings })),
  },
}));

import { navstar77Satellite } from '../../src/campaigns/ham-sdr/satellites';
import { hamSdrScenario5Data } from '../../src/campaigns/ham-sdr/scenario5';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore, type AntennaState } from '../../src/equipment/antenna/antenna-core';
import { InterferenceManager } from '../../src/interference/interference-manager';

class TestableAntenna extends AntennaCore {
  constructor(configId: ANTENNA_CONFIG_KEYS, initialState: Partial<AntennaState> = {}) {
    super(configId, initialState, 1, 1);
  }
  protected override addListeners_(): void {
    /* headless */
  }
  syncDomWithState(): void {
    /* headless */
  }
  draw(): void {
    /* headless */
  }

  terrestrialSignals(): { power: number; bandwidth: number; signalId: string }[] {
    // biome-ignore lint/suspicious/noExplicitAny: reaching the private link budget headlessly
    return (this as any).terrestrialRxSignals_();
  }
}

interface LedgerCarrier {
  signalId: string;
  peakRxIfDbm: number;
  noiseIfDbm: number;
}

interface Ledger {
  stations: { stationId: string; links: { satellite: string; atPeak: { tsysK: number }; carriers: LedgerCarrier[] }[] }[];
}

const ledger = JSON.parse(readFileSync(resolve(__dirname, '../calibration/ham-sdr-scenario5.json'), 'utf8')) as Ledger;
const navstarLink = ledger.stations.find((s) => s.stationId === 'BKYD-GPS')!.links.find((l) => l.satellite === 'NAVSTAR-77')!;
const navstarCarrier = navstarLink.carriers.find((c) => c.signalId === 'NAVSTAR-77-L1')!;

describe('ham-sdr S5: real GPS under the floor, the spoofer above it', () => {
  beforeEach(() => {
    InterferenceManager.destroy();
    scenarioSettings.interferenceEvents = [];
  });

  it('NAVSTAR-77 L1 radiates the real GPS EIRP (27 dBW), no teaching boost', () => {
    const l1 = navstar77Satellite.transponders.find((t) => t.id === 'L1');
    expect(l1?.beacon?.power).toBe(57);
  });

  it('the real L1 carrier arrives below the noise in its own 2 MHz at the patch', () => {
    const cnDb = navstarCarrier.peakRxIfDbm - navstarCarrier.noiseIfDbm;
    expect(cnDb).toBeLessThan(-3);
    expect(cnDb).toBeGreaterThan(-25);
  });

  it('the terrestrial spoofer stands far above the thermal floor in its 500 kHz', () => {
    const spoofer = hamSdrScenario5Data.settings.interferenceEvents!.find((e) => e.id === 'l1-spoofer')!;
    scenarioSettings.interferenceEvents = [{ ...spoofer, startAfterObjectiveId: undefined, startTime: 0 }];
    // biome-ignore lint/suspicious/noExplicitAny: driving the manager tick headlessly
    (InterferenceManager.getInstance() as any).update_();

    const patch = new TestableAntenna(ANTENNA_CONFIG_KEYS.L_BAND_GPS_PATCH, {
      azimuth: 0 as Degrees,
      elevation: 90 as Degrees, // fixed skyward: the spoofer is on the horizon
      circularHandedness: 'RHCP',
    });
    patch.attachStationLocation(44.48, -73.21);

    const signals = patch.terrestrialSignals();
    expect(signals).toHaveLength(1);

    const noiseDbm = -198.6 + 10 * Math.log10(navstarLink.atPeak.tsysK) + 10 * Math.log10(signals[0].bandwidth);
    // Measured 2026-10-06: -82.3 dBm vs -119.5 dBm, ~37 dB above the floor
    expect(signals[0].power - noiseDbm).toBeGreaterThan(25);
  });
});
