/**
 * Per-satellite beacon frequency for the generic GEO template.
 *
 * The traffic carriers are shared by every GEO member (operators reuse
 * frequencies). The beacon is the one carrier that tells satellites apart, so
 * its frequency comes from the NORAD number alone: a fixed 32-bit integer hash,
 * no randomness, the same answer on every machine and every TLE refresh.
 *
 * Band: the lower Ku beacon range, 11.2 to 11.7 GHz, on a 0.5 MHz grid (1001
 * cells). A hash cannot promise that two satellites within 3 degrees of each
 * other never land on the same cell; with the geo-belt-2026-11 payloads about
 * eight neighbour pairs do (see perf-results/P3-WP11b-summary.md). The upper
 * range (12.2 to 12.75 GHz) is left out because its IF (350 to 900 MHz with the
 * 13100 MHz LO) does not fit the survey analyzer window beside the traffic
 * carriers.
 */

/** Lowest beacon frequency, Hz */
export const GEO_BEACON_LO_HZ = 11_200e6;
/** Highest beacon frequency, Hz */
export const GEO_BEACON_HI_HZ = 11_700e6;
/** Beacon grid, Hz */
export const GEO_BEACON_STEP_HZ = 0.5e6;
/** Number of grid cells, both edges included */
export const GEO_BEACON_CELLS = Math.round((GEO_BEACON_HI_HZ - GEO_BEACON_LO_HZ) / GEO_BEACON_STEP_HZ) + 1;

/** Stable 32-bit integer hash (lowbias32 finalizer). */
export function hashNorad(noradId: number): number {
  let x = noradId >>> 0;

  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;

  return x >>> 0;
}

/** Beacon downlink frequency of a GEO member, Hz. */
export function geoBeaconHz(noradId: number): number {
  return GEO_BEACON_LO_HZ + (hashNorad(noradId) % GEO_BEACON_CELLS) * GEO_BEACON_STEP_HZ;
}

/** Signal id of a GEO member's beacon (the template's transponder id). */
export function geoBeaconSignalId(noradId: number): string {
  return `GEOB-${noradId}`;
}
