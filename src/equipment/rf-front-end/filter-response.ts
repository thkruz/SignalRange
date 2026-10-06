/**
 * Filter responses applied to carriers by overlap integral (Phase 19.6).
 *
 * A carrier's spectrum is a raised cosine (roll-off 0.2, the same shape the
 * analyzer draws and the modem's symbol rate assumes) of occupied bandwidth B.
 * The power a filter passes is ∫ S(f)·|H(f)|² df / ∫ S(f) df, so a notch that
 * removes an 8 MHz slice of a 36 MHz carrier costs the energy in that slice
 * (about 1 dB), not depth × overlap.
 *
 * |H|² for a Butterworth bandpass of order n, centre f₀ and -3 dB bandwidth W:
 * 1 / (1 + ((f - f₀) / (W/2))^(2n)) (the lowpass prototype mapped to the band,
 * a good approximation for W ≪ f₀). A notch of depth D dB is the complement of
 * the same shape: |H|² = 1 - (1 - 10^(-D/10)) · bandpass(f).
 */

/** Carrier spectral roll-off (DVB-S2 0.2; the analyzer and the modem use the same) */
export const CARRIER_ROLL_OFF = 0.2;
/** Points across a carrier for the overlap integral */
const INTEGRATION_POINTS = 96;

/** Butterworth bandpass power response at frequency f. */
export function butterworthBandpassPower(f: number, centreHz: number, bandwidthHz: number, order: number): number {
  if (!(bandwidthHz > 0)) {
    return 0;
  }
  const x = (f - centreHz) / (bandwidthHz / 2);

  return 1 / (1 + Math.abs(x) ** (2 * order));
}

/** Raised-cosine power spectral density (unnormalised) of a carrier of occupied bandwidth B at offset d from its centre. */
export function raisedCosinePsd(d: number, occupiedBandwidthHz: number, rollOff = CARRIER_ROLL_OFF): number {
  const rs = occupiedBandwidthHz / (1 + rollOff);
  const ad = Math.abs(d);
  const inner = ((1 - rollOff) * rs) / 2;
  const outer = ((1 + rollOff) * rs) / 2;
  if (ad <= inner) {
    return 1;
  }
  if (ad >= outer || rollOff === 0) {
    return 0;
  }

  return 0.5 * (1 + Math.cos((Math.PI / (rollOff * rs)) * (ad - inner)));
}

/**
 * Fraction of a carrier's power that passes a power response `h(f)`. A
 * carrier with no bandwidth (CW) is evaluated at its centre.
 */
export function carrierTransmission(centreHz: number, occupiedBandwidthHz: number, h: (f: number) => number): number {
  if (!(occupiedBandwidthHz > 0)) {
    return h(centreHz);
  }
  const half = occupiedBandwidthHz / 2;
  let num = 0;
  let den = 0;
  for (let i = 0; i < INTEGRATION_POINTS; i++) {
    const d = -half + ((i + 0.5) / INTEGRATION_POINTS) * occupiedBandwidthHz;
    const s = raisedCosinePsd(d, occupiedBandwidthHz);
    num += s * h(centreHz + d);
    den += s;
  }

  return den > 0 ? num / den : 0;
}

/** Notch power response at f: depth D dB across a Butterworth band of the given order. */
export function notchPower(f: number, centreHz: number, bandwidthHz: number, depthDb: number, order: number): number {
  const floor = 10 ** (-Math.max(0, depthDb) / 10);

  return 1 - (1 - floor) * butterworthBandpassPower(f, centreHz, bandwidthHz, order);
}

/** Loss in dB for a transmission fraction (0 → +Infinity). */
export function transmissionLossDb(t: number): number {
  return t > 0 ? -10 * Math.log10(t) : Number.POSITIVE_INFINITY;
}
