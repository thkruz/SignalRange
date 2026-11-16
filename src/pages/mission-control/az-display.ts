/**
 * @file Azimuth display helper (Phase 35, s05-F3 / s08-F5)
 * @description The antenna model can hold azimuth below 0 or above 360 while
 * it unwinds a cable wrap; the boards show the compass bearing, 0 to 360.
 */

/** Wrap an azimuth to the compass range [0, 360) for display only. */
export function wrapAzimuthDeg(azimuth: number): number {
  return ((azimuth % 360) + 360) % 360;
}
