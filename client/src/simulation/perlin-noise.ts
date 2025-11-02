export class PerlinNoise {
  private static instance: PerlinNoise | null = null;

  private readonly seed: string;
  private readonly cache: Map<string, number>;
  private cacheOrder: string[];
  private readonly cacheSize: number;

  private constructor(seed: string, cacheSize = 100) {
    this.seed = seed;
    this.cache = new Map();
    this.cacheOrder = [];
    this.cacheSize = cacheSize;
  }

  static getInstance(seed = "default", cacheSize = 100): PerlinNoise {
    PerlinNoise.instance ??= new PerlinNoise(seed, cacheSize);
    return PerlinNoise.instance;
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  private hash(x: number, y: number): number {
    // Simple deterministic hash based on seed and coordinates
    const str = `${this.seed}:${x}:${y}`;
    // Simple internal hash function (FNV-1a)
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.codePointAt(i) ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    // Convert to hex string
    const hex = ("00000000" + (hash >>> 0).toString(16)).slice(-8);
    return parseInt(hex.slice(0, 8), 16);
  }

  get(x: number, y = 0): number {
    const key = `${x},${y}`;
    if (this.cache.has(key)) {
      // Move to end (most recent)
      this.cacheOrder = this.cacheOrder.filter(k => k !== key);
      this.cacheOrder.push(key);
      return this.cache.get(key)!;
    }

    // Find unit grid cell containing point
    const X = Math.floor(x);
    const Y = Math.floor(y);

    // Relative x, y in cell
    const xf = x - X;
    const yf = y - Y;

    // Hash coordinates of the 4 corners
    const aa = this.hash(X, Y);
    const ab = this.hash(X, Y + 1);
    const ba = this.hash(X + 1, Y);
    const bb = this.hash(X + 1, Y + 1);

    // Compute gradients
    const gradAA = this.grad(aa, xf, yf);
    const gradBA = this.grad(ba, xf - 1, yf);
    const gradAB = this.grad(ab, xf, yf - 1);
    const gradBB = this.grad(bb, xf - 1, yf - 1);

    // Fade curves
    const u = this.fade(xf);
    const v = this.fade(yf);

    // Interpolate
    const x1 = this.lerp(gradAA, gradBA, u);
    const x2 = this.lerp(gradAB, gradBB, u);
    const value = this.lerp(x1, x2, v);

    // Cache result
    this.cache.set(key, value);
    this.cacheOrder.push(key);
    if (this.cacheOrder.length > this.cacheSize) {
      const oldest = this.cacheOrder.shift()!;
      this.cache.delete(oldest);
    }

    return value;
  }
}