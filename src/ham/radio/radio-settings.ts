/**
 * @file radio-settings - Operator-adjustable radio settings logic
 * @description Defaults per profile, repeater offsets, CTCSS tones, memories,
 * key lock and DMR codeplug selection. Pure and immutable: every mutator
 * returns a new RadioSettings (or a refusal) and never touches the input.
 */

import { canReceive } from '../ham-profiles';
import { type HamCapabilityProfile, type HamMode, type MemoryChannel, type RadioSettings } from '../ham-types';

/** Standard EIA CTCSS tone list, Hz */
export const CTCSS_TONES_HZ: readonly number[] = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4, 100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2, 151.4, 156.7, 162.2,
  167.9, 173.8, 179.9, 186.2, 192.8, 203.5, 210.7, 218.1, 225.7, 233.6, 241.8, 250.3, 254.1,
];

export function isValidCtcssHz(toneHz: number | null): boolean {
  return toneHz === null || CTCSS_TONES_HZ.includes(toneHz);
}

/** Typical demodulator filter width for a mode, Hz */
export function defaultFilterHz(mode: HamMode): number {
  switch (mode) {
    case 'USB':
    case 'LSB':
    case 'FT8':
      return 2700;
    case 'CW':
      return 500;
    case 'AM':
      return 8000;
    case 'DMR':
      return 12500;
    default:
      return 15000;
  }
}

export function defaultRadioSettings(profile: HamCapabilityProfile): RadioSettings {
  const hf = profile.kind === 'hf-rig';
  const mode: HamMode = hf ? 'USB' : 'FM';
  const steps = profile.txPowerStepsW;

  return {
    vfoMHz: hf ? 28.4 : 146.52,
    mode,
    filterHz: defaultFilterHz(mode),
    spanHz: profile.kind === 'sdr' ? 1_000_000 : 0,
    squelch: profile.kind === 'sdr' ? 0 : 3,
    volume: 5,
    rfGainDb: profile.kind === 'sdr' ? 30 : 0,
    txPowerW: steps.length > 0 ? steps[0] : 0,
    offset: 'simplex',
    offsetKHz: 600,
    txToneHz: null,
    rxToneHz: null,
    memories: [],
    activeMemory: null,
    monitor: false,
    keyLock: false,
    ritHz: 0,
    ritOn: false,
    micGain: 5,
    codeplug: [],
    activeDmrChannel: null,
    ppm: 0,
  };
}

/** The settings the radio actually operates on: the active memory channel overlays the VFO fields */
export function effectiveSettings(s: RadioSettings): RadioSettings {
  if (s.activeMemory !== null) {
    const m = s.memories.find((c) => c.slot === s.activeMemory);
    if (m) {
      return { ...s, vfoMHz: m.rxMHz, offset: m.offset, offsetKHz: m.offsetKHz, txToneHz: m.txToneHz, rxToneHz: m.rxToneHz, mode: m.mode };
    }
  }

  return s;
}

/** Receive frequency the radio is tuned to (excluding RIT), MHz */
export function rxFrequencyMHz(settings: RadioSettings): number {
  const e = effectiveSettings(settings);
  if (e.mode === 'DMR' && e.activeDmrChannel !== null && e.codeplug[e.activeDmrChannel]) {
    return e.codeplug[e.activeDmrChannel].rxMHz;
  }

  return e.vfoMHz;
}

/** Transmit frequency, MHz: offset applied, RIT never moves it */
export function txFrequencyMHz(settings: RadioSettings): number {
  const e = effectiveSettings(settings);
  if (e.mode === 'DMR' && e.activeDmrChannel !== null && e.codeplug[e.activeDmrChannel]) {
    return e.codeplug[e.activeDmrChannel].txMHz;
  }
  const delta = e.offsetKHz / 1000;
  if (e.offset === 'plus') {
    return round6(e.vfoMHz + delta);
  }
  if (e.offset === 'minus') {
    return round6(e.vfoMHz - delta);
  }

  return e.vfoMHz;
}

/** Frequency the receiver listens on including RIT (when on), Hz */
export function rxTunedHz(settings: RadioSettings): number {
  return Math.round(rxFrequencyMHz(settings) * 1e6) + (settings.ritOn ? settings.ritHz : 0);
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

export interface SettingsResult {
  ok: boolean;
  settings: RadioSettings;
  refusal?: string;
}

const LOCKED_TEXT = 'The keys are locked. Unlock the keypad before changing anything.';

function refuse(settings: RadioSettings, refusal: string): SettingsResult {
  return { ok: false, settings, refusal };
}

/** Apply a patch of operator changes with key lock and validation */
export function applySetting(profile: HamCapabilityProfile, settings: RadioSettings, patch: Partial<RadioSettings>): SettingsResult {
  const keys = Object.keys(patch);
  const onlyLock = keys.length === 1 && keys[0] === 'keyLock';
  if (settings.keyLock && !onlyLock) {
    return refuse(settings, LOCKED_TEXT);
  }
  if (onlyLock && !profile.features.keyLock) {
    return refuse(settings, 'This radio has no key lock.');
  }
  if (patch.txToneHz !== undefined && !isValidCtcssHz(patch.txToneHz)) {
    return refuse(settings, `${patch.txToneHz} Hz is not a standard CTCSS tone.`);
  }
  if (patch.rxToneHz !== undefined && !isValidCtcssHz(patch.rxToneHz)) {
    return refuse(settings, `${patch.rxToneHz} Hz is not a standard CTCSS tone.`);
  }
  if ((patch.txToneHz || patch.rxToneHz) && !profile.features.ctcss) {
    return refuse(settings, 'This radio does not support CTCSS tones.');
  }
  const next = { ...settings, ...patch };
  if (patch.mode !== undefined && !profile.rxModes.includes(patch.mode)) {
    return refuse(settings, `This radio cannot use ${patch.mode} mode.`);
  }
  if (patch.vfoMHz !== undefined && !canReceive(profile, patch.vfoMHz, next.mode)) {
    return refuse(settings, `This radio cannot tune ${patch.vfoMHz} MHz in ${next.mode} mode.`);
  }
  // Tuning by hand leaves memory mode, as on real radios
  if (patch.vfoMHz !== undefined && patch.activeMemory === undefined) {
    next.activeMemory = null;
  }

  return { ok: true, settings: next };
}

/** Store the current VFO state into a memory slot (replaces any channel in that slot) */
export function storeMemory(settings: RadioSettings, slot: number, name: string, profile?: HamCapabilityProfile): SettingsResult {
  if (settings.keyLock) {
    return refuse(settings, LOCKED_TEXT);
  }
  const max = profile?.features.memories;
  if (!Number.isInteger(slot) || slot < 0 || (max !== undefined && slot >= max)) {
    return refuse(settings, `Memory slot ${slot} does not exist on this radio.`);
  }
  const e = effectiveSettings(settings);
  const channel: MemoryChannel = { slot, name, rxMHz: e.vfoMHz, offset: e.offset, offsetKHz: e.offsetKHz, txToneHz: e.txToneHz, rxToneHz: e.rxToneHz, mode: e.mode };
  const memories = [...settings.memories.filter((m) => m.slot !== slot), channel].sort((a, b) => a.slot - b.slot);

  return { ok: true, settings: { ...settings, memories } };
}

/** Recall a memory: restores frequency, offset, tones and mode into the VFO fields and enters memory mode */
export function recallMemory(settings: RadioSettings, slot: number): SettingsResult {
  if (settings.keyLock) {
    return refuse(settings, LOCKED_TEXT);
  }
  const m = settings.memories.find((c) => c.slot === slot);
  if (!m) {
    return refuse(settings, `Memory ${slot} is empty.`);
  }

  return {
    ok: true,
    settings: {
      ...settings,
      vfoMHz: m.rxMHz,
      offset: m.offset,
      offsetKHz: m.offsetKHz,
      txToneHz: m.txToneHz,
      rxToneHz: m.rxToneHz,
      mode: m.mode,
      filterHz: defaultFilterHz(m.mode),
      activeMemory: slot,
    },
  };
}

/** Back to VFO mode (VFO fields keep whatever the last recall wrote) */
export function returnToVfo(settings: RadioSettings): RadioSettings {
  return { ...settings, activeMemory: null };
}

/** Select a DMR codeplug channel: tunes RX, switches to DMR mode */
export function selectDmrChannel(profile: HamCapabilityProfile, settings: RadioSettings, index: number): SettingsResult {
  if (settings.keyLock) {
    return refuse(settings, LOCKED_TEXT);
  }
  if (!profile.features.dmr) {
    return refuse(settings, 'This radio has no DMR.');
  }
  const ch = settings.codeplug[index];
  if (!ch) {
    return refuse(settings, `Channel ${index + 1} is not in the codeplug.`);
  }

  return { ok: true, settings: { ...settings, mode: 'DMR', filterHz: defaultFilterHz('DMR'), vfoMHz: ch.rxMHz, activeDmrChannel: index, activeMemory: null } };
}
