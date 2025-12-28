/**
 * Locale-aware number parsing.
 * Handles both '.' and ',' as decimal separators.
 *
 * @param value - String value to parse (e.g., "5943,5" or "5943.5")
 * @returns Parsed number, or NaN if invalid
 */
export function parseLocalizedNumber(value: string): number {
  // Normalize: replace comma with period for parsing
  const normalized = value.replace(',', '.');
  return parseFloat(normalized);
}
