/**
 * @file rf-geometry - Shared pure RF geometry helpers
 * @description Free-space path loss and great-circle ground path, shared by the
 * antenna model and the ham terrestrial link model.
 */

/** Free-space path loss, dB: 32.45 + 20log10(d_km) + 20log10(f_MHz) */
export function freeSpacePathLossDb(frequencyHz: number, distanceKm: number): number {
  const frequencyMhz = frequencyHz / 1e6;
  return 32.45 + 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMhz);
}

/** Great-circle initial bearing (deg true) and distance (km) between two WGS-84 points */
export function groundPath(lat1Deg: number, lon1Deg: number, lat2Deg: number, lon2Deg: number): { bearingDeg: number; distanceKm: number } {
  const d2r = Math.PI / 180;
  const lat1 = lat1Deg * d2r;
  const lat2 = lat2Deg * d2r;
  const dLon = (lon2Deg - lon1Deg) * d2r;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const bearingDeg = (Math.atan2(y, x) / d2r + 360) % 360;

  const dLat = (lat2Deg - lat1Deg) * d2r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const distanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return { bearingDeg, distanceKm };
}
