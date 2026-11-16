import { noiseFloorDbm } from '@app/ham/radio/link-model';
import { noiseRiseAtReceiver, type RfiDevice } from '@app/ham/radio/noise-sources';
import { evaluateReception, revealTranscript } from '@app/ham/radio/reception-model';
import { describe, expect, it } from 'vitest';
import { emission, HANDHELD_PROFILE, HF_RIG_PROFILE, receiver, SDR_PROFILE } from './fixtures';

const first = (rx: ReturnType<typeof receiver>, ems = [emission()], env = {}) => evaluateReception(rx, ems, env)[0];

describe('evaluateReception', () => {
  it('hears a strong on-channel FM signal clearly', () => {
    const r = first(receiver(HANDHELD_PROFILE));
    expect(r.audible).toBe(true);
    expect(r.intelligibility).toBeGreaterThan(0.95);
    expect(r.squelchOpen).toBe(true);
  });

  it('RIT changes the reception offset', () => {
    const e = emission({ freqHz: 28_400_000, mode: 'USB', bandwidthHz: 2800, position: { xKm: 5, yKm: 0, heightM: 10 } });
    const base = first(receiver(HF_RIG_PROFILE, { vfoMHz: 28.4, mode: 'USB', filterHz: 2700, squelch: 0 }), [e]);
    const rit = first(receiver(HF_RIG_PROFILE, { vfoMHz: 28.4, mode: 'USB', filterHz: 2700, squelch: 0, ritOn: true, ritHz: 800 }), [e]);
    expect(base.offsetHz).toBe(0);
    expect(rit.offsetHz).toBe(-800);
    expect(rit.intelligibility).toBeLessThan(base.intelligibility);
  });

  it('squelch-closed and volume-zero are distinct', () => {
    const weak = { pathLossDb: { e1: 135 } };
    const closed = first(receiver(HANDHELD_PROFILE, { squelch: 6 }), [emission()], weak);
    expect(closed.squelchOpen).toBe(false);
    expect(closed.impairments).toContain('squelch-closed');
    expect(closed.audible).toBe(false);
    const mute = first(receiver(HANDHELD_PROFILE, { volume: 0 }));
    expect(mute.squelchOpen).toBe(true);
    expect(mute.impairments).toContain('volume-zero');
    expect(mute.impairments).not.toContain('squelch-closed');
    expect(mute.audible).toBe(false);
    const mon = first(receiver(HANDHELD_PROFILE, { squelch: 6, monitor: true }), [emission()], weak);
    expect(mon.squelchOpen).toBe(true);
  });

  it('a narrow FM filter hurts and restoring it recovers; a huge one adds noise', () => {
    const narrow = first(receiver(HANDHELD_PROFILE, { filterHz: 6000 }));
    expect(narrow.impairments).toContain('filter-too-narrow');
    expect(narrow.intelligibility).toBeGreaterThan(0.25);
    expect(narrow.intelligibility).toBeLessThan(0.55);
    const ok = first(receiver(HANDHELD_PROFILE, { filterHz: 15000 }));
    expect(ok.intelligibility).toBeGreaterThan(0.95);
    const wide = first(receiver(HANDHELD_PROFILE, { filterHz: 200000 }));
    expect(wide.impairments).toContain('filter-too-wide');
    expect(wide.snrDb).toBeLessThan(ok.snrDb - 10);
  });

  it('wrong mode is unintelligible', () => {
    const r = first(receiver(SDR_PROFILE, { mode: 'USB', filterHz: 2700 }));
    expect(r.impairments[0]).toBe('mode-mismatch');
    expect(r.intelligibility).toBe(0);
    const dmr = emission({ mode: 'DMR', dmr: { colorCode: 1, timeSlot: 1, talkgroup: 9 } });
    expect(first(receiver(SDR_PROFILE), [dmr]).impairments).toContain('mode-mismatch');
  });

  it('tone squelch needs the matching CTCSS', () => {
    const rx = receiver(HANDHELD_PROFILE, { rxToneHz: 100 });
    const no = first(rx, [emission({ ctcssHz: null })]);
    expect(no.impairments).toContain('tone-squelch-closed');
    expect(no.audible).toBe(false);
    expect(first(rx, [emission({ ctcssHz: 100 })]).audible).toBe(true);
    expect(first(receiver(HANDHELD_PROFILE, { rxToneHz: 100, monitor: true }), [emission()]).audible).toBe(true);
  });

  it('co-channel emissions of similar strength collide; a much stronger one captures in FM', () => {
    const a = emission({ id: 'a' });
    const b = emission({ id: 'b', position: { xKm: -2, yKm: 0, heightM: 10 } });
    const both = evaluateReception(receiver(HANDHELD_PROFILE), [a, b]);
    expect(both[0].impairments).toContain('collision');
    expect(both[1].impairments).toContain('collision');
    expect(both[0].intelligibility).toBeLessThan(0.3);
    const c = emission({ id: 'c', position: { xKm: -2, yKm: 0, heightM: 10 }, erpDbm: 10 });
    const cap = evaluateReception(receiver(HANDHELD_PROFILE), [a, c]);
    expect(cap[0].intelligibility).toBeGreaterThan(0.9);
    expect(cap[1].intelligibility).toBe(0);
  });

  it('a half-duplex radio that is transmitting hears nothing', () => {
    const r = first(receiver(HANDHELD_PROFILE, {}, { transmitting: true }));
    expect(r.impairments).toEqual(['transmitting']);
    expect(r.audible).toBe(false);
  });

  it('reports power, antenna and USB faults', () => {
    expect(first(receiver(HANDHELD_PROFILE, {}, { powered: false })).impairments).toContain('no-power');
    expect(first(receiver(HANDHELD_PROFILE, {}, { antennaPresent: false })).impairments).toContain('no-antenna');
    expect(first(receiver(SDR_PROFILE, {}, { usbConnected: false })).impairments).toContain('usb-disconnected');
  });

  it('a noisy supply raises noise and lowers intelligibility; off restores', () => {
    const weak = { pathLossDb: { e1: 130 } };
    const rx = receiver(HANDHELD_PROFILE, { filterHz: 15000 });
    const floor = noiseFloorDbm(15000, 8);
    const supply = (energized: boolean): RfiDevice => ({ id: 'psu', position: { xKm: 0.003, yKm: 0, heightM: 1 }, energized, psdDbmHzAt1m: -125 });
    const rise = (energized: boolean) => noiseRiseAtReceiver([supply(energized)], { position: rx.position }, 15000, floor).riseDb;
    const clean = first(rx, [emission()], { ...weak, noiseRiseDb: rise(false) });
    const noisy = first(rx, [emission()], { ...weak, noiseRiseDb: rise(true) });
    expect(rise(true)).toBeGreaterThan(10);
    expect(noisy.snrDb).toBeLessThan(clean.snrDb - 10);
    expect(noisy.intelligibility).toBeLessThan(clean.intelligibility);
    expect(noisy.impairments).toContain('interference');
    expect(clean.intelligibility).toBeGreaterThan(0.9);
  });

  it('SDR overload with high gain is fixed by lowering gain or adding a filter', () => {
    const strong = emission({ id: 'bcast', freqHz: 100_500_000, bandwidthHz: 200000 });
    const wanted = emission({ id: 'wanted', freqHz: 100_000_000 });
    const env = { pathLossDb: { bcast: 57, wanted: 137 } };
    const run = (patch: Record<string, number>, view = {}) => evaluateReception(receiver(SDR_PROFILE, { vfoMHz: 100, filterHz: 15000, ...patch }, view), [strong, wanted], env)[1];
    const high = run({ rfGainDb: 40 });
    expect(high.intelligibility).toBeLessThan(0.1);
    expect(high.impairments).toContain('overload');
    expect(run({ rfGainDb: 0 }).intelligibility).toBeGreaterThan(0.8);
    expect(run({ rfGainDb: 40 }, { filterAttenDb: 50 }).intelligibility).toBeGreaterThan(0.8);
  });
});

describe('revealTranscript', () => {
  const text = 'this is a fairly long test transmission with many words in it';
  it('is deterministic and drops words', () => {
    expect(revealTranscript(text, 0.5, 7)).toBe(revealTranscript(text, 0.5, 7));
    expect(revealTranscript(text, 1, 7)).toBe(text);
    expect(
      revealTranscript(text, 0, 7)
        .split(' ')
        .every((w) => w === '…')
    ).toBe(true);
    const mid = revealTranscript(text, 0.5, 7);
    expect(mid).toContain('…');
    expect(mid.split(' ').length).toBe(text.split(' ').length);
  });
});
