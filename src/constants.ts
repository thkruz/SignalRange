import { Hertz, Satellite, Team } from './types';

/**
 * Application Constants
 */


export const SATELLITES: Satellite[] = [
  { noradId: 28912, name: 'METEOSAT-9 (MSG-2)', offset: 400e6 },
  { noradId: 1, name: 'ARKE 3G', offset: 400e6 },
  { noradId: 2, name: 'AURORA 2B', offset: 450e6 },
  { noradId: 3, name: 'AUXO STAR', offset: 420e6 },
  { noradId: 4, name: 'ENYO', offset: 300e6 },
  { noradId: 5, name: 'HASHCOMM 7', offset: 365e6 },
  { noradId: 6, name: 'HUF UHF FO', offset: 210e6 },
  { noradId: 7, name: 'MERCURY PAWN', offset: 150e6 },
  { noradId: 8, name: 'NYXSAT', offset: 250e6 },
  { noradId: 9, name: 'RASCAL', offset: 120e6 },
  { noradId: 10, name: 'WILL 1-AM', offset: 345e6 },
];

export const TEAMS: Team[] = [
  { id: 1, name: 'Persephone' },
  { id: 2, name: 'Sisyphus' },
  { id: 3, name: 'Tartarus' },
  { id: 4, name: 'Zagreus' },
];

export const POWER_BUDGET = 23886; // Watts
export const DELAY_TO_ACQ_LOCK = 5000; // ms
export const ERROR_POPUP_TIMEOUT = 3000; // ms

export const DEFAULT_SPEC_A = {
  minDecibels: -120,
  maxDecibels: -80,
  minFreq: 4650000000, // Hz
  maxFreq: 4750000000, // Hz
  refreshRate: 10, // per second
  noiseFloor: -115,
};

export const FrequencyBand = {
  vhf: {
    // Weather-satellite APT (137-138 MHz) and 2m amateur (144-146 MHz)
    downLow: 137e6 as Hertz,
    downHigh: 146e6 as Hertz,
    upLow: 144e6 as Hertz,
    upHigh: 146e6 as Hertz,
    transponderBandwidthHz: [15e3 as Hertz, 50e3 as Hertz], // APT / narrowband FM
  },
  uhf: {
    // 70cm amateur satellite band
    downLow: 435e6 as Hertz,
    downHigh: 438e6 as Hertz,
    upLow: 435e6 as Hertz,
    upHigh: 438e6 as Hertz,
    transponderBandwidthHz: [15e3 as Hertz, 30e3 as Hertz], // FM transponders
  },
  l: {
    // Inmarsat, Iridium, narrowband
    downLow: 1525e6 as Hertz,
    downHigh: 1559e6 as Hertz,
    upLow: 1626.5e6 as Hertz,
    upHigh: 1660.5e6 as Hertz,
    transponderBandwidthHz: [25e3 as Hertz, 200e3 as Hertz], // Typical narrowband transponder bandwidths
  },
  s: {
    // TT&C, weather satellites, some mobile services
    downLow: 2200e6 as Hertz,
    downHigh: 2290e6 as Hertz,
    upLow: 2025e6 as Hertz,
    upHigh: 2120e6 as Hertz,
    transponderBandwidthHz: [1e6 as Hertz, 5e6 as Hertz], // Typical S-band transponder bandwidths
  },
  c: {
    // Classic GEO FSS band (very rain-resistant)
    downLow: 3400e6 as Hertz,
    downHigh: 4200e6 as Hertz,
    upLow: 5850e6 as Hertz,
    upHigh: 6725e6 as Hertz,
    transponderBandwidthHz: [36e6 as Hertz, 72e6 as Hertz], // Typical C-band transponder bandwidths
  },
  x: {
    // Military, some scientific satellites
    downLow: 7250e6 as Hertz,
    downHigh: 7750e6 as Hertz,
    upLow: 7900e6 as Hertz,
    upHigh: 8400e6 as Hertz,
    transponderBandwidthHz: [10e6 as Hertz, 50e6 as Hertz], // Typical X-band transponder bandwidths
    isRestricted: true, // Restricted access in many countries
  },
  ku: {
    // Common for direct-to-home TV broadcasting
    downLow: 10700e6 as Hertz,
    downHigh: 12750e6 as Hertz,
    upLow: 13750e6 as Hertz,
    upHigh: 14500e6 as Hertz,
    transponderBandwidthHz: [36e6 as Hertz, 72e6 as Hertz], // Typical Ku-band transponder bandwidths
  },
  ka: {
    // High-throughput satellites, broadband internet
    downLow: 17700e6 as Hertz,
    downHigh: 21200e6 as Hertz,
    upLow: 27500e6 as Hertz,
    upHigh: 31000e6 as Hertz,
    transponderBandwidthHz: [125e6 as Hertz, 500e6 as Hertz], // Typical Ka-band transponder bandwidths
  },
  qv: {
    // Experimental, military applications
    downLow: 37e9 as Hertz,
    downHigh: 42e9 as Hertz,
    upLow: 47e9 as Hertz,
    upHigh: 51e9 as Hertz,
    transponderBandwidthHz: [250e6 as Hertz, 1000e6 as Hertz], // Typical Q/V-band transponder bandwidths
  }
}
