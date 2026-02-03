import { RTSAScreen } from '../../../src/equipment/real-time-spectrum-analyzer/rtsa-screen/rtsa-screen';

// We can't instantiate the abstract RTSAScreen directly, but we can test its static methods

describe('RTSAScreen', () => {
  describe('rgb2hex static method', () => {
    it('should convert RGB array [0,0,0] to #000000', () => {
      expect(RTSAScreen.rgb2hex([0, 0, 0])).toBe('#000000');
    });

    it('should convert RGB array [255,255,255] to #ffffff', () => {
      expect(RTSAScreen.rgb2hex([255, 255, 255])).toBe('#ffffff');
    });

    it('should convert RGB array [255,0,0] to #ff0000', () => {
      expect(RTSAScreen.rgb2hex([255, 0, 0])).toBe('#ff0000');
    });

    it('should convert RGB array [0,255,0] to #00ff00', () => {
      expect(RTSAScreen.rgb2hex([0, 255, 0])).toBe('#00ff00');
    });

    it('should convert RGB array [0,0,255] to #0000ff', () => {
      expect(RTSAScreen.rgb2hex([0, 0, 255])).toBe('#0000ff');
    });

    it('should convert RGB array [128,64,32] to #804020', () => {
      expect(RTSAScreen.rgb2hex([128, 64, 32])).toBe('#804020');
    });

    it('should pad single digit hex values with leading zero', () => {
      expect(RTSAScreen.rgb2hex([1, 2, 3])).toBe('#010203');
    });

    it('should handle boundary values at 15 (single hex digit)', () => {
      expect(RTSAScreen.rgb2hex([15, 15, 15])).toBe('#0f0f0f');
    });

    it('should handle values at 16 (two hex digits)', () => {
      expect(RTSAScreen.rgb2hex([16, 16, 16])).toBe('#101010');
    });
  });

  describe('getRandomRgb static method', () => {
    it('should return a valid hex color string for index 0', () => {
      const color = RTSAScreen.getRandomRgb(0);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should return a valid hex color string for index 1', () => {
      const color = RTSAScreen.getRandomRgb(1);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should return a valid hex color string for index 2', () => {
      const color = RTSAScreen.getRandomRgb(2);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('should produce different colors for different indices', () => {
      const color0 = RTSAScreen.getRandomRgb(0);
      const color1 = RTSAScreen.getRandomRgb(1);
      const color2 = RTSAScreen.getRandomRgb(2);

      // At least some colors should be different
      const uniqueColors = new Set([color0, color1, color2]);
      expect(uniqueColors.size).toBeGreaterThan(1);
    });

    it('should handle larger indices', () => {
      const color100 = RTSAScreen.getRandomRgb(100);
      expect(color100).toMatch(/^#[0-9a-f]{6}$/);
    });

    describe('color distribution by modulo 3', () => {
      it('should produce red-heavy colors for i % 3 === 0', () => {
        // For i % 3 === 0: rgb[0] = 255
        const color = RTSAScreen.getRandomRgb(0);
        // The color should have ff as the first component
        expect(color.slice(1, 3)).toBe('ff');
      });

      it('should produce blue-heavy colors for i % 3 === 1', () => {
        // For i % 3 === 1: rgb[2] = 255
        const color = RTSAScreen.getRandomRgb(1);
        // The color should have ff as the last component
        expect(color.slice(5, 7)).toBe('ff');
      });

      it('should produce green-heavy colors for i % 3 === 2', () => {
        // For i % 3 === 2: rgb[1] = 255
        const color = RTSAScreen.getRandomRgb(2);
        // The color should have ff as the middle component
        expect(color.slice(3, 5)).toBe('ff');
      });
    });

    it('should produce consistent colors for the same index', () => {
      const color1 = RTSAScreen.getRandomRgb(42);
      const color2 = RTSAScreen.getRandomRgb(42);
      expect(color1).toBe(color2);
    });

    it('should cycle through color patterns', () => {
      // Test that colors follow the modulo 3 pattern
      const colorMod0 = RTSAScreen.getRandomRgb(3); // 3 % 3 === 0
      const colorMod1 = RTSAScreen.getRandomRgb(4); // 4 % 3 === 1
      const colorMod2 = RTSAScreen.getRandomRgb(5); // 5 % 3 === 2

      // Mod 0 should have red = 255
      expect(colorMod0.slice(1, 3)).toBe('ff');
      // Mod 1 should have blue = 255
      expect(colorMod1.slice(5, 7)).toBe('ff');
      // Mod 2 should have green = 255
      expect(colorMod2.slice(3, 5)).toBe('ff');
    });
  });

  describe('Color Generation Algorithm', () => {
    it('should generate colors using deterministic formula based on index', () => {
      // For i % 3 === 0: rgb = [255, (i * 32) % 255, (i * 64) % 255]
      // For i = 0: rgb = [255, 0, 0]
      expect(RTSAScreen.getRandomRgb(0)).toBe('#ff0000');

      // For i = 3: rgb = [255, 96, 192]
      // (3 * 32) % 255 = 96 = 0x60
      // (3 * 64) % 255 = 192 = 0xc0
      expect(RTSAScreen.getRandomRgb(3)).toBe('#ff60c0');
    });

    it('should generate valid colors for edge case indices', () => {
      // Test very large index
      const largeIndex = 1000;
      const color = RTSAScreen.getRandomRgb(largeIndex);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
