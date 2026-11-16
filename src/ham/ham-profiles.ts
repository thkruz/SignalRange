/**
 * @file ham-profiles - Generic C3 equipment capability profiles (Phase 42 roster)
 * @description One profile per equipment family in the beginner roster. Profiles
 * are informed by real beginner gear (named in `referenceFamily`) but are not
 * menu or specification replicas. Current/power figures are authored training
 * fixtures from the phase-42 plans, not manufacturer specifications.
 *
 * Boundaries the tests pin: the SDR has no transmitter; only the loaner DMR
 * handheld does DMR; the analog handheld runs from its own pack, never a 13.8 V
 * mobile supply; the HF rig is the only HF transmitter.
 */

import type { HamCapabilityProfile, PortDef } from './ham-types';

const rf = (id: string, label: string, family: PortDef['family'], gender: PortDef['gender']): PortDef => ({ id, label, family, gender, role: 'rf' });

export const SDR_PROFILE: HamCapabilityProfile = {
  id: 'usb-sdr',
  label: 'USB SDR receiver',
  referenceFamily: 'RTL-SDR Blog / Nooelec NESDR class',
  kind: 'sdr',
  rxRangesMHz: [
    [0.5, 28.8],
    [24, 1766],
  ],
  rxModes: ['FM', 'AM', 'USB', 'LSB', 'CW', 'PKT', 'FT8'],
  txRangesMHz: [],
  txModes: [],
  txPowerStepsW: [],
  duplex: 'none',
  ports: [rf('ant', 'Antenna input', 'SMA', 'jack'), { id: 'usb', label: 'USB plug', family: 'USB-A', gender: 'plug', role: 'usb-device' }],
  power: { source: 'usb-bus', nominalV: 5, rxW: 1.5 },
  features: { waterfall: true, directSampling: true },
};

export const HANDHELD_PROFILE: HamCapabilityProfile = {
  id: 'dual-band-ht',
  label: 'Dual-band FM handheld',
  referenceFamily: 'Yaesu FT-65R class (Baofeng UV-5R-style budget reference)',
  kind: 'handheld',
  rxRangesMHz: [
    [136, 174],
    [400, 480],
  ],
  rxModes: ['FM'],
  txRangesMHz: [
    [144, 148],
    [420, 450],
  ],
  txModes: ['FM'],
  txPowerStepsW: [0.5, 2.5, 5],
  duplex: 'half',
  ports: [
    rf('ant', 'Antenna jack', 'SMA', 'jack'),
    { id: 'batt', label: 'Battery contacts', family: 'BATTERY-CONTACTS', gender: 'jack', role: 'dc-in' },
    { id: 'spk', label: 'Speaker/mic jack', family: 'TRS-3.5', gender: 'jack', role: 'audio' },
  ],
  power: { source: 'internal-battery', nominalV: 7.4, minOperatingV: 6.4, maxInputV: 8.4, packWh: 14.8, rxW: 0.6, txW: 9 },
  features: { ctcss: true, dcs: true, memories: 200, scan: true, keyLock: true },
};

export const MOBILE_PROFILE: HamCapabilityProfile = {
  id: 'dual-band-mobile',
  label: 'Dual-band FM mobile/base radio',
  referenceFamily: 'Icom IC-2730A / Yaesu FTM-6000R class',
  kind: 'mobile',
  rxRangesMHz: [
    [136, 174],
    [400, 480],
  ],
  rxModes: ['FM', 'PKT'],
  txRangesMHz: [
    [144, 148],
    [430, 450],
  ],
  txModes: ['FM', 'PKT'],
  txPowerStepsW: [5, 15, 50],
  duplex: 'half',
  ports: [
    rf('ant', 'Antenna jack (SO-239)', 'UHF', 'jack'),
    { id: 'dc', label: 'DC input (Powerpole)', family: 'POWERPOLE', gender: 'genderless', role: 'dc-in' },
    { id: 'data', label: 'Data port', family: 'MINI-DIN-6', gender: 'jack', role: 'data' },
  ],
  // S7 fixture: 1 A receive, 8 A transmit at 13.8 V nominal, brownout below 11.5 V
  power: { source: 'external-dc', nominalV: 13.8, minOperatingV: 11.5, maxInputV: 15.9, rxCurrentA: 1, txCurrentA: 8 },
  features: { ctcss: true, dcs: true, memories: 500, scan: true, keyLock: true, dataPort: true },
};

export const DMR_HANDHELD_PROFILE: HamCapabilityProfile = {
  id: 'loaner-dmr-ht',
  label: 'Club loaner DMR handheld',
  referenceFamily: 'AnyTone AT-D878UVII Plus class',
  kind: 'dmr-handheld',
  rxRangesMHz: [
    [136, 174],
    [400, 480],
  ],
  rxModes: ['FM', 'DMR'],
  txRangesMHz: [
    [144, 148],
    [420, 450],
  ],
  txModes: ['FM', 'DMR'],
  txPowerStepsW: [1, 2.5, 5],
  duplex: 'half',
  ports: [rf('ant', 'Antenna jack', 'SMA', 'jack'), { id: 'batt', label: 'Battery contacts', family: 'BATTERY-CONTACTS', gender: 'jack', role: 'dc-in' }],
  power: { source: 'internal-battery', nominalV: 7.4, minOperatingV: 6.4, packWh: 22.9, rxW: 0.7, txW: 10 },
  features: { dmr: true, ctcss: true, memories: 4000 },
};

export const HF_RIG_PROFILE: HamCapabilityProfile = {
  id: 'loaner-hf',
  label: 'Club loaner HF transceiver',
  referenceFamily: 'Xiegu G90 class',
  kind: 'hf-rig',
  rxRangesMHz: [[0.5, 30]],
  rxModes: ['USB', 'LSB', 'CW', 'AM', 'FT8'],
  txRangesMHz: [
    [1.8, 2.0],
    [3.5, 4.0],
    [7.0, 7.3],
    [10.1, 10.15],
    [14.0, 14.35],
    [18.068, 18.168],
    [21.0, 21.45],
    [24.89, 24.99],
    [28.0, 29.7],
  ],
  txModes: ['USB', 'LSB', 'CW', 'AM', 'FT8'],
  txPowerStepsW: [1, 5, 10, 20],
  duplex: 'half',
  ports: [rf('ant', 'Antenna jack (BNC)', 'BNC', 'jack'), { id: 'dc', label: 'DC input', family: 'POWERPOLE', gender: 'genderless', role: 'dc-in' }],
  power: { source: 'external-dc', nominalV: 13.8, minOperatingV: 10.5, rxCurrentA: 0.5, txCurrentA: 4 },
  features: { rit: true },
};

export const HAM_PROFILES: Readonly<Record<string, HamCapabilityProfile>> = {
  [SDR_PROFILE.id]: SDR_PROFILE,
  [HANDHELD_PROFILE.id]: HANDHELD_PROFILE,
  [MOBILE_PROFILE.id]: MOBILE_PROFILE,
  [DMR_HANDHELD_PROFILE.id]: DMR_HANDHELD_PROFILE,
  [HF_RIG_PROFILE.id]: HF_RIG_PROFILE,
};

export function inRanges(freqMHz: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([lo, hi]) => freqMHz >= lo && freqMHz <= hi);
}

/** Can the hardware receive this frequency/mode? */
export function canReceive(profile: HamCapabilityProfile, freqMHz: number, mode: HamProfileMode): boolean {
  return inRanges(freqMHz, profile.rxRangesMHz) && profile.rxModes.includes(mode);
}

/** Can the hardware key up on this frequency/mode? (says nothing about the license) */
export function canTransmitHardware(profile: HamCapabilityProfile, freqMHz: number, mode: HamProfileMode): 'ok' | 'receive-only' | 'hardware-band' | 'hardware-mode' {
  if (profile.txRangesMHz.length === 0) {
    return 'receive-only';
  }
  if (!profile.txModes.includes(mode)) {
    return 'hardware-mode';
  }

  return inRanges(freqMHz, profile.txRangesMHz) ? 'ok' : 'hardware-band';
}

type HamProfileMode = HamCapabilityProfile['rxModes'][number];
