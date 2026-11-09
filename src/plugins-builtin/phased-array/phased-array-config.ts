import type { AntennaConfig } from '@app/equipment/antenna/antenna-configs';
import type { Hertz } from '@app/types';

/** Mission Control page kind for flat-panel electronically steered arrays. */
export const PHASED_ARRAY_KIND = 'phased-array';

/** Id of the plugin that owns the phased array registrations. */
export const PHASED_ARRAY_PLUGIN_ID = 'PhasedArray';

/** Antenna config id of the Starlink-style Ku user terminal. */
export const KU_PHASED_ARRAY_UT = 'KU_PHASED_ARRAY_UT';

/** Phased-array fields on top of the shared antenna config. */
export interface PhasedArrayConfig extends AntennaConfig {
  /** Azimuth the panel normal leans toward, degrees (irrelevant when the panel is flat) */
  panelAz_deg: number;
  /** Tilt of the panel normal from zenith, degrees (0 = flat, looking straight up) */
  panelTilt_deg: number;
  /** The beam cannot point further than this from the panel normal, degrees */
  maxScanDeg: number;
  /** Scan loss: gain falls by 10 * n * log10(cos(theta_s)) */
  scanLossExponent: number;
  /** Flat pattern floor outside the main beam, dB relative to the scanned peak (negative) */
  sidelobeFloor_dBc: number;
  /** Beam dead time at every handover, ms */
  handoverOutageMs: number;
  /** Time for the electronic beam to settle on a new direction, ms (no mechanical slew) */
  beamSettleMs: number;
}

/**
 * Starlink-style Ku user terminal (flat panel, near zenith).
 *
 * Bands: receive 10.7 to 12.7 GHz and transmit 14.0 to 14.5 GHz are the user
 * terminal bands SpaceX states in its FCC filings (reported by trade press on
 * the March 2020 FCC approval of 1 million terminals).
 *
 * Gain and G/T: a primary datasheet figure was not found. The values below
 * are set inside the range the brief asks for (peak receive gain 33 to 34 dBi,
 * G/T 9 to 10 dB/K at boresight) and are a game model, not a measured
 * Starlink number. Beamwidth follows from the gain: solid angle of about
 * 41253 / G deg^2 gives a 3 dB width near 4.3 degrees.
 */
export const KU_PHASED_ARRAY_UT_CONFIG: PhasedArrayConfig = {
  name: 'Ku-band phased array user terminal',
  kind: PHASED_ARRAY_KIND,
  // Physical size only; gain and beamwidth come from the fixed model
  diameter: 0.5,
  efficiency: 0.6,
  band: 'Ku',
  minRxFrequency: 10.7e9 as Hertz,
  maxRxFrequency: 12.7e9 as Hertz,
  minTxFrequency: 14.0e9 as Hertz,
  maxTxFrequency: 14.5e9 as Hertz,
  feedLoss: 0.3,

  gainModel: 'fixed',
  fixedGain_dBi: 33.5,
  fixedBeamwidth3dB_deg: 4.3,
  // The array is dual circular: the user terminal is not a linear-pol antenna
  polType: 'circular',
  xpd_dB: 25,

  // No servo: no jitter, no wind de-pointing, no slew limit that matters
  pointingSigma_deg: 0,
  elRange_deg: [0, 90],
  azContinuous: true,
  maxRate_deg_s: 36000,
  maxAccel_deg_s2: 36000000,

  // System noise: tuned so G/T at boresight reads about 9.5 dB/K (33.5 dBi - 0.3 dB feed - 10 log(T), T about 245 K)
  lnaNF_dB: 2.0,
  rxChainLoss_dB: 0,
  rxPhysTemp_K: 290,
  spilloverK: 25,

  panelAz_deg: 0,
  panelTilt_deg: 0,
  maxScanDeg: 57,
  scanLossExponent: 1.3,
  sidelobeFloor_dBc: -25,
  handoverOutageMs: 100,
  beamSettleMs: 5,
};
