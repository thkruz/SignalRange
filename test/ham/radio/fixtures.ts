import { HANDHELD_PROFILE, HF_RIG_PROFILE, MOBILE_PROFILE, SDR_PROFILE } from '@app/ham/ham-profiles';
import type { HamCapabilityProfile, LocalPosition, OnAirEmission, RadioSettings } from '@app/ham/ham-types';
import { defaultRadioSettings } from '@app/ham/radio/radio-settings';
import type { ReceiverView } from '@app/ham/radio/reception-model';
import type { TxAntennaPath } from '@app/ham/radio/transmit';

export { HANDHELD_PROFILE, HF_RIG_PROFILE, MOBILE_PROFILE, SDR_PROFILE };

export const HOME: LocalPosition = { xKm: 0, yKm: 0, heightM: 10 };

export function settingsFor(profile: HamCapabilityProfile, patch: Partial<RadioSettings> = {}): RadioSettings {
  return { ...defaultRadioSettings(profile), ...patch };
}

export function emission(patch: Partial<OnAirEmission> = {}): OnAirEmission {
  return {
    id: 'e1',
    sourceId: 'remote-1',
    isPlayer: false,
    freqHz: 146_520_000,
    mode: 'FM',
    bandwidthHz: 16000,
    erpDbm: 37,
    polarization: 'V',
    position: { xKm: 2, yKm: 0, heightM: 10 },
    payload: { kind: 'voice', text: 'CQ this is the remote station calling anyone on the frequency', callsign: 'W1ABC' },
    startS: 0,
    endS: null,
    ...patch,
  };
}

export function receiver(profile: HamCapabilityProfile, patch: Partial<RadioSettings> = {}, view: Partial<ReceiverView> = {}): ReceiverView {
  return { profile, settings: settingsFor(profile, patch), powered: true, antennaPresent: true, usbConnected: true, position: HOME, ...view };
}

export const GOOD_ANTENNA: TxAntennaPath = { present: true, safe: true, gainDb: 0, feedLossDb: 0.5, mismatchLossDb: 0.2, polarization: 'V' };
