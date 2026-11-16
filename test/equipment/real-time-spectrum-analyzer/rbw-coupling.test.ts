import { describe, expect, it } from 'vitest';
import { MAX_TRACE_INTERVAL_MS, minRbwForSpanHz, RealTimeSpectrumAnalyzer, roundUp125 } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumDataProcessor } from '../../../src/equipment/real-time-spectrum-analyzer/spectrum-data-processor';

/** The analyzer's RBW/timing getters on a bare state (no DOM, no front end) */
function analyzerWith(state: { span: number; rbw: number | null; refreshRate?: number }): RealTimeSpectrumAnalyzer {
  const analyzer = Object.create(RealTimeSpectrumAnalyzer.prototype) as RealTimeSpectrumAnalyzer;
  (analyzer as unknown as { state: unknown }).state = { refreshRate: 10, ...state };

  return analyzer;
}

describe('Phase 27 AN: RBW couples to span like a real analyzer', () => {
  it('limits a manual RBW to span / 10,000 on the 1-3-10 sequence', () => {
    expect(minRbwForSpanHz(60e6)).toBe(10e3);
    expect(minRbwForSpanHz(2e3)).toBe(1);
    expect(minRbwForSpanHz(100e3)).toBe(10);
    expect(minRbwForSpanHz(50e6)).toBe(10e3);
    // The analyzer reference cases' 10 MHz at 1 kHz is allowed as set
    expect(minRbwForSpanHz(10e6)).toBe(1e3);
  });

  it('60 MHz at a manual 1 kHz RBW runs at 10 kHz and says so', () => {
    const analyzer = analyzerWith({ span: 60e6, rbw: 1e3 });
    expect(analyzer.effectiveRbwHz).toBe(10e3);
    expect(analyzer.isRbwLimited).toBe(true);
  });

  it('keeps a manual RBW the span allows, and auto stays auto', () => {
    expect(analyzerWith({ span: 2e3, rbw: 30 }).effectiveRbwHz).toBe(30);
    expect(analyzerWith({ span: 2e3, rbw: 30 }).isRbwLimited).toBe(false);
    expect(analyzerWith({ span: 2e3, rbw: null }).effectiveRbwHz).toBe(3);
    expect(analyzerWith({ span: 2e3, rbw: null }).isRbwLimited).toBe(false);
  });

  it('never waits more than 2 s for a trace (60 MHz used to redraw every 180 s)', () => {
    expect(analyzerWith({ span: 60e6, rbw: 1e3 }).traceIntervalMs).toBeLessThanOrEqual(MAX_TRACE_INTERVAL_MS);
    expect(analyzerWith({ span: 1e3, rbw: 1 }).traceIntervalMs).toBe(MAX_TRACE_INTERVAL_MS);
    // Wide RBW: the refresh rate sets the pace
    expect(analyzerWith({ span: 100e6, rbw: null }).traceIntervalMs).toBe(100);
    // FFT acquisition ~2.5 / RBW: 3 Hz takes ~0.83 s
    expect(analyzerWith({ span: 2e3, rbw: null }).traceIntervalMs).toBeCloseTo(833, 0);
  });

  it('rounds spans up to 1-2-5 steps', () => {
    expect(roundUp125(1.1e3)).toBe(2e3);
    expect(roundUp125(2e3)).toBe(2e3);
    expect(roundUp125(22e6)).toBe(50e6);
    expect(roundUp125(39.6e6)).toBe(50e6);
    expect(roundUp125(5.5e6)).toBe(10e6);
  });
});

describe('Phase 27 AN: a CW line reads its power at any RBW', () => {
  const sigmaOf = (rbw: number): number => rbw / (2 * Math.sqrt(2 * Math.LN2));

  it('peak of a 10 Hz-wide line equals its power once the RBW is wider than the line', () => {
    for (const rbw of [30, 1e3, 100e3]) {
      const sigmaRbw = sigmaOf(rbw);
      const symbolRate = 10 / 1.2;
      const sigma = Math.sqrt(sigmaRbw ** 2 + ((0.2 * symbolRate) / 2.56) ** 2);
      const peak = SpectrumDataProcessor.rbwResponse(1, 0, symbolRate, sigmaRbw, sigma, 0);
      // (narrower RBWs draw CW carriers through the symbol-rate-0 path below)
      expect(10 * Math.log10(peak)).toBeGreaterThan(-0.5);
    }
  });

  it('a CW carrier (symbol rate 0) draws the filter shape at full power', () => {
    const sigmaRbw = sigmaOf(30);
    expect(SpectrumDataProcessor.rbwResponse(1, 0, 0, sigmaRbw, sigmaRbw, 0)).toBeCloseTo(1, 6);
    // -3 dB at half the RBW off the line
    expect(10 * Math.log10(SpectrumDataProcessor.rbwResponse(1, 0, 0, sigmaRbw, sigmaRbw, 15))).toBeCloseTo(-3, 1);
  });
});
