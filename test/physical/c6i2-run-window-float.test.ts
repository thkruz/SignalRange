import { type RunPowerRecord, runHeldReserve } from '@app/physical/run-power';
import { describe, expect, it } from 'vitest';

describe('runHeldReserve float tolerance', () => {
  it('accepts a run whose duration is the window to within float error', () => {
    const startS = 971.0333333333334;
    const endS = 1091.0333333333333;
    expect(endS - startS).toBeLessThan(120);
    const power = {
      window: { untilS: endS, startS, endS, startStoredWh: 329, minStoredWh: 325, endStoredWh: 325, loadWh: 4, chargeWh: 0, clippedWh: 0, fuelUsedL: 0, steps: 120 },
      reserveWh: 200,
      basis: 'battery-only',
      forecastWh: 4,
      complete: true,
    } as unknown as RunPowerRecord;
    expect(runHeldReserve(power, startS, endS, 120)).toBe(true);
  });
});
