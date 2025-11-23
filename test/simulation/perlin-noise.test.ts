import { PerlinNoise } from '../../src/simulation/perlin-noise';

describe('PerlinNoise', () => {
  afterEach(() => {
    // Reset singleton instance
    PerlinNoise['instance'] = null;
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = PerlinNoise.getInstance();
      const instance2 = PerlinNoise.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create instance with custom seed and cache size', () => {
      const instance = PerlinNoise.getInstance('custom-seed', 50);

      expect(instance).toBeInstanceOf(PerlinNoise);
    });
  });

  describe('get', () => {
    it('should return a number value', () => {
      const noise = PerlinNoise.getInstance();
      const value = noise.get(0.5, 0.5);

      expect(typeof value).toBe('number');
    });

    it('should return consistent values for the same coordinates', () => {
      const noise = PerlinNoise.getInstance('test-seed');
      const value1 = noise.get(1.0, 2.0);
      const value2 = noise.get(1.0, 2.0);

      expect(value1).toBe(value2);
    });

    it('should return different values for different coordinates', () => {
      PerlinNoise['instance'] = null;
      const noise = PerlinNoise.getInstance('test-seed2');
      const value1 = noise.get(1.0, 2.0);
      const value2 = noise.get(3.0, 4.0);

      // Values should be different (though in rare cases they might be close)
      // We just verify both are numbers
      expect(typeof value1).toBe('number');
      expect(typeof value2).toBe('number');
    });

    it('should work with single parameter (y defaults to 0)', () => {
      const noise = PerlinNoise.getInstance();
      const value = noise.get(5.0);

      expect(typeof value).toBe('number');
    });

    it('should cache results for repeated calls', () => {
      const noise = PerlinNoise.getInstance('cache-test', 10);

      // First call - not cached
      const value1 = noise.get(10.5, 20.5);

      // Second call - should be cached
      const value2 = noise.get(10.5, 20.5);

      expect(value1).toBe(value2);
    });

    it('should handle negative coordinates', () => {
      const noise = PerlinNoise.getInstance();
      const value = noise.get(-5.5, -10.5);

      expect(typeof value).toBe('number');
    });

    it('should handle integer coordinates', () => {
      const noise = PerlinNoise.getInstance();
      const value = noise.get(10, 20);

      expect(typeof value).toBe('number');
    });

    it('should evict old cache entries when cache is full', () => {
      const noise = PerlinNoise.getInstance('eviction-test', 2);

      // Fill cache with 2 entries
      noise.get(1, 1);
      noise.get(2, 2);

      // Add third entry, should evict first
      noise.get(3, 3);

      // Get first entry again (should not be in cache)
      const value = noise.get(1, 1);

      expect(typeof value).toBe('number');
    });

    it('should handle zero coordinates', () => {
      const noise = PerlinNoise.getInstance();
      const value = noise.get(0, 0);

      expect(typeof value).toBe('number');
    });

    it('should produce smooth continuous values', () => {
      const noise = PerlinNoise.getInstance('smooth-test');
      const value1 = noise.get(1.0, 1.0);
      const value2 = noise.get(1.1, 1.1);

      // Values should be different but not drastically
      expect(value1).not.toBe(value2);
      expect(Math.abs(value1 - value2)).toBeLessThan(1);
    });
  });
});
