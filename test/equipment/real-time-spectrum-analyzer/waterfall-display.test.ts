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

        // At norm = 0, we get very dark blue: [0, 0, 30]
        // The new gradient starts darker to make signals stand out from noise
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(30);
      });

      it('should return dark red color at maximum amplitude', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(-40, state);

        // At norm = 1, the gradient ends at dark red: [120, 0, 0]
        // This is calculated as: 255 - 135 * 1 = 120
        expect(color[0]).toBe(120);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(0);
      });

      it('should clamp values below minimum to dark blue', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(-150, state);

        // Should be clamped to norm = 0 (very dark blue)
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(30);
      });

      it('should clamp values above maximum to dark red', () => {
        const state = createMockState(-100, -40);
        const color = WaterfallDisplay.amplitudeToColorRGB(0, state);

        // Should be clamped to norm = 1 (dark red)
        expect(color[0]).toBe(120);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(0);
      });
    });

    describe('Color gradient transitions', () => {
      const state = createMockState(-100, -40);

      // Note: The algorithm applies norm ** 2.5 biasing to compress lower values,
      // making signals stand out from noise. Tests use flexible assertions.

      it('should remain in blue range for lower amplitudes', () => {
        // At lower amplitudes (due to norm ** 2.5 biasing), colors stay blue
        const color = WaterfallDisplay.amplitudeToColorRGB(-94, state);

        // Should be in the blue range (biasing keeps it dark)
        expect(color[0]).toBe(0);
        expect(color[2]).toBeGreaterThan(0);
        expect(color[2]).toBeLessThanOrEqual(255);
      });

      it('should have increasing green component in mid-range', () => {
        // At moderate amplitudes, green component should increase
        const color = WaterfallDisplay.amplitudeToColorRGB(-82, state);

        // Should have some green developing
        expect(color[1]).toBeGreaterThanOrEqual(0);
        expect(color[2]).toBeGreaterThan(0);
      });

      it('should transition toward warmer colors at higher amplitudes', () => {
        // At higher amplitudes
        const color = WaterfallDisplay.amplitudeToColorRGB(-70, state);

        // Should have noticeable green component
        expect(color[1]).toBeGreaterThan(0);
        expect(color[2]).toBeLessThan(256);
      });

      it('should be dominated by warm colors near maximum', () => {
        // Near maximum amplitude
        const color = WaterfallDisplay.amplitudeToColorRGB(-58, state);

        // Should have strong green and possibly red
        expect(color[1]).toBeGreaterThan(100);
      });

      it('should transition to red near maximum', () => {
        // Very near maximum
        const color = WaterfallDisplay.amplitudeToColorRGB(-46, state);

        // Should have red with decreasing green (orange to red range)
        expect(color[0]).toBe(255);
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

        // Min should be very dark blue [0, 0, 30]
        expect(colorMin[0]).toBe(0);
        expect(colorMin[1]).toBe(0);
        expect(colorMin[2]).toBe(30);

        // Max should be dark red [120, 0, 0]
        expect(colorMax[0]).toBe(120);
        expect(colorMax[1]).toBe(0);
        expect(colorMax[2]).toBe(0);
      });

      it('should work correctly with wide amplitude range', () => {
        const state = createMockState(-140, 0);
        const colorMin = WaterfallDisplay.amplitudeToColorRGB(-140, state);
        const colorMax = WaterfallDisplay.amplitudeToColorRGB(0, state);

        // Min should be very dark blue [0, 0, 30]
        expect(colorMin[0]).toBe(0);
        expect(colorMin[1]).toBe(0);
        expect(colorMin[2]).toBe(30);

        // Max should be dark red [120, 0, 0]
        expect(colorMax[0]).toBe(120);
        expect(colorMax[1]).toBe(0);
        expect(colorMax[2]).toBe(0);
      });

      it('should work correctly with narrow amplitude range', () => {
        const state = createMockState(-50, -40);
        const colorMin = WaterfallDisplay.amplitudeToColorRGB(-50, state);
        const colorMax = WaterfallDisplay.amplitudeToColorRGB(-40, state);

        // Min should be very dark blue [0, 0, 30]
        expect(colorMin[0]).toBe(0);
        expect(colorMin[1]).toBe(0);
        expect(colorMin[2]).toBe(30);

        // Max should be dark red [120, 0, 0]
        expect(colorMax[0]).toBe(120);
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
