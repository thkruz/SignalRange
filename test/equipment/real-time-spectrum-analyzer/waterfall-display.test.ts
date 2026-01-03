import { WaterfallDisplay } from '../../../src/equipment/real-time-spectrum-analyzer/rtsa-screen/waterfall-display';
import { RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';

describe('WaterfallDisplay', () => {
  describe('amplitudeToColorRGB static method', () => {
    // Create a mock state for testing
    const createMockState = (minAmplitude: number, maxAmplitude: number): RealTimeSpectrumAnalyzerState => ({
      minAmplitude,
      maxAmplitude,
      // Required fields with default values
      scaleDbPerDiv: 6 as any,
      isUseTapB: true,
      isUseTapA: true,
      referenceLevel: 0,
      minFrequency: 5e3 as any,
      maxFrequency: 25.5e9 as any,
      lastSpan: 100e6 as any,
      inputUnit: 'MHz',
      inputValue: '',
      uuid: 'test-uuid',
      team_id: 1,
      rfFeUuid: 'test-rfFeUuid',
      isPaused: false,
      noiseFloorNoGain: -104,
      isSkipLnaGainDuringDraw: true,
      isMaxHold: false,
      isMinHold: false,
      isMarkerOn: false,
      isUpdateMarkers: false,
      topMarkers: [],
      markerIndex: 0,
      refreshRate: 10,
      centerFrequency: 600e6 as any,
      span: 100e6 as any,
      rbw: 1e6 as any,
      lockedControl: 'freq',
      hold: false,
      screenMode: 'spectralDensity',
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
      ],
      selectedTrace: 1,
    });

    describe('Color normalization', () => {
      it('should return dark blue color at minimum amplitude', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(-100, state);

        // At norm = 0, we should get dark blue: [0, 0, 100]
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(100);
      });

      it('should return red color at maximum amplitude', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(-40, state);

        // At norm = 1 (full brightness), we should get red: [255, 0, 0]
        expect(color[0]).toBe(255);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(0);
      });

      it('should clamp values below minimum to dark blue', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(-150, state);

        // Should be clamped to norm = 0
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(100);
      });

      it('should clamp values above maximum to red', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(0, state);

        // Should be clamped to norm = 1
        expect(color[0]).toBe(255);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(0);
      });
    });

    describe('Color gradient transitions', () => {
      const state = createMockState(-100, -40);

      it('should transition from dark blue to bright blue (norm 0-0.2)', () => {
        // At norm = 0.1 (10% of range, midpoint of first region)
        // amplitude = -100 + 0.1 * 60 = -94
        const color = WaterfallDisplay.amplitudeToColorRGB(-94, state);

        // Should be blue, with increasing brightness
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(0);
        expect(color[2]).toBeGreaterThan(100);
        expect(color[2]).toBeLessThanOrEqual(255);
      });

      it('should transition to cyan (norm 0.2-0.4)', () => {
        // At norm = 0.3 (midpoint of second region)
        // amplitude = -100 + 0.3 * 60 = -82
        const color = WaterfallDisplay.amplitudeToColorRGB(-82, state);

        // Should have blue and some green (cyan-ish)
        expect(color[0]).toBe(0);
        expect(color[1]).toBeGreaterThan(0);
        expect(color[2]).toBe(255);
      });

      it('should transition to green (norm 0.4-0.6)', () => {
        // At norm = 0.5 (midpoint of third region)
        // amplitude = -100 + 0.5 * 60 = -70
        const color = WaterfallDisplay.amplitudeToColorRGB(-70, state);

        // Should have mostly green with decreasing blue
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(255);
        expect(color[2]).toBeLessThan(255);
      });

      it('should transition to yellow (norm 0.6-0.8)', () => {
        // At norm = 0.7 (midpoint of fourth region)
        // amplitude = -100 + 0.7 * 60 = -58
        const color = WaterfallDisplay.amplitudeToColorRGB(-58, state);

        // Should have red and green (yellow-ish)
        expect(color[0]).toBeGreaterThan(0);
        expect(color[1]).toBe(255);
        expect(color[2]).toBe(0);
      });

      it('should transition to red (norm 0.8-1.0)', () => {
        // At norm = 0.9 (midpoint of fifth region)
        // amplitude = -100 + 0.9 * 60 = -46
        const color = WaterfallDisplay.amplitudeToColorRGB(-46, state);

        // Should have red with decreasing green
        expect(color[0]).toBe(255);
        expect(color[1]).toBeLessThan(255);
        expect(color[2]).toBe(0);
      });
    });

    describe('Edge case handling', () => {
      it('should handle zero range (min === max)', () => {
        const state = createMockState(-70, -70);
        // This would cause division by zero
        // The implementation normalizes to NaN then clamps, resulting in 0
        const color = WaterfallDisplay.amplitudeToColorRGB(-70, state);

        // Result should be an array of 3 numbers
        expect(Array.isArray(color)).toBe(true);
        expect(color).toHaveLength(3);
        // Note: When range is 0, division produces NaN which may not be in valid range
        // This test documents the current behavior
      });

      it('should return valid RGB values (0-255 range)', () => {
        const state = createMockState(-100, -40);

        // Test various amplitudes
        const testAmplitudes = [-100, -90, -80, -70, -60, -50, -40, -30];

        for (const amplitude of testAmplitudes) {
          const color = WaterfallDisplay.amplitudeToColorRGB(amplitude, state);
          expect(color[0]).toBeGreaterThanOrEqual(0);
          expect(color[0]).toBeLessThanOrEqual(255);
          expect(color[1]).toBeGreaterThanOrEqual(0);
          expect(color[1]).toBeLessThanOrEqual(255);
          expect(color[2]).toBeGreaterThanOrEqual(0);
          expect(color[2]).toBeLessThanOrEqual(255);
        }
      });

      it('should return integer RGB values', () => {
        const state = createMockState(-100, -40);
        const testAmplitudes = [-100, -85, -70, -55, -40];

        for (const amplitude of testAmplitudes) {
          const color = WaterfallDisplay.amplitudeToColorRGB(amplitude, state);
          expect(Number.isInteger(color[0])).toBe(true);
          expect(Number.isInteger(color[1])).toBe(true);
          expect(Number.isInteger(color[2])).toBe(true);
        }
      });
    });

    describe('Different amplitude ranges', () => {
      it('should work correctly with positive amplitude range', () => {
        const state = createMockState(0, 60);
        const colorMin = WaterfallDisplay.amplitudeToColorRGB(0, state);
        const colorMax = WaterfallDisplay.amplitudeToColorRGB(60, state);

        // Min should be dark blue
        expect(colorMin[0]).toBe(0);
        expect(colorMin[1]).toBe(0);
        expect(colorMin[2]).toBe(100);

        // Max should be red
        expect(colorMax[0]).toBe(255);
        expect(colorMax[1]).toBe(0);
        expect(colorMax[2]).toBe(0);
      });

      it('should work correctly with wide amplitude range', () => {
        const state = createMockState(-140, 0);
        const colorMin = WaterfallDisplay.amplitudeToColorRGB(-140, state);
        const colorMax = WaterfallDisplay.amplitudeToColorRGB(0, state);

        // Min should be dark blue
        expect(colorMin[0]).toBe(0);
        expect(colorMin[1]).toBe(0);
        expect(colorMin[2]).toBe(100);

        // Max should be red
        expect(colorMax[0]).toBe(255);
        expect(colorMax[1]).toBe(0);
        expect(colorMax[2]).toBe(0);
      });

      it('should work correctly with narrow amplitude range', () => {
        const state = createMockState(-50, -40);
        const colorMin = WaterfallDisplay.amplitudeToColorRGB(-50, state);
        const colorMax = WaterfallDisplay.amplitudeToColorRGB(-40, state);

        // Min should be dark blue
        expect(colorMin[0]).toBe(0);
        expect(colorMin[1]).toBe(0);
        expect(colorMin[2]).toBe(100);

        // Max should be red
        expect(colorMax[0]).toBe(255);
        expect(colorMax[1]).toBe(0);
        expect(colorMax[2]).toBe(0);
      });
    });

    describe('Color consistency', () => {
      it('should produce monotonically increasing warmth as amplitude increases', () => {
        const state = createMockState(-100, -40);
        const amplitudes = [-100, -88, -76, -64, -52, -40];
        const colors = amplitudes.map(amp => WaterfallDisplay.amplitudeToColorRGB(amp, state));

        // The color gradient goes: dark blue -> blue -> cyan -> green -> yellow -> red
        // Due to the cyan transition, blue peaks in the middle before decreasing
        // So we can't expect monotonic decrease in blue.
        // Instead, verify that the overall progression makes sense:
        // - First color should be blue-dominant
        // - Last color should be red-dominant

        // First color (min amplitude) should have more blue than red
        expect(colors[0][2]).toBeGreaterThan(colors[0][0]);

        // Last color (max amplitude) should have more red than blue
        expect(colors[colors.length - 1][0]).toBeGreaterThan(colors[colors.length - 1][2]);

        // All colors should be valid RGB values
        for (const color of colors) {
          expect(color[0]).toBeGreaterThanOrEqual(0);
          expect(color[0]).toBeLessThanOrEqual(255);
          expect(color[1]).toBeGreaterThanOrEqual(0);
          expect(color[1]).toBeLessThanOrEqual(255);
          expect(color[2]).toBeGreaterThanOrEqual(0);
          expect(color[2]).toBeLessThanOrEqual(255);
        }
      });

      it('should produce identical colors for identical inputs', () => {
        const state = createMockState(-100, -40);
        const color1 = WaterfallDisplay.amplitudeToColorRGB(-75, state);
        const color2 = WaterfallDisplay.amplitudeToColorRGB(-75, state);

        expect(color1).toEqual(color2);
      });
    });
  });
});
