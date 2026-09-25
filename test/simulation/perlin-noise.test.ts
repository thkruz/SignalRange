import { PerlinNoise } from '../../src/simulation/perlin-noise';

describe('PerlinNoise', () => {
  it('returns the same value for the same seed and coordinates', () => {
    expect(new PerlinNoise('a').get(1.3, 2.7)).toBe(new PerlinNoise('a').get(1.3, 2.7));
  });

  it('differs between seeds', () => {
    const a = new PerlinNoise('a');
    const b = new PerlinNoise('b');
    const differs = [0.5, 1.5, 2.5, 3.5, 4.5].some((x) => a.get(x) !== b.get(x));

    expect(differs).toBe(true);
  });

  it('is zero at lattice points', () => {
    const noise = new PerlinNoise('lattice');

    expect(noise.get(3, 0)).toBeCloseTo(0, 12);
    expect(noise.get(-7, 0)).toBeCloseTo(0, 12);
  });

  it('is continuous', () => {
    const noise = new PerlinNoise('smooth');

    for (let x = 0; x < 10; x += 0.37) {
      expect(Math.abs(noise.get(x) - noise.get(x + 0.001))).toBeLessThan(0.01);
    }
  });

  it('is zero-mean and bounded along one axis', () => {
    const noise = new PerlinNoise('stats');
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const value = noise.get(i * 0.173);
      expect(Math.abs(value)).toBeLessThanOrEqual(0.5 + 1e-9);
      sum += value;
    }

    expect(Math.abs(sum / n)).toBeLessThan(0.02);
  });
});
