import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FECSimulator, FECSimulatorInput, rsSymbolErrorRateForPer } from '../../../src/equipment/receiver/fec-simulator';
import { codedPer, decodedBer, framesPerSecond, modcodFor } from '../../../src/equipment/receiver/modcod';
import { SimClock } from '../../../src/simulation/sim-clock';

const QPSK34 = modcodFor('QPSK', '3/4');
if (!QPSK34) throw new Error('QPSK 3/4 missing');
const THRESHOLD = QPSK34.thresholdEsN0Db; // 5.03 dB

/** A locked 30 Msps QPSK 3/4 carrier at `margin` dB over its threshold */
const at = (margin: number, extra: Partial<FECSimulatorInput> = {}): FECSimulatorInput => ({
  cnRatio_dB: 0,
  effectiveEsN0_dB: THRESHOLD + margin,
  symbolRate_Hz: 30e6,
  hasCarrier: true,
  hasLock: true,
  modulation: 'QPSK',
  fec: '3/4',
  ...extra,
});

describe('FECSimulator (phase 19.5: metrics from the coded curves)', () => {
  let nowMs = 0;

  const sampleAfter = (sim: FECSimulator, input: FECSimulatorInput, dtMs: number) => {
    nowMs += dtMs;
    return sim.calculate(input);
  };

  beforeEach(() => {
    nowMs = 0;
    vi.spyOn(SimClock, 'runMs').mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('curves', () => {
    it.each([-0.5, -0.3, 0, 0.5, 2, 8])('PER and decoded BER at margin %s dB are the MODCOD curve values', (margin) => {
      const m = new FECSimulator().calculate(at(margin));
      expect(m.per).toBeCloseTo(codedPer(THRESHOLD + margin, QPSK34), 15);
      expect(m.ber).toBeCloseTo(Math.max(1e-12, decodedBer(THRESHOLD + margin, QPSK34)), 15);
    });

    it('derives Es/N0 from C/N in the carrier bandwidth when the receiver gives none', () => {
      // C/N in 36 MHz -> Es/N0 in 30 Msps: + 10 log 1.2
      const m = new FECSimulator().calculate({ cnRatio_dB: THRESHOLD - 10 * Math.log10(1.2), hasCarrier: true, hasLock: true, modulation: 'QPSK', fec: '3/4' });
      expect(m.per).toBeCloseTo(1e-7, 9);
    });

    it('the RS input symbol-error rate reproduces the PER through the RS(255,223) binomial tail', () => {
      for (const per of [1e-2, 1e-5, 1e-7]) {
        const p = rsSymbolErrorRateForPer(per);
        // Re-derive the tail independently
        let tail = 0;
        let logC = 0;
        for (let k = 0; k <= 255; k++) {
          if (k > 0) logC += Math.log(255 - k + 1) - Math.log(k);
          if (k > 16) tail += Math.exp(logC + k * Math.log(p) + (255 - k) * Math.log(1 - p));
        }
        expect(Math.abs(Math.log10(tail) - Math.log10(per))).toBeLessThan(0.01);
      }
    });
  });

  describe('frame sync and channel status', () => {
    it('is Good with a healthy margin: frame sync, no frame errors', () => {
      const m = new FECSimulator().calculate(at(5));
      expect(m.frameSyncLocked).toBe(true);
      expect(m.channelStatus).toBe('Good');
      expect(m.rsUncorrectableBlocks).toBe(0);
    });

    it('is Degraded under 1 dB of margin (the modem says the same), still error-free', () => {
      const m = new FECSimulator().calculate(at(0.6));
      expect(m.channelStatus).toBe('Degraded');
      expect(m.rsUncorrectableBlocks).toBe(0);
    });

    it('follows the receiver hysteresis when it is given', () => {
      expect(new FECSimulator().calculate(at(1.2, { isLowMargin: true })).channelStatus).toBe('Degraded');
      expect(new FECSimulator().calculate(at(1.2, { isLowMargin: false })).channelStatus).toBe('Good');
    });

    it('is Critical below threshold while lock holds (frames failing every second)', () => {
      const m = new FECSimulator().calculate(at(-0.4));
      expect(m.frameSyncLocked).toBe(true);
      expect(m.channelStatus).toBe('Critical');
      expect(m.rsUncorrectableBlocks).toBe(Math.round(codedPer(THRESHOLD - 0.4, QPSK34) * framesPerSecond(30e6, QPSK34)));
    });

    it('loses frame sync without modem lock, whatever the C/N', () => {
      const m = new FECSimulator().calculate(at(10, { hasLock: false }));
      expect(m.frameSyncLocked).toBe(false);
      expect(m.channelStatus).toBe('No Lock');
      expect(m.ber).toBe(0.5);
    });

    it('never locks a label pair with no MODCOD', () => {
      const m = new FECSimulator().calculate(at(10, { modulation: 'null', fec: 'null' }));
      expect(m.frameSyncLocked).toBe(false);
    });
  });

  describe('frame accounting', () => {
    it('counts whole uncorrectable frames, PER x frames/s x time, with nothing lost to rounding', () => {
      const sim = new FECSimulator();
      sim.calculate(at(-0.3));
      let last = sim.calculate(at(-0.3));
      for (let i = 0; i < 10; i++) {
        last = sampleAfter(sim, at(-0.3), 1000);
        expect(Number.isInteger(last.rsUncorrectableBlocks)).toBe(true);
        expect(Number.isInteger(last.rsUncorrectableTotal)).toBe(true);
        expect(Number.isInteger(last.rsCorrectedErrors)).toBe(true);
      }
      const expected = codedPer(THRESHOLD - 0.3, QPSK34) * framesPerSecond(30e6, QPSK34) * 10;
      expect(Math.abs(last.rsUncorrectableTotal - expected)).toBeLessThanOrEqual(1);
    });

    it('corrects more RS symbols per block as the margin shrinks, never more than 16', () => {
      const strong = new FECSimulator().calculate(at(6)).rsCorrectedErrors;
      const weak = new FECSimulator().calculate(at(0)).rsCorrectedErrors;
      const failing = new FECSimulator().calculate(at(-0.45)).rsCorrectedErrors;
      expect(strong).toBe(0);
      expect(weak).toBeGreaterThan(strong);
      expect(failing).toBeGreaterThanOrEqual(weak);
      expect(failing).toBeLessThanOrEqual(16);
    });

    it('reports the information rate of the carrier', () => {
      expect(new FECSimulator().calculate(at(5)).dataRate).toBe('45.000 Mbps');
      expect(new FECSimulator().calculate(at(5, { symbolRate_Hz: 1e6, modulation: 'BPSK', fec: '1/2' })).dataRate).toBe('500.0 kbps');
    });
  });

  describe('display smoothing', () => {
    it('shows a BER rise within a couple of samples', () => {
      const sim = new FECSimulator();
      sim.calculate(at(5));
      sampleAfter(sim, at(-0.4), 1000);
      const metrics = sampleAfter(sim, at(-0.4), 1000);
      expect(metrics.ber).toBeGreaterThan(1e-5);
    });

    it('clears on a time constant of a few seconds once the margin returns', () => {
      const sim = new FECSimulator();
      sim.calculate(at(5));
      for (let i = 0; i < 30; i++) sampleAfter(sim, at(-0.4), 1000);
      let metrics = sim.calculate(at(5));
      for (let i = 0; i < 8; i++) metrics = sampleAfter(sim, at(5), 1000);

      expect(FECSimulator.SMOOTHING_TAU_MS).toBeGreaterThanOrEqual(2000);
      expect(FECSimulator.SMOOTHING_TAU_MS).toBeLessThanOrEqual(3000);
      expect(metrics.ber).toBeLessThan(1e-9);
      expect(metrics.rsUncorrectableBlocks).toBe(0);
      expect(metrics.channelStatus).toBe('Good');
    });

    it('does not move the smoothed BER when no time has passed', () => {
      const sim = new FECSimulator();
      const first = sim.calculate(at(-0.4));
      const second = sim.calculate(at(5));
      expect(second.ber / first.ber).toBeCloseTo(1, 9);
    });

    it('reseeds when the modem re-acquires lock: a fresh lock does not inherit the outage', () => {
      const sim = new FECSimulator();
      sim.calculate(at(5));
      let metrics = sim.calculate(at(-3, { hasLock: false }));
      for (let i = 0; i < 20; i++) metrics = sampleAfter(sim, at(-3, { hasLock: false }), 1000);
      expect(metrics.channelStatus).toBe('No Lock');

      metrics = sampleAfter(sim, at(5), 1000);
      expect(metrics.frameSyncLocked).toBe(true);
      expect(metrics.ber).toBeLessThan(1e-9);
      expect(metrics.channelStatus).toBe('Good');
    });
  });
});
