/**
 * Hardware anchors for the phase 19.1 reference cases (plan Q6).
 *
 * Every number here is copied from a public datasheet, with the source beside
 * it. The engine's own constants are not a reference; these are what "accurate"
 * is measured against. Ted confirms or substitutes (plan §2 Q6).
 */

export interface DishAnchor {
  source: string;
  diameterM: number;
  /** Receive midband frequency the gain and temperatures are quoted at, Hz */
  rxFrequencyHz: number;
  /** Receive gain at the feed flange, dBi */
  rxGainDbi: number;
  /** -3 dB beamwidth at the receive midband, degrees */
  hpbwDeg: number;
  /** Antenna noise temperature by elevation (deg -> K), clear sky */
  antennaNoiseK: Record<number, number>;
  /** Published G/T, dB/K, with the LNA temperature it assumes */
  gOverT?: { dbPerK: number; lnaK: number; elevationDeg: number };
}

/**
 * CPI 9.0 m Cassegrain (datasheet "9.0 Meter Cassegrain Antennas 655-0025C 10-2023",
 * https://www.cpii.com/docs/datasheets/498/9.0%20Meter%20Cassegrain%20Antenna%2010-2023.pdf).
 * Extended C-band linear feed: receive 3.4-4.2 GHz, values at 4 GHz.
 */
export const CPI_9M_C_LINEAR: DishAnchor = {
  source: 'CPI 9.0 m Cassegrain, 655-0025C 10-2023, Ext. C-band 4-port linear',
  diameterM: 9.0,
  rxFrequencyHz: 4.0e9,
  rxGainDbi: 50.0,
  hpbwDeg: 0.53,
  antennaNoiseK: { 5: 55, 10: 46, 20: 40, 40: 38 },
  gOverT: { dbPerK: 31.5, lnaK: 30, elevationDeg: 20 },
};

/** Same datasheet, Ku-band linear feed: receive 10.7-12.75 GHz, G/T at 11.2 GHz. */
export const CPI_9M_KU_LINEAR: DishAnchor = {
  source: 'CPI 9.0 m Cassegrain, 655-0025C 10-2023, Ku-band 4-port linear',
  diameterM: 9.0,
  rxFrequencyHz: 11.2e9,
  rxGainDbi: 58.1,
  hpbwDeg: 0.2,
  antennaNoiseK: { 5: 94, 10: 81, 20: 72, 40: 69 },
  gOverT: { dbPerK: 36.7, lnaK: 70, elevationDeg: 20 },
};

/**
 * General Dynamics SATCOM / Prodelin Series 1244 2.4 m Ku (datasheet 1000-057 Rev. 04/12,
 * https://satellitedish.com/1244-prodelin.pdf). Receive 10.70-12.75 GHz; gain is midband
 * (+/- 0.2 dB). No G/T is published: it depends on the LNB fitted.
 */
export const PRODELIN_1244_KU: DishAnchor = {
  source: 'Prodelin Series 1244 2.4 m, 1000-057 Rev. 04/12, Ku-band',
  diameterM: 2.4,
  rxFrequencyHz: 11.725e9,
  rxGainDbi: 47.4,
  hpbwDeg: 0.7,
  antennaNoiseK: { 5: 56, 10: 51, 20: 48, 40: 41 },
};

/**
 * The same datasheet prints the co-polar sidelobe envelope it meets, which is
 * ITU-R S.580-6 / FCC 25.209: 29 - 25 log(theta) dBi from 100 lambda/D to 20 deg,
 * -3.5 dBi to 26.3 deg, 32 - 25 log(theta) to 48 deg, -10 dBi (averaged) beyond.
 */
export const S580_ENVELOPE_POINTS: Array<{ thetaDeg: number; maxDbi: number }> = [
  { thetaDeg: 2, maxDbi: 29 - 25 * Math.log10(2) },
  { thetaDeg: 10, maxDbi: 29 - 25 * Math.log10(10) },
  { thetaDeg: 30, maxDbi: 32 - 25 * Math.log10(30) },
  { thetaDeg: 60, maxDbi: -10 },
];

/**
 * LEO tracker servo. No public 4 m Ku datasheet was found (2026-09-27). The one
 * cited fact: an el-over-az pedestal limited to 4 deg/s azimuth cannot hold a
 * 780 km sun-synchronous pass above ~82 deg maximum elevation (Microwave Journal,
 * "Selecting a Pedestal for Tracking LEO Satellites at Ka Band", article 2937).
 * Ted to confirm or substitute a datasheet (plan Q6).
 */
export const LEO_TRACKER_SERVO = {
  source: 'Microwave Journal art. 2937 (azimuth-rate limit); datasheet pending Ted',
  azimuthLimitDegPerS: 4,
  orbitAltitudeKm: 780,
  maxTrackableElevationDeg: 82,
};
