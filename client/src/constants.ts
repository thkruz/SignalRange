import { Satellite, Team } from './types';

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

export enum FrequencyBand {
  C = 0,
  Ku = 1
}

export const bandInformation = {
  c: { name: 'C Band', upconvert: 3350e6, downconvert: 3500e6 },
  ku: { name: 'Ku Band', upconvert: 12750e6, downconvert: 10950e6 }
}
