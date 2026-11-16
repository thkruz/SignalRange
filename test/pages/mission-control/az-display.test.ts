import { describe, expect, it } from 'vitest';
import { wrapAzimuthDeg } from '../../../src/pages/mission-control/az-display';

describe('wrapAzimuthDeg', () => {
  it('wraps to 0-360', () => {
    expect(wrapAzimuthDeg(-80.7)).toBeCloseTo(279.3, 5);
    expect(wrapAzimuthDeg(458.4)).toBeCloseTo(98.4, 5);
    expect(wrapAzimuthDeg(360)).toBe(0);
    expect(wrapAzimuthDeg(12)).toBe(12);
  });
});
