/**
 * Number formatting utilities to avoid floating point display artifacts.
 */

/**
 * Convert Hz to MHz string, removing floating point artifacts.
 *
 * JavaScript floating point arithmetic can produce results like:
 * 1400500000 / 1e6 = 1400.5000000000002
 *
 * This function uses toPrecision to limit significant digits,
 * then parseFloat to remove trailing zeros.
 *
 * @param frequencyHz - Frequency in Hz
 * @returns Formatted string in MHz without floating point noise
 */
export function formatFrequencyMHz(frequencyHz: number): string {
  const mhz = frequencyHz / 1e6;
  // Use toPrecision with 12 significant digits (covers MHz with sub-Hz precision)
  // then parseFloat to remove trailing zeros
  return String(parseFloat(mhz.toPrecision(12)));
}

/**
 * Convert Hz to MHz string for bandwidth values.
 * Same as formatFrequencyMHz but semantically named for bandwidth.
 *
 * @param bandwidthHz - Bandwidth in Hz
 * @returns Formatted string in MHz without floating point noise
 */
export function formatBandwidthMHz(bandwidthHz: number): string {
  return formatFrequencyMHz(bandwidthHz);
}
