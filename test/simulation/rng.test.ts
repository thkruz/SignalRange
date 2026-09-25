import { fnv1a, Rng, RngStream, resolveScenarioSeed } from '../../src/simulation/rng';

describe('RngStream', () => {
  it('replays the same sequence for the same seed', () => {
    const a = new RngStream(42);
    const b = new RngStream(42);

    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('draws uniformly in [0, 1)', () => {
    const rng = new RngStream(7);
    const bins = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      bins[Math.floor(x * 10)]++;
    }

    for (const count of bins) {
      expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
    }
  });

  it('draws a standard normal', () => {
    const rng = new RngStream(3);
    let sum = 0;
    let sumSq = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const x = rng.gaussian();
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;

    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sumSq / n - mean * mean - 1)).toBeLessThan(0.03);
  });

  it('shuffles in place into a permutation', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = new RngStream(9).shuffle([...items]);

    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });
});

describe('Rng', () => {
  it('gives each name its own stream, so draws in one never shift another', () => {
    Rng.setSeed(1234);
    const alone = [Rng.stream('b').next(), Rng.stream('b').next()];

    Rng.setSeed(1234);
    Rng.stream('a').next();
    Rng.stream('a').next();
    const interleaved = [Rng.stream('b').next(), Rng.stream('b').next()];

    expect(interleaved).toEqual(alone);
  });

  it('restarts every stream when the seed is set', () => {
    Rng.setSeed(5);
    const first = Rng.stream('x').next();
    Rng.stream('x').next();
    Rng.setSeed(5);

    expect(Rng.stream('x').next()).toBe(first);
  });

  it('differs between seeds', () => {
    Rng.setSeed(1);
    const one = Rng.stream('x').next();
    Rng.setSeed(2);

    expect(Rng.stream('x').next()).not.toBe(one);
  });

  it('hashUniform depends only on the key', () => {
    Rng.setSeed(1);
    const a = Rng.hashUniform('satellite-rotation:25544');
    Rng.setSeed(2);

    expect(Rng.hashUniform('satellite-rotation:25544')).toBe(a);
  });
});

describe('resolveScenarioSeed', () => {
  it('defaults to FNV-1a of the scenario id', () => {
    expect(resolveScenarioSeed('nats-eu-scenario3', undefined, '')).toBe(fnv1a('nats-eu-scenario3'));
  });

  it('prefers the authored seed', () => {
    expect(resolveScenarioSeed('nats-eu-scenario3', 99, '')).toBe(99);
  });

  it('lets ?seed= override both, hashing non-numeric values', () => {
    expect(resolveScenarioSeed('s', 99, '?seed=7')).toBe(7);
    expect(resolveScenarioSeed('s', 99, '?seed=storm')).toBe(fnv1a('storm'));
  });
});
