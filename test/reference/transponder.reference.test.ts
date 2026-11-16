/**
 * Transponder reference cases (phase 19.3).
 *
 * A textbook C-band bent-pipe link worked the standard way (Maral &
 * Bousquet, Satellite Communications Systems, ch. 5; Pratt & Bostian,
 * Satellite Communications, ch. 4): uplink C/N0 = EIRP - L_up + G/T - k,
 * flux density PFD = EIRP - 10 log(4 pi d^2), input back-off against the
 * SFD, output back-off from the TWTA curve, and the composite
 * (C/N)^-1 = (C/N_up)^-1 + (C/N_down)^-1 (+ C/IM). The engine's transponder
 * model must reproduce each number.
 */

import {
  carrierToIm3AtIboDb,
  combineCn0DbHz,
  fluxToIsoPowerDbm,
  inputBackoffForOutputDb,
  isoPowerToFluxDbwM2,
  operateTransponder,
  outputBackoffDb,
  type TransponderPhysics,
} from '../../src/equipment/satellite/transponder-model';
import { geoSlantRangeKm } from '../../src/simulation/geo-geometry';
import { BOLTZMANN_DBW, expectWithinAbs, fsplDb, referenceCase } from './reference-helpers';

/** The worked example: a 9 m C-band uplink into a GEO transponder at 30 deg elevation */
const LINK = {
  uplinkHz: 6.0e9,
  elevationDeg: 30,
  eirpDbw: 72,
  bandwidthHz: 36e6,
};

const PHYSICS: TransponderPhysics = {
  sfdDbwM2: -88,
  gOverTDbK: -2,
  satEirpDbw: 36,
  amplifier: 'twta',
  gainMode: 'fgm',
  alcOboDb: 3,
  alcRangeDb: 20,
};

const rangeKm = geoSlantRangeKm(LINK.elevationDeg);
const lossDb = fsplDb(rangeKm, LINK.uplinkHz);
const isoDbm = LINK.eirpDbw - lossDb + 30;
const point = operateTransponder(PHYSICS, [{ signalId: 'c', isoPowerDbm: isoDbm, bandwidthHz: LINK.bandwidthHz }], LINK.uplinkHz, LINK.bandwidthHz);

describe('textbook C-band uplink: 72 dBW from a 9 m into a GEO bent pipe at 30 deg', () => {
  referenceCase('GEO slant range: 35,786 km at zenith (spherical Earth), ~38,600 km at 30 deg, ~41,700 km on the horizon', undefined, () => {
    expectWithinAbs(geoSlantRangeKm(90), 35_793, 10);
    expectWithinAbs(rangeKm, 38_610, 30);
    expectWithinAbs(geoSlantRangeKm(0), 41_679, 10);
  });

  referenceCase('uplink C/N0 = EIRP - FSPL + G/T - k (98.9 dBHz here)', undefined, () => {
    const textbook = LINK.eirpDbw - lossDb + PHYSICS.gOverTDbK - BOLTZMANN_DBW;
    expectWithinAbs(textbook, 98.9, 0.1);
    expectWithinAbs(point.carriers[0].cn0UpDbHz, textbook, 0.01);
  });

  referenceCase('flux density PFD = EIRP - 10 log(4 pi d^2) (-90.7 dBW/m^2), and IBO = SFD - PFD', undefined, () => {
    const pfd = LINK.eirpDbw - 10 * Math.log10(4 * Math.PI * (rangeKm * 1e3) ** 2);
    expectWithinAbs(isoPowerToFluxDbwM2(isoDbm, LINK.uplinkHz), pfd, 0.01);
    // Uplink noise in the passband is 23 dB under the carrier: the IBO is the carrier's
    expectWithinAbs(point.iboDb, PHYSICS.sfdDbwM2 - pfd, 0.03);
  });

  referenceCase('a carrier at the SFD drives the TWTA to saturation (IBO 0, OBO 0)', undefined, () => {
    const atSfd = operateTransponder(
      { ...PHYSICS, gOverTDbK: 40 },
      [{ signalId: 'c', isoPowerDbm: fluxToIsoPowerDbm(PHYSICS.sfdDbwM2, LINK.uplinkHz), bandwidthHz: LINK.bandwidthHz }],
      LINK.uplinkHz,
      LINK.bandwidthHz
    );
    expectWithinAbs(atSfd.iboDb, 0, 0.01);
    expectWithinAbs(atSfd.oboDb, 0, 0.01);
    expectWithinAbs(atSfd.carriers[0].eirpDbm - 30, PHYSICS.satEirpDbw, 0.01);
  });
});

describe('TWTA transfer (Saleh, normalised to saturation)', () => {
  referenceCase('small signal: OBO = IBO - 6.02 dB (Saleh linear gain twice the saturating ratio)', undefined, () => {
    expectWithinAbs(outputBackoffDb('twta', 30), 30 - 6.02, 0.01);
  });

  referenceCase('the knee: IBO 3 dB gives OBO 0.51 dB, IBO 10 dB gives OBO 4.4 dB', undefined, () => {
    // 4x/(1+x)^2 at x = 10^-0.3 and 10^-1
    expectWithinAbs(outputBackoffDb('twta', 3), -10 * Math.log10((4 * 10 ** -0.3) / (1 + 10 ** -0.3) ** 2), 0.005);
    expectWithinAbs(outputBackoffDb('twta', 10), -10 * Math.log10((4 * 0.1) / 1.1 ** 2), 0.005);
  });

  referenceCase('overdrive folds back: 3 dB past saturation gives the same OBO as 3 dB short of it', undefined, () => {
    expectWithinAbs(outputBackoffDb('twta', -3), outputBackoffDb('twta', 3), 0.005);
  });

  referenceCase('inverse: the IBO for an OBO round-trips on the rising side', undefined, () => {
    for (const obo of [0.5, 2, 6, 15]) {
      expectWithinAbs(outputBackoffDb('twta', inputBackoffForOutputDb('twta', obo)), obo, 0.01);
    }
  });

  referenceCase('two-tone C/IM3 improves with back-off and approaches the 2 dB/dB third-order slope', undefined, () => {
    const atIbo20 = carrierToIm3AtIboDb('twta', 20);
    const atIbo30 = carrierToIm3AtIboDb('twta', 30);
    expect(atIbo20).toBeGreaterThan(carrierToIm3AtIboDb('twta', 3));
    expectWithinAbs((atIbo30 - atIbo20) / 10, 2, 0.1);
  });
});

describe('composite C/N', () => {
  referenceCase('(C/N)^-1 adds: 20 dB up and 15 dB down give 13.81 dB', undefined, () => {
    expectWithinAbs(combineCn0DbHz(20, 15), 13.81, 0.01);
  });

  referenceCase('power sharing: two carriers 6 dB apart at the input leave 6 dB apart and split the output', undefined, () => {
    const two = operateTransponder(
      { ...PHYSICS, gOverTDbK: 40 },
      [
        { signalId: 'a', isoPowerDbm: isoDbm, bandwidthHz: 10e6 },
        { signalId: 'b', isoPowerDbm: isoDbm - 6, bandwidthHz: 10e6 },
      ],
      LINK.uplinkHz,
      LINK.bandwidthHz
    );
    expectWithinAbs(two.carriers[0].eirpDbm - two.carriers[1].eirpDbm, 6, 0.01);
    const totalDbm = 10 * Math.log10(10 ** (two.carriers[0].eirpDbm / 10) + 10 ** (two.carriers[1].eirpDbm / 10));
    expectWithinAbs(totalDbm - 30, PHYSICS.satEirpDbw - two.oboDb, 0.01);
    // Two carriers make intermodulation; one does not
    expect(Number.isFinite(two.carrierToImDb)).toBe(true);
    expect(point.carrierToImDb).toBe(Number.POSITIVE_INFINITY);
  });
});
