import { beaconLookup, evaluateBeaconReport } from '@app/campaigns/constellation-sandbox/beacon-id';
import { evaluateOutageReport, parseClock, type ReportDeps } from '@app/campaigns/constellation-sandbox/outage-report';
import { geoBeaconHz } from '@app/simulation/geo-beacon';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-11-09T18:30:00Z');
const hms = (iso: string): number => Date.parse(`2026-11-09T${iso}Z`);

/** The terminal logged a drop at 18:09:15 while 111 was serving, and one at 18:25:00 while 222 was. */
const deps: ReportDeps = {
  nowMs: NOW,
  drops: [
    { atMs: hms('18:09:15'), servingNorad: 111 },
    { atMs: hms('18:25:00'), servingNorad: 222 },
  ],
};
const report = (over: Record<string, string> = {}) => ({ norad: '111', start: '18:08:30', end: '18:10:00', ...over });

describe('outage report', () => {
  it('accepts the serving NORAD and a window around the drop', () => {
    expect(evaluateOutageReport(report(), deps).ok).toBe(true);
  });

  it('rejects a NORAD that was not serving at the drop', () => {
    expect(evaluateOutageReport(report({ norad: '222' }), deps).ok).toBe(false);
  });

  it('rejects a window with no drop in it', () => {
    expect(evaluateOutageReport(report({ start: '18:20:00', end: '18:22:00' }), deps).ok).toBe(false);
  });

  it('rejects a window longer than 10 minutes', () => {
    expect(evaluateOutageReport(report({ start: '18:00:00', end: '18:11:00' }), deps).ok).toBe(false);
    expect(evaluateOutageReport(report({ start: '18:05:00', end: '18:15:00' }), deps).ok).toBe(true);
  });

  it('rejects bad input and a future window', () => {
    expect(evaluateOutageReport(report({ norad: 'abc' }), deps).ok).toBe(false);
    expect(evaluateOutageReport(report({ start: 'noon' }), deps).ok).toBe(false);
    expect(evaluateOutageReport(report({ start: '18:29:00', end: '18:35:00' }), deps).ok).toBe(false);
  });

  it('has no answer without drops', () => {
    expect(evaluateOutageReport(report(), { ...deps, drops: [] }).ok).toBe(false);
  });

  it('parses clock times', () => {
    expect(parseClock('18:09')).toBe(18 * 3600 + 9 * 60);
    expect(parseClock('18:09:10')).toBe(18 * 3600 + 9 * 60 + 10);
    expect(parseClock('25:00')).toBeNull();
  });
});

describe('beacon report', () => {
  it('accepts the NORAD whose beacon modem 1 is measuring', () => {
    expect(evaluateBeaconReport({ norad: '40000' }, 40000).ok).toBe(true);
  });

  it('rejects another NORAD, or no tuned beacon', () => {
    expect(evaluateBeaconReport({ norad: '40001' }, 40000).ok).toBe(false);
    expect(evaluateBeaconReport({ norad: '40000' }, null).ok).toBe(false);
  });

  it('looks up a beacon from a NORAD number and back from a frequency', () => {
    const f = geoBeaconHz(40000) / 1e6;
    const registry = { memberNoradIds: () => Int32Array.from([40000, 40001]), memberIndexOf: (n: number) => n - 40000, memberName: (i: number) => `SAT${i}` };

    expect(beaconLookup('40000', registry)).toContain(f.toFixed(1));
    expect(beaconLookup(f.toFixed(1), registry)).toContain('40000 SAT0');
    expect(beaconLookup((13100 - f).toFixed(1), registry)).toContain('40000 SAT0');
  });
});
