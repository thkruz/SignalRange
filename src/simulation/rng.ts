/**
 * @file rng - Seeded, named random streams
 * @description Every random draw in the engine comes from a named stream so a
 * scenario replays identically for a given seed (Phase 19.0).
 *
 * Each stream is seeded from `hash(seed + ':' + name)`, so adding a draw in one
 * module never shifts the sequence another module sees. Streams are created
 * lazily and dropped when the seed changes; callers should look a stream up
 * with `Rng.stream(name)` at the point of use rather than caching it across
 * scenarios, because scenario objects (satellites) outlive a scenario load.
 *
 * Seed policy (plan Q2): `?seed=` URL override, else `ScenarioData.seed`, else
 * FNV-1a of the scenario id - see resolveScenarioSeed().
 *
 * Streams that feed display-only noise (analyzer grass, constellation scatter)
 * are drawn per rendered frame, so they are reproducible only at a fixed frame
 * rate. Keep them on their own `display:` streams so they never perturb the
 * simulation streams.
 */

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** SplitMix32 step, used to expand one 32-bit seed into the generator state. */
function splitMix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) | 0;
  let z = state.s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);

  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * One independent random sequence (sfc32 generator).
 */
export class RngStream {
  private a_: number;
  private b_: number;
  private c_: number;
  private d_: number;
  private spareGaussian_: number | null = null;

  constructor(seed: number) {
    const state = { s: seed >>> 0 };
    this.a_ = splitMix32(state);
    this.b_ = splitMix32(state);
    this.c_ = splitMix32(state);
    this.d_ = splitMix32(state);
    // Discard the first outputs; sfc32 mixes poorly for a few rounds
    for (let i = 0; i < 12; i++) {
      this.next();
    }
  }

  /** Uniform in [0, 1). Drop-in for Math.random(). */
  next(): number {
    const t = (((this.a_ + this.b_) | 0) + this.d_) | 0;
    this.d_ = (this.d_ + 1) | 0;
    this.a_ = this.b_ ^ (this.b_ >>> 9);
    this.b_ = (this.c_ + (this.c_ << 3)) | 0;
    this.c_ = (this.c_ << 21) | (this.c_ >>> 11);
    this.c_ = (this.c_ + t) | 0;

    return (t >>> 0) / 4294967296;
  }

  /** Uniform in [min, max). */
  uniform(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Standard normal draw (Box-Muller; the second value is kept for the next call). */
  gaussian(): number {
    if (this.spareGaussian_ !== null) {
      const spare = this.spareGaussian_;
      this.spareGaussian_ = null;

      return spare;
    }

    let u1 = 0;
    while (u1 === 0) {
      u1 = this.next();
    }
    const u2 = this.next();
    const r = Math.sqrt(-2 * Math.log(u1));
    this.spareGaussian_ = r * Math.sin(2 * Math.PI * u2);

    return r * Math.cos(2 * Math.PI * u2);
  }

  /** Fisher-Yates shuffle, in place. Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }

    return items;
  }
}

/** Seed used before any scenario sets one (menus, unit tests). */
const DEFAULT_SEED = fnv1a('signal-range');

let currentSeed_ = DEFAULT_SEED;
const streams_ = new Map<string, RngStream>();

export const Rng = {
  /** Set the run seed and drop every stream so each restarts from it. */
  setSeed(seed: number): void {
    currentSeed_ = seed >>> 0;
    streams_.clear();
  },

  getSeed(): number {
    return currentSeed_;
  },

  /** The named stream for the current seed, created on first use. */
  stream(name: string): RngStream {
    let stream = streams_.get(name);
    if (!stream) {
      stream = new RngStream(fnv1a(`${currentSeed_}:${name}`));
      streams_.set(name, stream);
    }

    return stream;
  },

  /**
   * A fixed value in [0, 1) for a key, independent of the seed and of draw
   * order. For properties that belong to an object rather than to a run
   * (a satellite's default polarization skew).
   */
  hashUniform(key: string): number {
    return new RngStream(fnv1a(key)).next();
  },

  /** Back to the default seed. For tests and scenario teardown. */
  reset(): void {
    Rng.setSeed(DEFAULT_SEED);
  },
};

/**
 * The seed for a scenario run: `?seed=` URL override, else the authored seed,
 * else FNV-1a of the scenario id. A non-numeric `?seed=` is hashed.
 */
export function resolveScenarioSeed(scenarioId: string, authoredSeed?: number, search = globalThis.location?.search ?? ''): number {
  const override = new URLSearchParams(search).get('seed');
  if (override !== null && override !== '') {
    const numeric = Number(override);

    return Number.isInteger(numeric) ? numeric >>> 0 : fnv1a(override);
  }

  if (authoredSeed !== undefined) {
    return authoredSeed >>> 0;
  }

  return fnv1a(scenarioId);
}
