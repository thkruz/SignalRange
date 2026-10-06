/**
 * Link-budget reference cases (phase 19.1).
 *
 * A textbook Ku-band GEO downlink into the Prodelin 1244 2.4 m anchor, worked
 * the standard way (e.g. Maral & Bousquet, Satellite Communications Systems,
 * ch. 5): C/N0 = EIRP - FSPL - L + G/T - k. The engine's link-budget worksheet
 * must reproduce it; the live receive chain must put the antenna's noise into
 * the C/N it reports, which it does not yet (DEV-NOISE-01).
 */

import { createRFFrontEnd } from '../../src/equipment/rf-front-end/rf-front-end-factory';
import { EventBus } from '../../src/events/event-bus';
import { Events } from '../../src/events/events';
import { LinkBudgetManager } from '../../src/link-budget/link-budget-manager';
import { PRODELIN_1244_KU } from './anchors';
import { BOLTZMANN_DBW, expectWithinAbs, fsplDb, referenceCase } from './reference-helpers';

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
    document.body.innerHTML = '<div id="ref-root"></div>';
    EventBus.getInstance().clear(Events.UPDATE);
  });

  referenceCase('the noise floor behind the modem C/N includes the antenna temperature (within 0.5 dB)', 'DEV-NOISE-01', () => {
    const lnb = createRFFrontEnd('ref-root').lnbModule as unknown as {
      state: { lnaNoiseFigure: number; mixerNoiseFigure: number; gain: number; noiseTemperature: number };
      powerOnTimestamp_: number | null;
      updateNoiseTemperature_: () => void;
      getNoiseFloor: (b: number) => number;
    };
    lnb.state.lnaNoiseFigure = 0.8;
    lnb.state.gain = 65;
    lnb.powerOnTimestamp_ = null;
    for (let i = 0; i < 5000; i++) lnb.updateNoiseTemperature_();

    // Clear sky at 20 deg: the anchor's antenna temperature plus the LNB's own
    const reference = BOLTZMANN_DBW + 30 + 10 * Math.log10(LINK.antennaK + lnb.state.noiseTemperature) + 10 * Math.log10(LINK.bandwidthHz);
    expectWithinAbs(lnb.getNoiseFloor(LINK.bandwidthHz), reference, 0.5);
  });
});
