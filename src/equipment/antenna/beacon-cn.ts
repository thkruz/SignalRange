/**
 * Lowest beacon C/N (dB, in the tracking bandwidth) the beacon receiver
 * reports. Below this there is no usable beacon: a real tracking receiver
 * reads "no signal", not a number hundreds of dB under the noise floor
 * (an unpowered LNB passes carriers at -300 dB gain, which used to read
 * as a beacon C/N near -267 dB on the ACU and Dashboard).
 */
export const BEACON_CN_FLOOR_DB = -20;

/**
 * The beacon C/N to report, or null when there is no usable beacon signal.
 * @param cn raw measured C/N in dB, or null when nothing is in the search window
 * @param isLnbPowered an unpowered LNB delivers no beacon at all
 */
export function usableBeaconCn(cn: number | null, isLnbPowered: boolean): number | null {
  if (!isLnbPowered || cn === null || !Number.isFinite(cn) || cn < BEACON_CN_FLOOR_DB) {
    return null;
  }
  return cn;
}
