/**
 * @file transmit - Keying-time transmit gate and on-air emission builder
 * @description Everything is evaluated when the operator keys the transmitter,
 * in a fixed order: power, key lock, receive-only hardware, hardware band/mode,
 * license privilege, then the antenna path. Hardware ability and legal
 * privilege are separate questions and report separate refusal codes.
 */

import { checkTransmitPrivilege, type LicenseClass, occupiedBandwidthHz } from '../ham-privileges';
import { canTransmitHardware } from '../ham-profiles';
import type { EmissionPayload, HamCapabilityProfile, HamMode, LocalPosition, OnAirEmission, RadioSettings, TxAttempt, TxIntent } from '../ham-types';
import { effectiveSettings, txFrequencyMHz } from './radio-settings';

/** What the RF path tells the transmit gate about the antenna side */
export interface TxAntennaPath {
  /** An antenna (or load) is connected to the RF port */
  present: boolean;
  /** False when the termination could damage the radio (open/short, no load at high power) */
  safe: boolean;
  gainDb: number;
  feedLossDb: number;
  mismatchLossDb: number;
  polarization: 'V' | 'H' | 'RHCP' | 'LHCP';
}

export interface TxInput {
  deviceId: string;
  profile: HamCapabilityProfile;
  settings: RadioSettings;
  license: LicenseClass;
  callsign: string;
  powered: boolean;
  antenna: TxAntennaPath;
  intent: TxIntent;
  nowS: number;
  position?: LocalPosition;
}

export type TxResult = TxAttempt & { emission?: OnAirEmission };

const fail = (refusalCode: NonNullable<TxAttempt['refusalCode']>, refusal: string): TxResult => ({ ok: false, refusalCode, refusal });

export function attemptTransmit(input: TxInput): TxResult {
  const { profile, settings } = input;
  if (!input.powered) {
    return fail('no-power', 'The radio is off or has no power. Nothing happens when you key up.');
  }
  if (settings.keyLock) {
    return fail('locked', 'The keys are locked, so the transmit key does nothing. Unlock the keypad first.');
  }
  const eff = effectiveSettings(settings);
  const freqMHz = txFrequencyMHz(settings);
  const mode: HamMode = eff.mode;

  const hw = canTransmitHardware(profile, freqMHz, mode);
  if (hw === 'receive-only') {
    return fail('receive-only', `The ${profile.label} is a receiver only. It has no transmitter, so it can never key up.`);
  }
  if (hw === 'hardware-band') {
    return fail('hardware-band', `This radio cannot transmit on ${freqMHz} MHz. That frequency is outside the bands its transmitter covers.`);
  }
  if (hw === 'hardware-mode') {
    return fail('hardware-mode', `This radio cannot transmit ${mode}. Its transmitter does not support that mode.`);
  }

  const bandwidthHz = occupiedBandwidthHz(mode);
  const priv = checkTransmitPrivilege(input.license, freqMHz * 1e6, mode, settings.txPowerW, bandwidthHz);
  if (!priv.allowed) {
    return fail(priv.code ?? 'privilege', priv.reason ?? 'Your license does not allow this transmission.');
  }

  if (!input.antenna.present) {
    return fail('no-antenna', 'There is no antenna or load connected. Connect an antenna before transmitting.');
  }
  if (!input.antenna.safe) {
    return fail('unsafe-termination', 'The antenna connection is unsafe (open, shorted or badly mismatched). Keying up could damage the radio, so it refuses to transmit.');
  }

  const a = input.antenna;
  const erpDbm = 10 * Math.log10(Math.max(settings.txPowerW, 1e-6) * 1000) + a.gainDb - a.feedLossDb - a.mismatchLossDb;
  const dmrCh = mode === 'DMR' && eff.activeDmrChannel !== null ? eff.codeplug[eff.activeDmrChannel] : undefined;

  const emission: OnAirEmission = {
    id: `tx-${input.deviceId}-${input.nowS}`,
    sourceId: input.deviceId,
    isPlayer: true,
    freqHz: Math.round(freqMHz * 1e6),
    mode,
    bandwidthHz,
    erpDbm,
    polarization: a.polarization,
    position: input.position,
    ctcssHz: eff.txToneHz,
    audioDrive: settings.micGain,
    payload: buildPayload(input.intent, mode, input.callsign),
    startS: input.nowS,
    endS: null,
  };
  if (dmrCh) {
    emission.dmr = { colorCode: dmrCh.colorCode, timeSlot: dmrCh.timeSlot, talkgroup: dmrCh.talkgroup };
  }

  return { ok: true, emission };
}

function buildPayload(intent: TxIntent, mode: HamMode, callsign: string): EmissionPayload {
  const kind: EmissionPayload['kind'] = mode === 'CW' ? 'cw' : mode === 'FT8' ? 'ft8' : mode === 'PKT' ? 'packet' : mode === 'DMR' ? 'dmr-voice' : 'voice';
  switch (intent.kind) {
    case 'cq':
      return { kind, text: `CQ CQ CQ, this is ${callsign}, ${callsign}, listening`, callsign };
    case 'call':
      return { kind, text: `${intent.target}, this is ${callsign}`, callsign };
    case 'reply':
      return { kind, text: `${callsign}: ${intent.item}`, callsign };
    case 'identify':
      return { kind, text: `This is ${callsign}`, callsign };
    case 'net-checkin':
      return { kind, text: `${callsign} checking in to the net`, callsign };
    case 'message':
      return { kind, text: intent.text, callsign };
    case 'carrier':
      return { kind: 'carrier', callsign };
    case 'test':
      return { kind, text: `Testing, this is ${callsign}`, callsign };
  }
}
