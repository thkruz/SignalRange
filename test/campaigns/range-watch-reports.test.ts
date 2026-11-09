import { beaconLookup, evaluateBeaconReport } from '@app/campaigns/constellation-sandbox/beacon-id';
import { evaluateInterferenceReport, parseClock, type ReportDeps } from '@app/campaigns/constellation-sandbox/interference-report';
import { geoBeaconHz } from '@app/simulation/geo-beacon';
import { describe, expect, it } from 'vitest';

const NOW = Date.parse('2026-11-09T18:30:00Z');
const hms = (iso: string): number => Date.parse(`2026-11-09T${iso}Z`);

/** Satellite 111 is in line from 18:09:10 to 18:09:20 UTC; 222 and 333 never are. */
const deps: ReportDeps = {
  nowMs: NOW,
  isMember: (n) => [111, 222, 333].includes(n),
  inLine: (n, t0, t1) => n === 111 && t0 <= hms('18:09:20') && t1 >= hms('18:09:10'),
};
const report = (over: Record<string, string> = {}) => ({ norad: '111', start: '18:08:30', end: '18:10:00', drop: '1.4', ...over });

describe('interference report', () => {
  it('accepts a correct NORAD and window', () => {
    expect(evaluateInterferenceReport(report(), deps).ok).toBe(true);
  });

  it('rejects a NORAD that was never in line', () => {
    expect(evaluateInterferenceReport(report({ norad: '222' }), deps).ok).toBe(false);
  });

  it('rejects a satellite outside the window', () => {
    expect(evaluateInterferenceReport(report({ start: '18:20:00', end: '18:22:00' }), deps).ok).toBe(false);
  });

  it('rejects a window longer than 10 minutes', () => {
    expect(evaluateInterferenceReport(report({ start: '18:00:00', end: '18:11:00' }), deps).ok).toBe(false);
    expect(evaluateInterferenceReport(report({ start: '18:05:00', end: '18:15:00' }), deps).ok).toBe(true);
  });

  it('rejects an unknown NORAD, bad times, bad drop and a future window', () => {
    expect(evaluateInterferenceReport(report({ norad: '999' }), deps).ok).toBe(false);
    expect(evaluateInterferenceReport(report({ start: 'noon' }), deps).ok).toBe(false);
    expect(evaluateInterferenceReport(report({ drop: '' }), deps).ok).toBe(false);
    expect(evaluateInterferenceReport(report({ drop: '-2' }), deps).ok).toBe(false);
    expect(evaluateInterferenceReport(report({ start: '18:29:00', end: '18:35:00' }), deps).ok).toBe(false);
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
