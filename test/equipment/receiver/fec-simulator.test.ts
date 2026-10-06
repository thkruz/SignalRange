import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FECSimulator, FECSimulatorInput } from '../../../src/equipment/receiver/fec-simulator';
import { SimClock } from '../../../src/simulation/sim-clock';

describe('FECSimulator', () => {
  let nowMs = 0;

  const good: FECSimulatorInput = { cnRatio_dB: 18, hasCarrier: true, hasLock: true, modulation: 'QPSK', fec: '1/2' };
  const bad: FECSimulatorInput = { cnRatio_dB: 2, hasCarrier: true, hasLock: true, modulation: 'QPSK', fec: '1/2' };
  const lost: FECSimulatorInput = { cnRatio_dB: -5, hasCarrier: true, hasLock: false, modulation: 'QPSK', fec: '1/2' };

  /** Advance the sim clock and take one sample, as the 1 Hz payload adapter does. */
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

  it('reports whole-number RS uncorrectable (CRC error) counts', () => {
    const sim = new FECSimulator();
    sim.calculate(bad);

    for (let i = 0; i < 10; i++) {
      const metrics = sampleAfter(sim, bad, 1000);
      expect(Number.isInteger(metrics.rsUncorrectableBlocks)).toBe(true);
      expect(Number.isInteger(metrics.rsCorrectedErrors)).toBe(true);
    }

    // While the decaying counter clears after recovery, it stays an integer
    for (let i = 0; i < 10; i++) {
      const metrics = sampleAfter(sim, good, 1000);
      expect(Number.isInteger(metrics.rsUncorrectableBlocks)).toBe(true);
    }
  });

  it('shows a BER rise within a couple of samples', () => {
    const sim = new FECSimulator();
    sim.calculate(good);

    sampleAfter(sim, bad, 1000);
    const metrics = sampleAfter(sim, bad, 1000);

    expect(metrics.ber).toBeGreaterThan(1e-3);
  });

  it('smooths BER on a time constant of a few seconds, not a per-call alpha', () => {
    const sim = new FECSimulator();
    sim.calculate(good);

    // Degrade for a long time so the smoothed BER sits at the bad value
    for (let i = 0; i < 30; i++) {
      sampleAfter(sim, bad, 1000);
    }

    // Recover (lock held throughout, so no reset): within a few tau the BER has cleared
    let metrics = sim.calculate(good);
    for (let i = 0; i < 8; i++) {
      metrics = sampleAfter(sim, good, 1000);
    }

    expect(FECSimulator.SMOOTHING_TAU_MS).toBeGreaterThanOrEqual(2000);
    expect(FECSimulator.SMOOTHING_TAU_MS).toBeLessThanOrEqual(3000);
    expect(metrics.ber).toBeLessThan(1e-5);
    expect(metrics.rsUncorrectableBlocks).toBe(0);
    expect(metrics.channelStatus).toBe('Good');
  });

  it('does not move the smoothed BER when no time has passed', () => {
    const sim = new FECSimulator();
    const first = sim.calculate(bad);
    const second = sim.calculate(good);

    expect(second.ber / first.ber).toBeCloseTo(1, 9);
  });

  it('resets the payload metrics when the modem re-acquires lock', () => {
    const sim = new FECSimulator();
    sim.calculate(good);

    // Lose lock with a dead carrier for a while: BER and uncorrectables pile up
    let metrics = sim.calculate(lost);
    for (let i = 0; i < 20; i++) {
      metrics = sampleAfter(sim, lost, 1000);
    }
    expect(metrics.frameSyncLocked).toBe(false);
    expect(metrics.channelStatus).toBe('No Lock');

    // First sample after re-lock on a clean carrier reads clean immediately
    metrics = sampleAfter(sim, good, 1000);

    expect(metrics.frameSyncLocked).toBe(true);
    expect(metrics.ber).toBeLessThan(1e-5);
    expect(metrics.rsUncorrectableBlocks).toBe(0);
    expect(metrics.channelStatus).toBe('Good');
  });

  it('seeds a fresh simulator from the current signal on its first sample', () => {
    const metrics = new FECSimulator().calculate(bad);

    // Raw BER at 2 dB C/N QPSK is far above 1e-3, not 10% of it
    expect(metrics.ber).toBeGreaterThan(1e-2);
  });
});
