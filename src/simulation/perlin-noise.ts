import { fnv1a } from './rng';

/**
 * 2D gradient (Perlin) noise with a string seed. Output is zero-mean, within
 * about ±0.5 along one axis and ±1 in 2D.
 *
 * Each caller owns its instance: the seed must name both the run and the
 * process being modelled (e.g. `${Rng.getSeed()}:${signalId}`), and the input
 * coordinate must be scenario time, never wall clock, or a run is not
 * reproducible.
 */
export class PerlinNoise {
  private readonly seed_: string;

  constructor(seed: string) {
    this.seed_ = seed;
  }

  get seed(): string {
    return this.seed_;
  }

  private fade_(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp_(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad_(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  private hash_(x: number, y: number): number {
    return fnv1a(`${this.seed_}:${x}:${y}`);
  }

  get(x: number, y = 0): number {
    // Find unit grid cell containing point
    const X = Math.floor(x);
    const Y = Math.floor(y);

    // Relative x, y in cell
    const xf = x - X;
    const yf = y - Y;

    // Gradients at the 4 corners
    const gradAA = this.grad_(this.hash_(X, Y), xf, yf);
    const gradBA = this.grad_(this.hash_(X + 1, Y), xf - 1, yf);
    const gradAB = this.grad_(this.hash_(X, Y + 1), xf, yf - 1);
    const gradBB = this.grad_(this.hash_(X + 1, Y + 1), xf - 1, yf - 1);

    // Fade curves
    const u = this.fade_(xf);
    const v = this.fade_(yf);

    // Interpolate
    const x1 = this.lerp_(gradAA, gradBA, u);
    const x2 = this.lerp_(gradAB, gradBB, u);

    return this.lerp_(x1, x2, v);
  }
}
