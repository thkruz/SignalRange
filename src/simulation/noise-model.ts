/**
 * System noise temperature (Phase 19.2): one model for every place that needs
 * the receive noise - modem and beacon C/N, the analyzer floor, the AGC
 * detector, the antenna's G/T and Tsys readouts, the link-budget tab and the
 * weather evidence fact.
 *
 * The chain, referred to one plane (the LNA input, where the engine's carrier
 * powers are also referred: antenna gain minus feed loss):
 *
 *   T_sky  = T_mr (1 - a_gas) + (T_cmb + T_gal(f)) a_gas          (P.372 / P.618 §3)
 *   T_sky' = T_sky a_rain + T_mr (1 - a_rain)                      (rain noise rise)
 *   T_A    = T_sky' + T_spill + T_sun                               (at the aperture)
 *   T_in   = T_A / L + T_phys (1 - 1/L)                             (lossy feed, ice)
 *   T_sys  = T_in + T_rx                                            (LNB by Friis)
 *
 * with a = 10^(-A/10) the transmissivity of each absorbing layer and L the
 * feed (plus ice) loss as a power ratio. Pure functions only: the antenna owns
 * the inputs (attenuations, spillover, feed loss), the LNB owns T_rx.
 */

/** Reference temperature for noise figures, K */
export const T0_K = 290;

/** Cosmic microwave background, K */
export const T_CMB_K = 2.725;

/**
 * Mean radiating temperature of the absorbing atmosphere and of rain, K.
 * ITU-R P.618-13 §3 uses 275 K for the rain/cloud noise increase.
 */
export const T_MR_K = 275;

/** 10 log10(k) + 30: thermal noise density at 1 K, dBm/Hz */
export const BOLTZMANN_DBM_PER_K_HZ = 10 * Math.log10(1.380649e-23) + 30;

/** Transmissivity of a layer with attenuation `db` (power ratio, 0..1) */
const transmissivity = (db: number): number => 10 ** (-Math.max(0, db) / 10);

/**
 * Median galactic noise temperature (ITU-R P.372-16 §5, Fig. 2): Fa = 52 - 23 log f(MHz) dB
 * above kT0b. Dominates below ~300 MHz, is a few kelvin at L-band and
 * negligible at C-band and above.
 */
export function galacticNoiseK(frequencyHz: number): number {
  const fMHz = Math.max(1, frequencyHz / 1e6);
  const faDb = 52 - 23 * Math.log10(fMHz);

  return T0_K * 10 ** (faDb / 10);
}

/**
 * Clear-sky brightness temperature seen along a path with `gasAttenuationDb`
 * of gaseous absorption: the atmosphere's own emission plus the cosmic and
 * galactic background it attenuates.
 */
export function clearSkyNoiseK(frequencyHz: number, gasAttenuationDb: number): number {
  const a = transmissivity(gasAttenuationDb);

  return T_MR_K * (1 - a) + (T_CMB_K + galacticNoiseK(frequencyHz)) * a;
}

/** Sky temperature behind a rain layer of `rainAttenuationDb` (P.618 §3) */
export function skyWithRainK(clearSkyK: number, rainAttenuationDb: number): number {
  const a = transmissivity(rainAttenuationDb);

  return clearSkyK * a + T_MR_K * (1 - a);
}

/** Noise a lossy element at physical temperature `physicalK` adds at its output, K */
export function lossNoiseAtOutputK(lossDb: number, physicalK: number = T0_K): number {
  return physicalK * (1 - transmissivity(lossDb));
}

/** Receiver noise temperature from a noise figure, K */
export function noiseFigureToK(noiseFigureDb: number): number {
  return T0_K * (10 ** (noiseFigureDb / 10) - 1);
}

/** Noise figure from a noise temperature, dB */
export function noiseKToFigureDb(noiseK: number): number {
  return 10 * Math.log10(1 + Math.max(0, noiseK) / T0_K);
}

/** Thermal noise power k·T·B, dBm */
export function thermalNoiseDbm(temperatureK: number, bandwidthHz: number): number {
  return BOLTZMANN_DBM_PER_K_HZ + 10 * Math.log10(Math.max(temperatureK, 1e-3)) + 10 * Math.log10(Math.max(bandwidthHz, 1));
}

export interface SystemNoiseInputs {
  /** Receive frequency, Hz (sets galactic noise) */
  frequencyHz: number;
  /** Clear-sky gaseous attenuation along the path, dB */
  gasAttenuationDb: number;
  /** Rain attenuation along the path, dB (0 when dry) */
  rainAttenuationDb?: number;
  /** Ground pickup through spillover and sidelobes, K at the aperture */
  spilloverK: number;
  /** Solar noise at the aperture (sun transit), K */
  sunK?: number;
  /** Feed and waveguide loss ahead of the LNA, ice included, dB */
  feedLossDb: number;
  /** Physical temperature of the feed, K (default 290) */
  feedPhysicalK?: number;
  /** Receiver (LNB) noise temperature at its input, K */
  receiverK: number;
}

export interface SystemNoise {
  /** Sky brightness (gas, background, rain), K */
  skyK: number;
  /** Antenna temperature at the aperture (sky + spillover + sun), K */
  antennaK: number;
  /** Antenna temperature through the feed, referred to the LNA input, K */
  antennaAtLnaK: number;
  /** Receiver noise temperature, K */
  receiverK: number;
  /** System noise temperature at the LNA input, K */
  systemK: number;
}

/**
 * System noise temperature at the LNA input plane (see the file comment for
 * the chain). This is the T in every C/N = C / kTB the engine reports.
 */
export function systemNoiseTemperature(inputs: SystemNoiseInputs): SystemNoise {
  const clear = clearSkyNoiseK(inputs.frequencyHz, inputs.gasAttenuationDb);
  const skyK = skyWithRainK(clear, inputs.rainAttenuationDb ?? 0);
  const antennaK = skyK + Math.max(0, inputs.spilloverK) + Math.max(0, inputs.sunK ?? 0);
  const a = transmissivity(inputs.feedLossDb);
  const antennaAtLnaK = antennaK * a + lossNoiseAtOutputK(inputs.feedLossDb, inputs.feedPhysicalK ?? T0_K);
  const receiverK = Math.max(0, inputs.receiverK);

  return { skyK, antennaK, antennaAtLnaK, receiverK, systemK: antennaAtLnaK + receiverK };
}

/**
 * Noise temperature that raises `systemK` by `riseDb`: the sun-transit model
 * (authored peak and timing, see docs/known-deviations.md DEV-PROP-04) turns a
 * C/N degradation in dB into the solar antenna temperature that causes it.
 */
export function noiseRiseToK(systemK: number, riseDb: number): number {
  if (!(riseDb > 0)) {
    return 0;
  }

  return systemK * (10 ** (riseDb / 10) - 1);
}

/** C/N cost (dB) of raising the system temperature from `baseK` to `newK` */
export function noiseRiseDb(baseK: number, newK: number): number {
  return 10 * Math.log10(Math.max(newK, 1e-9) / Math.max(baseK, 1e-9));
}
