/**
 * Link-budget reference cases (phase 19.1).
 *
 * A textbook Ku-band GEO downlink into the Prodelin 1244 2.4 m anchor, worked
 * the standard way (e.g. Maral & Bousquet, Satellite Communications Systems,
 * ch. 5): C/N0 = EIRP - FSPL - L + G/T - k. The engine's link-budget worksheet
 * must reproduce it; the live receive chain must put the antenna's noise into
 * the C/N it reports (phase 19.2 noise model).
 */

import type { Degrees } from 'ootk';
import { vi } from 'vitest';
import { ANTENNA_CONFIG_KEYS } from '../../src/equipment/antenna/antenna-config-keys';
import { createAntenna } from '../../src/equipment/antenna/antenna-factory';
import { TapPoint } from '../../src/equipment/rf-front-end/coupler-module/tap-points';
import { createRFFrontEnd } from '../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { LinkBudgetManager } from '../../src/link-budget/link-budget-manager';
import type { Hertz } from '../../src/types';
import { PRODELIN_1244_KU } from './anchors';
import { BOLTZMANN_DBW, expectWithinAbs, expectWithinRel, fsplDb, referenceCase } from './reference-helpers';

vi.mock('../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn(() => ({ getSatByNoradId: vi.fn(), getSatsByAzEl: () => [], satellites: [], groundStations: [], isDeveloperMode: false })),
    destroy: vi.fn(),
  },
}));

/** The worked example's inputs */
const LINK = {
  eirpDbw: 50,
  frequencyHz: PRODELIN_1244_KU.rxFrequencyHz,
  slantRangeKm: 38_000,
  /** Clear-sky atmosphere at 20 deg, Ku (P.676-order value) */
  atmosphereDb: 0.3,
  rxGainDbi: PRODELIN_1244_KU.rxGainDbi,
  antennaK: PRODELIN_1244_KU.antennaNoiseK[20],
  /** 0.8 dB NF Ku LNB: 290 (10^0.08 - 1) */
  lnbK: 290 * (10 ** 0.08 - 1),
  bandwidthHz: 36e6,
};

const tsysK = LINK.antennaK + LINK.lnbK;
const referenceCn0 = LINK.eirpDbw - fsplDb(LINK.slantRangeKm, LINK.frequencyHz) - LINK.atmosphereDb + (LINK.rxGainDbi - 10 * Math.log10(tsysK)) - BOLTZMANN_DBW;

describe('textbook Ku downlink: 50 dBW from GEO into a 2.4 m VSAT, clear sky', () => {
  referenceCase('the reference itself: C/N0 is 100.0 dBHz (FSPL 205.4 dB, G/T 27.1 dB/K), 24.4 dB C/N in 36 MHz', undefined, () => {
    expectWithinAbs(referenceCn0, 100.0, 0.1);
  });

  referenceCase('the link-budget worksheet reproduces C/N0 within 0.3 dB', undefined, () => {
    const cnDb = LinkBudgetManager.computeCNRDb({
      eirpDbm: LINK.eirpDbw + 30,
      fsplDb: fsplDb(LINK.slantRangeKm, LINK.frequencyHz),
      rxGainDbi: LINK.rxGainDbi,
      miscLossDb: LINK.atmosphereDb,
      systemNoiseTempK: tsysK,
      bandwidthHz: LINK.bandwidthHz,
    } as Parameters<typeof LinkBudgetManager.computeCNRDb>[0]);

    expectWithinAbs(cnDb + 10 * Math.log10(LINK.bandwidthHz), referenceCn0, 0.3);
  });
});

describe('receive-chain noise', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ref-ant"></div><div id="ref-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
  });

  /** The anchor dish at 20 deg with a 0.8 dB NF LNB behind it, settled */
  const chain = () => {
    const antenna = createAntenna('ref-ant', 'headless', ANTENNA_CONFIG_KEYS.KU_BAND_2M4_ANTESTAR, { elevation: 20 as Degrees, isPowered: true, isOperational: true });
    const frontEnd = createRFFrontEnd('ref-root');
    frontEnd.connectAntenna(antenna);
    antenna.attachRfFrontEnd(frontEnd);
    const lnb = frontEnd.lnbModule as unknown as {
      state: { lnaNoiseFigure: number; gain: number; noiseTemperature: number; isPowered: boolean };
      powerOnTimestamp_: number | null;
      updateNoiseTemperature_: () => void;
    };
    lnb.state.isPowered = true;
    lnb.state.lnaNoiseFigure = 0.8;
    lnb.state.gain = 65;
    lnb.powerOnTimestamp_ = null;
    for (let i = 0; i < 5000; i++) lnb.updateNoiseTemperature_();

    return { antenna, frontEnd, lnb };
  };

  referenceCase('the noise floor behind the modem C/N is k(T_ant + T_LNB)B with the datasheet antenna temperature (within 0.5 dB)', undefined, () => {
    const { frontEnd, lnb } = chain();
    const reference = BOLTZMANN_DBW + 30 + 10 * Math.log10(LINK.antennaK + lnb.state.noiseTemperature) + 10 * Math.log10(LINK.bandwidthHz);
    const floor = frontEnd.couplerModule.signalPathManager.getNoiseFloorAt(TapPoint.RX_IF, LINK.bandwidthHz as Hertz).noiseFloorNoGain;

    expectWithinAbs(floor, reference, 0.5);
  });

  referenceCase('rain raises the floor: 25 mm/h at Ku adds T_mr (1 - 10^(-A/10)) of sky noise (P.618 §3)', undefined, () => {
    const { antenna, frontEnd } = chain();
    const spm = frontEnd.couplerModule.signalPathManager;
    const dry = spm.systemNoiseK();
    antenna.updateRainRate(25);
    const rainDb = antenna.rainAttenuation_dB(antenna.noiseReferenceHz, 20);
    const feed = 10 ** (-0.29 / 10);
    // The rain layer replaces part of the clear sky with its own emission at 275 K
    const expectedRise = (275 - antenna.systemNoise(antenna.noiseReferenceHz, 20, false).skyK) * (1 - 10 ** (-rainDb / 10)) * feed;

    expect(rainDb).toBeGreaterThan(1);
    expectWithinRel(spm.systemNoiseK() - dry, expectedRise, 0.05);
  });
});
