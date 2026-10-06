/**
 * Bent-pipe transponder physics (Phase 19.3).
 *
 * A carrier arrives at the satellite as the power an isotropic antenna there
 * would collect, P_iso = EIRP − FSPL − atmosphere − the uplink antenna's
 * off-axis drop (dBm). Everything the transponder does follows from three
 * datasheet numbers:
 *
 * - **SFD** (saturation flux density, dBW/m²): the flux that drives the
 *   channel amplifier to single-carrier saturation. In isotropic power,
 *   P_iso,sat = SFD + 10 log(λ²/4π).
 * - **G/T** (dB/K): uplink thermal noise referred to the same isotropic
 *   plane, N_iso = k·B / (G/T), so C/N0_up = P_iso + G/T − k, which is the
 *   textbook uplink equation C/N0_up = EIRP − L_up + G/T − k.
 * - **Saturated EIRP** (dBW): what the transponder radiates toward the
 *   station at single-carrier saturation.
 *
 * Input back-off IBO = P_iso,sat − (Σ carriers + uplink noise); output
 * back-off from the TWTA (Saleh) or SSPA (Rapp) transfer curve
 * (`amplifier-models.ts`, normalised so IBO 0 is saturation); the output is
 * shared by input power (carriers and the relayed uplink noise alike;
 * small-signal suppression is not modelled, DEV-XPDR-06). With two or more
 * carriers the third-order intermodulation from the same curve (two-tone
 * C/IM3 at the drive) spreads as noise over the transponder bandwidth.
 *
 * Each relayed carrier leaves with its downlink EIRP and the C/N0 of
 * everything it picked up on the way (uplink thermal noise and IM), which the
 * receiver adds to its own noise: (C/N)⁻¹ = (C/N)⁻¹_up + (C/IM)⁻¹ + (C/N)⁻¹_down
 * (+ C/I from relayed co-channel carriers, which arrive as carriers of their own).
 */

import { type AmplifierModel, carrierToIm3Db, envelopeResponse, rappSmoothnessForGap } from '@app/equipment/rf-front-end/amplifier-models';
import { BOLTZMANN_DBM_PER_K_HZ } from '@app/simulation/noise-model';

/** Speed of light, m/s */
const C_M_S = 299_792_458;

export type TransponderAmplifier = 'twta' | 'sspa';

/**
 * Gain mode of the channel amplifier: fixed gain (the output follows the
 * uplink, fades included) or automatic level control (the drive into the
 * power amplifier is held so the output sits at `alcOboDb` while the uplink
 * stays inside the ALC range).
 */
export type TransponderGainMode = 'fgm' | 'alc';

export interface TransponderPhysics {
  /** Saturation flux density, dBW/m² (single carrier, at the station's beam contour) */
  sfdDbwM2: number;
  /** Receive G/T toward the uplink station, dB/K */
  gOverTDbK: number;
  /** Saturated EIRP toward the downlink station, dBW */
  satEirpDbw: number;
  /** Power amplifier class */
  amplifier: TransponderAmplifier;
  /** Channel amplifier gain mode */
  gainMode: TransponderGainMode;
  /** ALC: the output back-off the loop holds, dB */
  alcOboDb: number;
  /** ALC: how far below the held drive the loop can still make up, dB */
  alcRangeDb: number;
}

/**
 * Defaults for a transponder authored without physics: a representative
 * C/Ku bent pipe (SFD −85 dBW/m², G/T 0 dB/K, 36 dBW saturated, TWTA, fixed
 * gain). Every shipped satellite states its own.
 */
export const DEFAULT_TRANSPONDER_PHYSICS: TransponderPhysics = {
  sfdDbwM2: -85,
  gOverTDbK: 0,
  satEirpDbw: 36,
  amplifier: 'twta',
  gainMode: 'fgm',
  alcOboDb: 3,
  alcRangeDb: 20,
};

/** A carrier at the transponder input */
export interface TransponderInput {
  signalId: string;
  /** Isotropic received power at the satellite, dBm */
  isoPowerDbm: number;
  /** Occupied bandwidth, Hz */
  bandwidthHz: number;
}

export interface RelayedCarrier {
  signalId: string;
  /** Downlink EIRP, dBm */
  eirpDbm: number;
  /** Uplink thermal C/N0, dB-Hz */
  cn0UpDbHz: number;
  /** Carrier to intermodulation-noise density, dB-Hz (Infinity: one carrier) */
  cn0ImDbHz: number;
  /** Everything upstream combined, dB-Hz */
  upstreamCn0DbHz: number;
}

export interface TransponderOperatingPoint {
  /** Input back-off from single-carrier saturation (total drive), dB; negative = overdriven */
  iboDb: number;
  /** Output back-off from saturated EIRP, dB */
  oboDb: number;
  /** Total input (carriers + uplink noise), isotropic dBm */
  totalInputDbm: number;
  /** Two-tone C/IM3 at this drive, dB (Infinity with fewer than two carriers) */
  carrierToImDb: number;
  carriers: RelayedCarrier[];
}

/** Isotropic effective aperture λ²/4π at a frequency, dB(m²) */
export function isotropicApertureDbM2(frequencyHz: number): number {
  const lambda = C_M_S / frequencyHz;

  return 10 * Math.log10((lambda * lambda) / (4 * Math.PI));
}

/** Flux density (dBW/m²) to the isotropic received power it produces (dBm) */
export function fluxToIsoPowerDbm(fluxDbwM2: number, frequencyHz: number): number {
  return fluxDbwM2 + isotropicApertureDbM2(frequencyHz) + 30;
}

/** Isotropic received power (dBm) to flux density (dBW/m²) */
export function isoPowerToFluxDbwM2(isoPowerDbm: number, frequencyHz: number): number {
  return isoPowerDbm - 30 - isotropicApertureDbM2(frequencyHz);
}

/** Uplink thermal noise density referred to the isotropic plane, dBm/Hz: k / (G/T) */
export function uplinkNoiseDensityDbmHz(gOverTDbK: number): number {
  return BOLTZMANN_DBM_PER_K_HZ - gOverTDbK;
}

/**
 * Transfer models normalised to saturation: single-carrier input 0 dB gives
 * output 0 dB for the TWTA (Saleh peak), and the SSPA's small-signal line
 * meets Psat at input 0 dB (Rapp, P1dB 1.5 dB under Psat, a typical SSPA).
 */
const TWTA_NORMALISED: AmplifierModel = { kind: 'saleh', gainDb: 10 * Math.log10(4), psatDbm: 0, smoothness: 1 };
const SSPA_NORMALISED: AmplifierModel = { kind: 'rapp', gainDb: 0, psatDbm: 0, smoothness: rappSmoothnessForGap(1.5) };

function normalisedModel(amplifier: TransponderAmplifier): AmplifierModel {
  return amplifier === 'sspa' ? SSPA_NORMALISED : TWTA_NORMALISED;
}

/** Output back-off (dB, ≥ 0) for an input back-off (dB; negative = overdriven), single carrier */
export function outputBackoffDb(amplifier: TransponderAmplifier, iboDb: number): number {
  const model = normalisedModel(amplifier);
  const r = Math.sqrt(10 ** (-iboDb / 10));
  const { amplitude } = envelopeResponse(model, r);
  if (!(amplitude > 0)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, -10 * Math.log10(amplitude * amplitude));
}

/**
 * Input back-off that gives an output back-off on the rising part of the
 * curve (bisection; ≥ 0). The ALC and the EIRP migration use it.
 */
export function inputBackoffForOutputDb(amplifier: TransponderAmplifier, oboDb: number): number {
  if (oboDb <= 0) {
    return 0;
  }
  let lo = 0;
  let hi = 80;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (outputBackoffDb(amplifier, mid) < oboDb) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return (lo + hi) / 2;
}

/** Two-tone C/IM3 (dB) at an input back-off */
export function carrierToIm3AtIboDb(amplifier: TransponderAmplifier, iboDb: number): number {
  return carrierToIm3Db(normalisedModel(amplifier), -iboDb);
}

const dbmToMw = (dbm: number): number => 10 ** (dbm / 10);
const mwToDbm = (mw: number): number => (mw > 0 ? 10 * Math.log10(mw) : Number.NEGATIVE_INFINITY);

/** Combine C/N0 terms (dB-Hz) as noise powers add */
export function combineCn0DbHz(...terms: number[]): number {
  let inv = 0;
  for (const t of terms) {
    if (Number.isFinite(t)) {
      inv += 10 ** (-t / 10);
    } else if (t === Number.NEGATIVE_INFINITY) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  return inv > 0 ? -10 * Math.log10(inv) : Number.POSITIVE_INFINITY;
}

/**
 * One transponder's operating point for the carriers arriving in its
 * passband (isotropic dBm at the satellite), with uplink frequency
 * `uplinkHz` and passband `bandwidthHz`.
 */
export function operateTransponder(physics: TransponderPhysics, inputs: TransponderInput[], uplinkHz: number, bandwidthHz: number): TransponderOperatingPoint {
  const n0UpDbmHz = uplinkNoiseDensityDbmHz(physics.gOverTDbK);
  const noiseInBandMw = dbmToMw(n0UpDbmHz + 10 * Math.log10(bandwidthHz));
  const carriersMw = inputs.reduce((sum, c) => sum + dbmToMw(c.isoPowerDbm), 0);
  const totalInputMw = carriersMw + noiseInBandMw;
  const totalInputDbm = mwToDbm(totalInputMw);
  const satInputDbm = fluxToIsoPowerDbm(physics.sfdDbwM2, uplinkHz);
  const iboDb = satInputDbm - totalInputDbm;

  // Drive into the power amplifier: the uplink's own back-off in fixed gain;
  // under ALC the loop holds the drive for the commanded output back-off
  // while the uplink stays inside its range, and falls off past it
  let driveIboDb = iboDb;
  if (physics.gainMode === 'alc') {
    const heldIbo = inputBackoffForOutputDb(physics.amplifier, physics.alcOboDb);
    const lowestHeldInput = heldIbo + physics.alcRangeDb;
    // The loop only adds gain: a drive stronger than the held point is levelled
    // down to it; a weaker one is lifted by up to alcRangeDb
    driveIboDb = iboDb <= lowestHeldInput ? heldIbo : heldIbo + (iboDb - lowestHeldInput);
  }
  const oboDb = outputBackoffDb(physics.amplifier, driveIboDb);
  const totalOutputDbm = physics.satEirpDbw + 30 - oboDb;

  const carrierCount = inputs.filter((c) => c.isoPowerDbm - (n0UpDbmHz + 10 * Math.log10(Math.max(1, c.bandwidthHz))) > -10).length;
  const carrierToImDb = carrierCount >= 2 ? carrierToIm3AtIboDb(physics.amplifier, driveIboDb) : Number.POSITIVE_INFINITY;
  // IM power across the passband (the third-order products of every pair,
  // noise-like for many carriers): the total output less C/IM3
  const imDensityDbmHz = Number.isFinite(carrierToImDb) ? totalOutputDbm - carrierToImDb - 10 * Math.log10(bandwidthHz) : Number.NEGATIVE_INFINITY;

  const carriers = inputs.map((c) => {
    const share = dbmToMw(c.isoPowerDbm) / totalInputMw;
    const eirpDbm = totalOutputDbm + 10 * Math.log10(share);
    const cn0UpDbHz = c.isoPowerDbm - n0UpDbmHz;
    const cn0ImDbHz = Number.isFinite(imDensityDbmHz) ? eirpDbm - imDensityDbmHz : Number.POSITIVE_INFINITY;

    return {
      signalId: c.signalId,
      eirpDbm,
      cn0UpDbHz,
      cn0ImDbHz,
      upstreamCn0DbHz: combineCn0DbHz(cn0UpDbHz, cn0ImDbHz),
    };
  });

  return { iboDb, oboDb, totalInputDbm, carrierToImDb, carriers };
}
