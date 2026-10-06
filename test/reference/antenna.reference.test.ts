/**
 * Antenna reference cases (phase 19.1): the engine's dish configs against the
 * hardware anchors in `anchors.ts` (datasheet gain, beamwidth, G/T), the ITU-R
 * S.580-6 sidelobe envelope, and the main-lobe pointing loss.
 */

import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { AntennaCore } from '../../src/equipment/antenna/antenna-core';
import type { RfSignal } from '../../src/types';
import { CPI_9M_C_LINEAR, type DishAnchor, PRODELIN_1244_KU, S580_ENVELOPE_POINTS } from './anchors';
import { expectWithinAbs, expectWithinRel, referenceCase } from './reference-helpers';

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

type Internals = {
  antennaGain_dBi: (f: number) => number;
  beamwidth3dB_deg_: (f: number) => number;
  patternGain_dBi_: (theta: number, f: number) => number;
  gOverT_dB_perK_: (f: number, el: number) => number;
  systemNoise: (f: number, el: number) => { antennaAtLnaK: number; systemK: number };
  applyPropagationEffects_: (sat: unknown, signal: RfSignal, view: { az: number; el: number; rangeKm: number | null }) => RfSignal;
};

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

  get internals(): Internals {
    return this as unknown as Internals;
  }

  /** Received power for a carrier arriving from (az, el), with the dish pointed at its current az/el */
  receivedDbm(frequencyHz: number, az: number, el: number): number {
    const signal = { signalId: 'ref', frequency: frequencyHz, power: 0, polarization: 'H', rotation: this.state.polarization, bandwidth: 1e6 } as unknown as RfSignal;
    return this.internals.applyPropagationEffects_(null, signal, { az, el, rangeKm: 38_000 }).power;
  }
}

const dish = (key: ANTENNA_CONFIG_KEYS, az = 180, el = 30) => new ReferenceAntenna(key, { azimuth: az, elevation: el, polarization: 0 } as never, 1, 1);

/** Receive-side LNA noise temperature the engine config assumes, K */
const lnaK = (antenna: ReferenceAntenna) => 290 * (10 ** ((antenna.config as { lnaNF_dB?: number }).lnaNF_dB! / 10) - 1);

/**
 * Known gaps per dish. Since phase 19.2 the noise half of G/T meets the
 * datasheets (antenna temperature at the flange); what still fails G/T is the
 * gain at the flange (aperture gain less feed loss), an antenna calibration
 * item (DEV-ANT-07, 19.4).
 */
const DISHES: Array<{ key: ANTENNA_CONFIG_KEYS; anchor: DishAnchor; gainDeviation?: string; gOverTDeviation?: string }> = [
  { key: ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, anchor: CPI_9M_C_LINEAR, gOverTDeviation: 'DEV-ANT-07' },
  { key: ANTENNA_CONFIG_KEYS.KU_BAND_2M4_ANTESTAR, anchor: PRODELIN_1244_KU, gainDeviation: 'DEV-ANT-07', gOverTDeviation: 'DEV-ANT-07' },
];

describe('dish configs against datasheet anchors', () => {
  for (const { key, anchor, gainDeviation, gOverTDeviation } of DISHES) {
    const antenna = dish(key);

    referenceCase(`${key} receive gain within 1 dB of ${anchor.source} (${anchor.rxGainDbi} dBi)`, gainDeviation, () => {
      expectWithinAbs(antenna.internals.antennaGain_dBi(anchor.rxFrequencyHz), anchor.rxGainDbi, 1);
    });

    referenceCase(`${key} -3 dB beamwidth within 15 % of the datasheet (${anchor.hpbwDeg} deg)`, undefined, () => {
      expectWithinRel(antenna.internals.beamwidth3dB_deg_(anchor.rxFrequencyHz), anchor.hpbwDeg, 0.15);
    });

    // Antenna noise temperature at the LNA flange, 20 deg clear sky: sky,
    // spillover and the feed's own noise (phase 19.2 noise model)
    referenceCase(`${key} antenna temperature at the flange at 20 deg within 15 % of the datasheet (${anchor.antennaNoiseK[20]} K)`, undefined, () => {
      expectWithinRel(antenna.internals.systemNoise(anchor.rxFrequencyHz, 20).antennaAtLnaK, anchor.antennaNoiseK[20], 0.15);
    });

    referenceCase(`${key} system temperature at 20 deg is the antenna temperature plus the LNA's (within 15 %)`, undefined, () => {
      expectWithinRel(antenna.internals.systemNoise(anchor.rxFrequencyHz, 20).systemK, anchor.antennaNoiseK[20] + lnaK(antenna), 0.15);
    });

    // G/T at 20 deg clear sky, from the datasheet's antenna temperature with the
    // engine's own LNA: G - 10 log(T_ant + T_LNA)
    referenceCase(`${key} G/T at 20 deg within 1 dB of the datasheet gain and antenna temperature`, gOverTDeviation, () => {
      const reference = anchor.rxGainDbi - 10 * Math.log10(anchor.antennaNoiseK[20] + lnaK(antenna));
      expectWithinAbs(antenna.internals.gOverT_dB_perK_(anchor.rxFrequencyHz, 20), reference, 1);
    });
  }

  referenceCase('the CPI datasheet is self-consistent: G - 10 log(T_ant + T_LNA) reproduces its published G/T within 0.2 dB', undefined, () => {
    const a = CPI_9M_C_LINEAR;
    expectWithinAbs(a.rxGainDbi - 10 * Math.log10(a.antennaNoiseK[20] + a.gOverT!.lnaK), a.gOverT!.dbPerK, 0.2);
  });
});

describe('ITU-R S.580-6 sidelobe envelope', () => {
  const antenna = dish(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK);

  referenceCase('9 m C-band pattern at 2, 10, 30 and 60 deg off axis stays under 29 - 25 log(theta) / -10 dBi', 'DEV-ANT-01', () => {
    for (const point of S580_ENVELOPE_POINTS) {
      expect(antenna.internals.patternGain_dBi_(point.thetaDeg, 4e9), `${point.thetaDeg} deg`).toBeLessThanOrEqual(point.maxDbi);
    }
  });
});

describe('main-lobe pointing loss', () => {
  const f = 4e9;

  referenceCase('half a beamwidth off in elevation costs 3 dB (12 (theta/theta3)^2), charged once', 'DEV-ANT-02', () => {
    const antenna = dish(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, 180, 30);
    const halfBeam = antenna.internals.beamwidth3dB_deg_(f) / 2;
    const loss = antenna.receivedDbm(f, 180, 30) - antenna.receivedDbm(f, 180, 30 + halfBeam);
    expectWithinAbs(loss, 3, 0.1);
  });

  referenceCase('an azimuth offset at 60 deg elevation is worth cos(el) of itself on the sky', 'DEV-ANT-03', () => {
    const antenna = dish(ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK, 180, 60);
    const theta3 = antenna.internals.beamwidth3dB_deg_(f);
    // A full beamwidth of azimuth at 60 deg elevation is half a beamwidth of true angle
    const loss = antenna.receivedDbm(f, 180, 60) - antenna.receivedDbm(f, 180 + theta3, 60);
    expectWithinAbs(loss, 3, 0.2);
  });
});
