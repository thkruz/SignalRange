import type { LicenseClass } from '@app/ham/ham-privileges';
import type { HamCapabilityProfile, HamMode, RadioSettings, TxIntent } from '@app/ham/ham-types';
import { attemptTransmit } from '@app/ham/radio/transmit';
import { describe, expect, it } from 'vitest';
import { GOOD_ANTENNA, HANDHELD_PROFILE, HF_RIG_PROFILE, MOBILE_PROFILE, SDR_PROFILE, settingsFor } from './fixtures';

function tx(
  profile: HamCapabilityProfile,
  patch: Partial<RadioSettings>,
  opts: { license?: LicenseClass; antenna?: Partial<typeof GOOD_ANTENNA>; powered?: boolean; intent?: TxIntent } = {}
) {
  return attemptTransmit({
    deviceId: 'dev1',
    profile,
    settings: settingsFor(profile, patch),
    license: opts.license ?? 'technician',
    callsign: 'KD9TST',
    powered: opts.powered ?? true,
    antenna: { ...GOOD_ANTENNA, ...opts.antenna },
    intent: opts.intent ?? { kind: 'cq' },
    nowS: 10,
  });
}

describe('attemptTransmit', () => {
  it('the SDR can never transmit', () => {
    for (const [f, m] of [
      [146.52, 'FM'],
      [28.4, 'USB'],
      [14.2, 'USB'],
      [7.1, 'CW'],
    ] as [number, HamMode][]) {
      const r = tx(SDR_PROFILE, { vfoMHz: f, mode: m, txPowerW: 5 });
      expect(r.ok).toBe(false);
      expect(r.refusalCode).toBe('receive-only');
      expect(r.emission).toBeUndefined();
    }
  });

  it('refuses an unlicensed operator', () => {
    const r = tx(HANDHELD_PROFILE, { vfoMHz: 146.55, txPowerW: 5 }, { license: 'none' });
    expect(r.refusalCode).toBe('no-license');
  });

  it('technician 146.55 FM at 5 W is ok and builds an emission', () => {
    const r = tx(HANDHELD_PROFILE, { vfoMHz: 146.55, txPowerW: 5, txToneHz: 100 });
    expect(r.ok).toBe(true);
    expect(r.emission?.freqHz).toBe(146_550_000);
    expect(r.emission?.ctcssHz).toBe(100);
    expect(r.emission?.erpDbm).toBeCloseTo(37 - 0.5 - 0.2, 1);
    expect(r.emission?.payload.callsign).toBe('KD9TST');
  });

  it('technician 28.400 USB ok, 28.498 band-edge, 28.250 phone not allowed', () => {
    expect(tx(HF_RIG_PROFILE, { vfoMHz: 28.4, mode: 'USB', txPowerW: 50 }).ok).toBe(true);
    expect(tx(HF_RIG_PROFILE, { vfoMHz: 28.498, mode: 'USB', txPowerW: 50 }).refusalCode).toBe('band-edge');
    const r = tx(HF_RIG_PROFILE, { vfoMHz: 28.25, mode: 'USB', txPowerW: 50 });
    expect(r.ok).toBe(false);
    expect(r.refusalCode).toBe('privilege');
  });

  it('14.2 USB is a privilege refusal even though the HF rig hardware covers it', () => {
    const r = tx(HF_RIG_PROFILE, { vfoMHz: 14.2, mode: 'USB', txPowerW: 50 });
    expect(r.refusalCode).toBe('privilege');
  });

  it('2 m at 2000 W is refused for power', () => {
    const r = tx(MOBILE_PROFILE, { vfoMHz: 146.55, txPowerW: 2000 });
    expect(r.refusalCode).toBe('power-limit');
  });

  it('the handheld cannot key 28.4 (hardware band) nor USB (hardware mode)', () => {
    expect(tx(HANDHELD_PROFILE, { vfoMHz: 28.4, mode: 'FM', txPowerW: 5 }).refusalCode).toBe('hardware-band');
    expect(tx(HANDHELD_PROFILE, { vfoMHz: 146.55, mode: 'USB', txPowerW: 5 }).refusalCode).toBe('hardware-mode');
  });

  it('repeater minus 600 kHz from 146.94 transmits on 146.34', () => {
    const r = tx(HANDHELD_PROFILE, { vfoMHz: 146.94, offset: 'minus', offsetKHz: 600, txPowerW: 5 });
    expect(r.ok).toBe(true);
    expect(r.emission?.freqHz).toBe(146_340_000);
  });

  it('RIT does not move the transmit frequency', () => {
    const r = tx(HF_RIG_PROFILE, { vfoMHz: 28.4, mode: 'USB', txPowerW: 50, ritOn: true, ritHz: 1500 });
    expect(r.emission?.freqHz).toBe(28_400_000);
  });

  it('checks power, key lock, then antenna', () => {
    expect(tx(HANDHELD_PROFILE, { vfoMHz: 146.55 }, { powered: false }).refusalCode).toBe('no-power');
    expect(tx(HANDHELD_PROFILE, { vfoMHz: 146.55, keyLock: true }).refusalCode).toBe('locked');
    expect(tx(HANDHELD_PROFILE, { vfoMHz: 146.55, txPowerW: 5 }, { antenna: { present: false } }).refusalCode).toBe('no-antenna');
    const unsafe = tx(HANDHELD_PROFILE, { vfoMHz: 146.55, txPowerW: 5 }, { antenna: { safe: false } });
    expect(unsafe.refusalCode).toBe('unsafe-termination');
    expect(unsafe.refusal).toMatch(/unsafe/u);
  });
});
