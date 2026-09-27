/**
 * Propagation reference cases (phase 19.1): free-space loss, ITU-R P.838-3
 * specific rain attenuation, ITU-R P.618-13 rain attenuation along the slant
 * path, ITU-R P.676-13 gaseous attenuation. Values from the Recommendations
 * and the ITU software validation examples (`data/README.md`).
 */

import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore } from '../../src/equipment/antenna/antenna-core';
import { expectWithinAbs, expectWithinRel, fsplDb, readItuCsv, referenceCase } from './reference-helpers';

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({ getSatByNoradId: vi.fn(), getSatsByAzEl: () => [], satellites: [], isDeveloperMode: false })),
    destroy: vi.fn(),
  },
}));

vi.mock('../../src/events/event-bus', () => ({
  EventBus: { getInstance: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() })) },
}));

vi.mock('../../src/equipment/antenna/step-track-controller', () => ({
  StepTrackController: vi.fn(function (this: Record<string, unknown>) {
    this.isRunning = vi.fn(() => false);
    return this;
  }),
}));

class ReferenceAntenna extends AntennaCore {
  protected override addListeners_(): void {
    // headless
  }

  syncDomWithState(): void {
    // headless
  }

  draw(): void {
    // headless
  }

  fspl(frequencyHz: number, distanceKm: number): number {
    return (this as unknown as { calculateFreeSpacePathLoss_: (f: number, d: number) => number }).calculateFreeSpacePathLoss_(frequencyHz, distanceKm);
  }

  gas(frequencyHz: number, elevationDeg: number): number {
    return (this as unknown as { calculateAtmosphericLoss_: (f: number, el: number) => number }).calculateAtmosphericLoss_(frequencyHz, elevationDeg);
  }

  rain(frequencyHz: number, rainRate: number, elevationDeg: number): number {
    this.updateRainRate(rainRate);
    return this.rainAttenuation_dB(frequencyHz, elevationDeg);
  }

  /** Specific attenuation (dB/km) the engine uses: zenith path through its 2.5 km layer, no reduction */
  gamma(frequencyHz: number, rainRate: number): number {
    return this.rain(frequencyHz, rainRate, 90) / 2.5;
  }
}

const antenna = new ReferenceAntenna(ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER, {}, 1, 1);

describe('free-space path loss', () => {
  const cases = [
    { name: 'GEO sub-satellite range at 4 GHz (C-band downlink)', km: 35_786, hz: 4e9 },
    { name: 'GEO slant range at 12 GHz (Ku downlink)', km: 38_000, hz: 12e9 },
    { name: 'LEO 2000 km at 2.2 GHz (S-band TT&C)', km: 2_000, hz: 2.2e9 },
  ];

  for (const c of cases) {
    referenceCase(`${c.name}: engine matches 20 log(4 pi d f / c) within 0.01 dB`, undefined, () => {
      expectWithinAbs(antenna.fspl(c.hz, c.km), fsplDb(c.km, c.hz), 0.01);
    });
  }
});

describe('ITU-R P.838-3 specific rain attenuation', () => {
  // Table 5, horizontal polarization
  const table5 = [
    { fGHz: 4, kH: 0.0001071, alphaH: 1.6009 },
    { fGHz: 12, kH: 0.02386, alphaH: 1.1825 },
    { fGHz: 20, kH: 0.09164, alphaH: 1.0568 },
    { fGHz: 30, kH: 0.2403, alphaH: 0.9485 },
  ];

  for (const row of table5) {
    referenceCase(`k_H at ${row.fGHz} GHz matches Table 5 within 2 %`, 'DEV-PROP-01', () => {
      expectWithinRel(antenna.gamma(row.fGHz * 1e9, 1), row.kH, 0.02);
    });
    referenceCase(`alpha_H at ${row.fGHz} GHz matches Table 5 within 0.01`, 'DEV-PROP-01', () => {
      const alpha = Math.log10(antenna.gamma(row.fGHz * 1e9, 10) / antenna.gamma(row.fGHz * 1e9, 1));
      expectWithinAbs(alpha, row.alphaH, 0.01);
    });
  }

  // ITU validation examples: gamma_R for the path's polarization tilt and elevation
  // The file repeats each case per site; keep the distinct (f, R, el) rows
  const rows = readItuCsv('ITURP838-3_rain_specific_attenuation.csv').filter((r, i, all) => all.findIndex((o) => o.f === r.f && o.R === r.R && o.el === r.el) === i);
  referenceCase(`gamma_R within 5 % on all ${rows.length} validation cases (14.25 and 29 GHz, tilted paths)`, 'DEV-PROP-01', () => {
    for (const row of rows) {
      expectWithinRel(antenna.gamma(row.f * 1e9, row.R), row.gamma_r, 0.05);
    }
  });
});

describe('ITU-R P.618-13 rain attenuation exceeded 0.01 % of the year', () => {
  // At p = 0.01 % the method takes the site's R0.01 directly, which is what the
  // engine's instantaneous rain rate stands for.
  const rows = readItuCsv('ITURP618-13_A_rain.csv').filter((r) => r.p === 0.01);

  referenceCase(`A0.01 within 15 % on all ${rows.length} validation sites (14.25 and 29 GHz)`, 'DEV-PROP-01', () => {
    for (const row of rows) {
      expectWithinRel(antenna.rain(row.f * 1e9, row.R001, row.el), row.A_rain, 0.15);
    }
  });
});

describe('ITU-R P.676-13 gaseous attenuation', () => {
  const rows = readItuCsv('ITURP676-13_A_gas.csv');

  referenceCase(`slant-path A_gas within 0.1 dB on all ${rows.length} validation cases (38-40 GHz, el 45 deg)`, 'DEV-PROP-03', () => {
    for (const row of rows) {
      expectWithinAbs(antenna.gas(row.f * 1e9, row.el), row.A_gas, 0.1);
    }
  });
});
