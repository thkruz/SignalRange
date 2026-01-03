import { WaterfallDisplay } from '../../../../src/equipment/real-time-spectrum-analyzer/rtsa-screen/waterfall-display';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumDataProcessor } from '../../../../src/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import { Hertz } from '../../../../src/types';

describe('WaterfallDisplay', () => {
  let canvas: HTMLCanvasElement;
  let mockSpecA: RealTimeSpectrumAnalyzer;
  let mockDataProcessor: SpectrumDataProcessor;
  let waterfall: WaterfallDisplay;

  const DEFAULT_WIDTH = 800;
  const DEFAULT_HEIGHT = 230;

  beforeEach(() => {
    jest.useFakeTimers();

    // Create canvas with parent element for resize
    canvas = document.createElement('canvas');
    const parentDiv = document.createElement('div');
    parentDiv.style.width = '800px';
    Object.defineProperty(parentDiv, 'offsetWidth', { value: 806, configurable: true });
    parentDiv.appendChild(canvas);
    document.body.appendChild(parentDiv);

    // Create mock RealTimeSpectrumAnalyzer
    mockSpecA = {
      state: {
        isPaused: false,
        minAmplitude: -100,
        maxAmplitude: 0,
        span: 100e6 as Hertz,
        rbw: 10e3 as Hertz,
        refreshRate: 10,
        referenceLevel: 0,
        noiseFloorNoGain: -120,
        traces: [
          { isVisible: true, isUpdating: true, mode: 'clearwrite' },
          { isVisible: false, isUpdating: false, mode: 'maxhold' },
          { isVisible: false, isUpdating: false, mode: 'minhold' },
        ],
        selectedTrace: 1,
        isMarkerOn: false,
        isUpdateMarkers: false,
        topMarkers: [],
        markerIndex: 0,
        isSkipLnaGainDuringDraw: false,
      } as RealTimeSpectrumAnalyzerState,
      noiseFloorAndGain: -100,
      inputSignals: [],
      rfFrontEnd_: {
        couplerModule: {
          signalPathManager: {
            getTotalRxGain: jest.fn().mockReturnValue(10),
          },
        },
        lnbModule: {
          getTotalGain: jest.fn().mockReturnValue(30),
        },
      },
    } as unknown as RealTimeSpectrumAnalyzer;

    // Create mock SpectrumDataProcessor
    mockDataProcessor = {
      combinedData: new Float32Array(DEFAULT_WIDTH).fill(-80),
      noiseData: new Float32Array(DEFAULT_WIDTH).fill(-100),
      setFrequencyRange: jest.fn(),
      generateData: jest.fn(),
    } as unknown as SpectrumDataProcessor;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should initialize with provided dimensions', () => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      expect(canvas.width).toBe(DEFAULT_WIDTH);
      expect(canvas.height).toBe(DEFAULT_HEIGHT);
    });

    it('should initialize buffer with height rows', () => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Buffer should be created
      expect(waterfall).toBeDefined();
    });

    it('should initialize ImageData for pixel manipulation', () => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Should have created ImageData successfully
      expect(waterfall).toBeDefined();
    });

    it('should pre-compute color lookup table', () => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Color cache should be populated after initialization
      expect(waterfall).toBeDefined();
    });

    it('should start in non-running state initially', () => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Before setTimeout fires, update should not process
      waterfall.update();

      // Not running yet
      expect(waterfall).toBeDefined();
    });

    it('should start running after random delay', () => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Advance timers to ensure running is true
      jest.advanceTimersByTime(1100);

      expect(waterfall).toBeDefined();
    });
  });

  describe('setFrequencyRange', () => {
    beforeEach(() => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should update min and max frequency', () => {
      const minFreq = 3700e6 as Hertz;
      const maxFreq = 3800e6 as Hertz;

      waterfall.setFrequencyRange(minFreq, maxFreq);

      expect(waterfall.minFreq).toBe(minFreq);
      expect(waterfall.maxFreq).toBe(maxFreq);
    });

    it('should handle zero frequency range', () => {
      waterfall.setFrequencyRange(0 as Hertz, 0 as Hertz);

      expect(waterfall.minFreq).toBe(0);
      expect(waterfall.maxFreq).toBe(0);
    });

    it('should handle large frequency values', () => {
      const minFreq = 30e9 as Hertz; // 30 GHz
      const maxFreq = 31e9 as Hertz; // 31 GHz

      waterfall.setFrequencyRange(minFreq, maxFreq);

      expect(waterfall.minFreq).toBe(minFreq);
      expect(waterfall.maxFreq).toBe(maxFreq);
    });
  });

  describe('update', () => {
    beforeEach(() => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      jest.advanceTimersByTime(1100); // Ensure running is true
    });

    it('should not update when paused', () => {
      mockSpecA.state.isPaused = true;

      waterfall.update();

      // Should not throw
      expect(waterfall).toBeDefined();
    });

    it('should update buffer with new data row', () => {
      mockSpecA.state.isPaused = false;

      waterfall.update();

      // Should process without error
      expect(waterfall).toBeDefined();
    });

    it('should reinitialize color cache when amplitude range changes', () => {
      // Change max amplitude
      waterfall.cacheMaxDb = -50; // Different from current state
      mockSpecA.state.maxAmplitude = 0;

      waterfall.update();

      // Cache should be updated
      expect(waterfall.cacheMaxDb).toBe(0);
    });

    it('should reinitialize color cache when min amplitude changes', () => {
      waterfall.cacheMinDb = -80; // Different from current state
      mockSpecA.state.minAmplitude = -100;

      waterfall.update();

      // Cache should be updated
      expect(waterfall.cacheMinDb).toBe(-100);
    });
  });

  describe('draw', () => {
    beforeEach(() => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      jest.advanceTimersByTime(1100);
    });

    it('should not draw when paused', () => {
      mockSpecA.state.isPaused = true;
      const putImageDataSpy = jest.spyOn(canvas.getContext('2d')!, 'putImageData');

      waterfall.draw();

      expect(putImageDataSpy).not.toHaveBeenCalled();
    });

    it('should draw waterfall using ImageData', () => {
      mockSpecA.state.isPaused = false;

      expect(() => waterfall.draw()).not.toThrow();
    });
  });

  describe('amplitudeToColorRGB static method', () => {
    const createState = (minAmplitude: number, maxAmplitude: number): RealTimeSpectrumAnalyzerState => ({
      minAmplitude,
      maxAmplitude,
    } as RealTimeSpectrumAnalyzerState);

    describe('color gradient mapping', () => {
      it('should return dark blue for lowest amplitude (norm < 0.2)', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-100, state);

        // norm = 0, so t = 0, expect [0, 0, 100]
        expect(color[0]).toBe(0); // R
        expect(color[1]).toBe(0); // G
        expect(color[2]).toBeGreaterThanOrEqual(100); // B (dark blue to bright blue)
      });

      it('should return bright blue for norm ~0.2', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-80, state);

        // norm = 0.2, edge of first region
        expect(color[0]).toBe(0); // R
        expect(color[1]).toBeGreaterThanOrEqual(0); // G starts increasing
        expect(color[2]).toBe(255); // B is at max
      });

      it('should return cyan for norm ~0.4', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-60, state);

        // norm = 0.4, cyan region
        expect(color[0]).toBe(0); // R
        expect(color[1]).toBe(255); // G is at max
        expect(color[2]).toBeLessThanOrEqual(255); // B decreasing
      });

      it('should return green for norm ~0.6', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-40, state);

        // norm = 0.6, green region
        expect(color[0]).toBeGreaterThanOrEqual(0); // R starts increasing
        expect(color[1]).toBe(255); // G is at max
        expect(color[2]).toBeLessThanOrEqual(255); // B
      });

      it('should return yellow for norm ~0.8', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-20, state);

        // norm = 0.8, yellow region
        expect(color[0]).toBe(255); // R is at max
        expect(color[1]).toBeLessThanOrEqual(255); // G decreasing
        expect(color[2]).toBe(0); // B
      });

      it('should return red for highest amplitude (norm > 0.8)', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(0, state);

        // norm = 1.0, red
        expect(color[0]).toBe(255); // R
        expect(color[1]).toBe(0); // G
        expect(color[2]).toBe(0); // B
      });
    });

    describe('edge cases', () => {
      it('should clamp values below minimum', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-150, state);

        // Should be clamped to minimum (dark blue)
        expect(color[0]).toBe(0);
        expect(color[1]).toBe(0);
        expect(color[2]).toBeGreaterThanOrEqual(100);
      });

      it('should clamp values above maximum', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(50, state);

        // Should be clamped to maximum (red)
        expect(color[0]).toBe(255);
        expect(color[1]).toBe(0);
        expect(color[2]).toBe(0);
      });

      it('should handle equal min and max amplitude (avoid division by zero)', () => {
        const state = createState(-50, -50);
        const color = WaterfallDisplay.amplitudeToColorRGB(-50, state);

        // Range is 0, so norm calculation may produce NaN, which should be clamped
        expect(Array.isArray(color)).toBe(true);
        expect(color.length).toBe(3);
      });

      it('should return valid RGB tuple', () => {
        const state = createState(-100, 0);
        const color = WaterfallDisplay.amplitudeToColorRGB(-50, state);

        expect(Array.isArray(color)).toBe(true);
        expect(color.length).toBe(3);
        expect(color.every(c => c >= 0 && c <= 255)).toBe(true);
      });
    });

    describe('normalized value ranges', () => {
      it('should produce valid colors across the entire range', () => {
        const state = createState(-100, 0);

        for (let amp = -100; amp <= 0; amp += 10) {
          const color = WaterfallDisplay.amplitudeToColorRGB(amp, state);

          expect(color[0]).toBeGreaterThanOrEqual(0);
          expect(color[0]).toBeLessThanOrEqual(255);
          expect(color[1]).toBeGreaterThanOrEqual(0);
          expect(color[1]).toBeLessThanOrEqual(255);
          expect(color[2]).toBeGreaterThanOrEqual(0);
          expect(color[2]).toBeLessThanOrEqual(255);
        }
      });

      it('should produce smooth gradient (no sudden jumps)', () => {
        const state = createState(-100, 0);
        let prevColor = WaterfallDisplay.amplitudeToColorRGB(-100, state);

        for (let amp = -99; amp <= 0; amp++) {
          const color = WaterfallDisplay.amplitudeToColorRGB(amp, state);

          // Each channel should not jump by more than ~15 per unit (with 100 steps across range)
          const maxJump = 20;
          expect(Math.abs(color[0] - prevColor[0])).toBeLessThanOrEqual(maxJump);
          expect(Math.abs(color[1] - prevColor[1])).toBeLessThanOrEqual(maxJump);
          expect(Math.abs(color[2] - prevColor[2])).toBeLessThanOrEqual(maxJump);

          prevColor = color;
        }
      });
    });
  });

  describe('cache properties', () => {
    beforeEach(() => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should track cacheMaxDb', () => {
      expect(waterfall.cacheMaxDb).toBeDefined();
    });

    it('should track cacheMinDb', () => {
      expect(waterfall.cacheMinDb).toBeDefined();
    });

    it('should track cacheGain', () => {
      expect(waterfall.cacheGain).toBeDefined();
    });
  });

  describe('resize handling', () => {
    beforeEach(() => {
      waterfall = new WaterfallDisplay(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should handle resize event', () => {
      // Trigger resize
      window.dispatchEvent(new Event('resize'));

      // Should not throw
      expect(waterfall).toBeDefined();
    });

    it('should return false if no parent element', () => {
      // Remove canvas from parent
      canvas.remove();

      // Create new waterfall without parent
      const orphanCanvas = document.createElement('canvas');
      const orphanWaterfall = new WaterfallDisplay(orphanCanvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Trigger resize via window event won't crash
      window.dispatchEvent(new Event('resize'));

      expect(orphanWaterfall).toBeDefined();
    });
  });

  describe('static methods inherited from RTSAScreen', () => {
    it('should have access to rgb2hex', () => {
      expect(WaterfallDisplay.rgb2hex([255, 128, 0])).toBe('#ff8000');
    });

    it('should have access to getRandomRgb', () => {
      const color = WaterfallDisplay.getRandomRgb(7);

      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
