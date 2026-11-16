import { DMR_HANDHELD_PROFILE, HANDHELD_PROFILE } from '@app/ham/ham-profiles';
import { linkLoss, polarizationMismatchDb, radioHorizonKm } from '@app/ham/radio/link-model';
import { noiseRiseAtReceiver, type RfiDevice, rfiPsdAtDistance, scanNoiseBearings } from '@app/ham/radio/noise-sources';
import { applySetting, CTCSS_TONES_HZ, defaultRadioSettings, isValidCtcssHz, recallMemory, selectDmrChannel, storeMemory, txFrequencyMHz } from '@app/ham/radio/radio-settings';
import { generateSpectrumRow } from '@app/ham/radio/spectrum-bins';
import { freeSpacePathLossDb, groundPath } from '@app/simulation/rf-geometry';
import { describe, expect, it } from 'vitest';

describe('rf-geometry', () => {
  it('FSPL and ground path', () => {
    expect(freeSpacePathLossDb(146e6, 1)).toBeCloseTo(32.45 + 43.29, 1);
    const g = groundPath(0, 0, 0, 1);
    expect(g.bearingDeg).toBeCloseTo(90, 3);
    expect(g.distanceKm).toBeCloseTo(111.19, 1);
  });
});

describe('link-model', () => {
  it('adds a diffraction penalty beyond the radio horizon', () => {
    const near = linkLoss({ freqHz: 146e6, tx: { xKm: 10, yKm: 0, heightM: 10 }, rx: { xKm: 0, yKm: 0, heightM: 10 } });
    const far = linkLoss({ freqHz: 146e6, tx: { xKm: 40, yKm: 0, heightM: 10 }, rx: { xKm: 0, yKm: 0, heightM: 10 } });
    expect(radioHorizonKm(10, 10)).toBeCloseTo(26.05, 1);
    expect(near.beyondHorizon).toBe(false);
    expect(far.beyondHorizon).toBe(true);
    expect(far.pathLossDb - near.pathLossDb).toBeGreaterThan(12 + 20);
    expect(near.bearingDeg).toBeCloseTo(90, 3);
  });

  it('clamps distance and applies polarization mismatch', () => {
    const l = linkLoss({ freqHz: 146e6, tx: { xKm: 0, yKm: 0, heightM: 2 }, rx: { xKm: 0, yKm: 0, heightM: 2 } });
    expect(l.distanceKm).toBe(0.01);
    expect(polarizationMismatchDb('V', 'H')).toBe(20);
    expect(polarizationMismatchDb('V', 'V')).toBe(0);
  });
});

describe('noise-sources', () => {
  const rx = { position: { xKm: 0, yKm: 0, heightM: 2 } };
  const psu = (patch: Partial<RfiDevice> = {}): RfiDevice => ({ id: 'psu', position: { xKm: 0, yKm: 0.01, heightM: 1 }, energized: true, psdDbmHzAt1m: -120, ...patch });

  it('falls with distance, bounded at 1 m', () => {
    expect(rfiPsdAtDistance(-120, 10)).toBeCloseTo(-140, 5);
    expect(rfiPsdAtDistance(-120, 0.1)).toBe(-120);
  });

  it('clean supply or de-energized device contributes nothing', () => {
    expect(noiseRiseAtReceiver([psu({ psdDbmHzAt1m: null })], rx, 15000, -120).riseDb).toBe(0);
    expect(noiseRiseAtReceiver([psu({ energized: false })], rx, 15000, -120).strongestBearingDeg).toBeNull();
  });

  it('shared supply couples more strongly', () => {
    const far = psu({ position: { xKm: 0, yKm: 0.1, heightM: 1 }, supplyId: 'strip' });
    const radiated = noiseRiseAtReceiver([far], rx, 15000, -120).noiseDbm;
    const conducted = noiseRiseAtReceiver([far], { ...rx, supplyId: 'strip' }, 15000, -120).noiseDbm;
    expect(conducted).toBeGreaterThan(radiated + 20);
  });

  it('a directional antenna peaks toward the source, with a weaker reflection lobe', () => {
    const dev = psu({ position: { xKm: 0.03, yKm: 0, heightM: 1 }, reflection: { bearingOffsetDeg: 70, extraLossDb: 8 } });
    const gain = (point: number) => (b: number) => {
      const off = Math.abs(((b - point + 540) % 360) - 180);

      return off < 30 ? 10 : -10;
    };
    const scan = scanNoiseBearings([dev], (p) => ({ ...rx, antennaGainDb: gain(p) }), 15000, 5);
    const peak = scan.reduce((a, b) => (b.noiseDbm > a.noiseDbm ? b : a));
    expect(Math.abs(peak.bearingDeg - 90)).toBeLessThanOrEqual(30);
    const res = noiseRiseAtReceiver([dev], { ...rx, antennaGainDb: gain(90) }, 15000, -120);
    expect(res.contributions).toHaveLength(2);
    expect(res.strongestBearingDeg).toBe(90);
  });
});

describe('spectrum-bins', () => {
  it('is deterministic and shows the signal above the floor', () => {
    const input = {
      centerHz: 146_520_000,
      spanHz: 100_000,
      bins: 200,
      emissions: [{ freqHz: 146_520_000, bandwidthHz: 16000, mode: 'FM' as const, rssiDbm: -60 }],
      noiseFloorDbm: -120,
      seed: 3,
    };
    const a = generateSpectrumRow(input);
    const b = generateSpectrumRow(input);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a[100]).toBeGreaterThan(-90);
    expect(a[10]).toBeLessThan(-110);
    const raised = generateSpectrumRow({ ...input, noiseSourceRiseDb: 20 });
    expect(raised[10]).toBeGreaterThan(a[10] + 10);
  });
});

describe('radio-settings', () => {
  it('validates CTCSS tones', () => {
    expect(CTCSS_TONES_HZ[0]).toBe(67.0);
    expect(CTCSS_TONES_HZ.at(-1)).toBe(254.1);
    expect(isValidCtcssHz(100)).toBe(true);
    expect(isValidCtcssHz(101)).toBe(false);
    const s = defaultRadioSettings(HANDHELD_PROFILE);
    expect(applySetting(HANDHELD_PROFILE, s, { txToneHz: 101 }).ok).toBe(false);
    expect(applySetting(HANDHELD_PROFILE, s, { txToneHz: 100 }).ok).toBe(true);
  });

  it('offset helpers', () => {
    const s = { ...defaultRadioSettings(HANDHELD_PROFILE), vfoMHz: 146.94 };
    expect(txFrequencyMHz(s)).toBe(146.94);
    expect(txFrequencyMHz({ ...s, offset: 'minus' })).toBe(146.34);
    expect(txFrequencyMHz({ ...s, offset: 'plus', offsetKHz: 5000 })).toBe(151.94);
  });

  it('memory store and recall round trip', () => {
    let s = { ...defaultRadioSettings(HANDHELD_PROFILE), vfoMHz: 146.94, offset: 'minus' as const, txToneHz: 100, rxToneHz: 100 };
    const stored = storeMemory(s, 3, 'Repeater');
    expect(stored.ok).toBe(true);
    s = { ...stored.settings, vfoMHz: 433.5, offset: 'simplex', txToneHz: null, rxToneHz: null };
    const r = recallMemory(s, 3);
    expect(r.settings).toMatchObject({ vfoMHz: 146.94, offset: 'minus', txToneHz: 100, rxToneHz: 100, mode: 'FM', activeMemory: 3 });
    expect(recallMemory(s, 9).ok).toBe(false);
    expect(applySetting(HANDHELD_PROFILE, r.settings, { vfoMHz: 146.52 }).settings.activeMemory).toBeNull();
  });

  it('key lock blocks changes but can be released', () => {
    const s = { ...defaultRadioSettings(HANDHELD_PROFILE), keyLock: true };
    const r = applySetting(HANDHELD_PROFILE, s, { volume: 9 });
    expect(r.ok).toBe(false);
    expect(r.refusal).toMatch(/locked/u);
    expect(storeMemory(s, 1, 'x').ok).toBe(false);
    expect(applySetting(HANDHELD_PROFILE, s, { keyLock: false }).ok).toBe(true);
  });

  it('DMR codeplug channel select', () => {
    const s = { ...defaultRadioSettings(DMR_HANDHELD_PROFILE), codeplug: [{ name: 'TG9', rxMHz: 439.5, txMHz: 434.5, colorCode: 1, timeSlot: 2 as const, talkgroup: 9 }] };
    const r = selectDmrChannel(DMR_HANDHELD_PROFILE, s, 0);
    expect(r.settings.mode).toBe('DMR');
    expect(txFrequencyMHz(r.settings)).toBe(434.5);
    expect(selectDmrChannel(DMR_HANDHELD_PROFILE, s, 5).ok).toBe(false);
    expect(selectDmrChannel(HANDHELD_PROFILE, s, 0).ok).toBe(false);
  });
});
