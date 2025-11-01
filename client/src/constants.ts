import { FECType, Hertz, ModulationType, RfFrequency, Satellite, Team } from './types';

/**
 * Application Constants
 */


export const SATELLITES: Satellite[] = [
  { id: 1, name: 'ARKE 3G', offset: 400e6 },
  { id: 2, name: 'AURORA 2B', offset: 450e6 },
  { id: 3, name: 'AUXO STAR', offset: 420e6 },
  { id: 4, name: 'ENYO', offset: 300e6 },
  { id: 5, name: 'HASHCOMM 7', offset: 365e6 },
  { id: 6, name: 'HUF UHF FO', offset: 210e6 },
  { id: 7, name: 'MERCURY PAWN', offset: 150e6 },
  { id: 8, name: 'NYXSAT', offset: 250e6 },
  { id: 9, name: 'RASCAL', offset: 120e6 },
  { id: 10, name: 'WILL 1-AM', offset: 345e6 },
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

export const defaultSignalData = [
  {
    id: 1,
    serverId: 1,
    targetId: 1,
    frequency: 4810e6 as RfFrequency,
    power: -110,
    bandwidth: 10e6 as Hertz,
    modulation: '8QAM' as ModulationType,
    fec: '3/4' as FECType,
    feed: 'red-1.mp4',
    isActive: true,
  },
  {
    id: 2,
    serverId: 1,
    targetId: 1,
    frequency: 4798e6 as RfFrequency,
    power: -96,
    bandwidth: 10e6 as Hertz,
    modulation: '8QAM' as ModulationType,
    fec: '3/4' as FECType,
    feed: 'blue-1.mp4',
    isActive: true,
  },
  {
    id: 3,
    serverId: 1,
    targetId: 1,
    frequency: 4817e6 as RfFrequency,
    power: -93,
    bandwidth: 2e6 as Hertz,
    modulation: '8QAM' as ModulationType,
    fec: '3/4' as FECType,
    feed: 'blue-1.mp4',
    isActive: true,
  },
  {
    id: 4,
    serverId: 1,
    targetId: 1,
    frequency: 4826e6 as RfFrequency,
    power: -86,
    bandwidth: 1e6 as Hertz,
    modulation: '8QAM' as ModulationType,
    fec: '3/4' as FECType,
    feed: 'blue-1.mp4',
    isActive: true,
  },
  {
    id: 5,
    serverId: 1,
    targetId: 1,
    frequency: 4785e6 as RfFrequency,
    power: -90,
    bandwidth: 4e6 as Hertz,
    modulation: '8QAM' as ModulationType,
    fec: '3/4' as FECType,
    feed: 'blue-1.mp4',
    isActive: true,
  },
  {
    id: 6,
    serverId: 1,
    targetId: 1,
    frequency: 4833e6 as RfFrequency,
    power: -110,
    bandwidth: 10e6 as Hertz,
    modulation: 'BPSK' as ModulationType,
    fec: '1/4' as FECType,
    feed: 'blue-1.mp4',
    isActive: true,
  },
];
