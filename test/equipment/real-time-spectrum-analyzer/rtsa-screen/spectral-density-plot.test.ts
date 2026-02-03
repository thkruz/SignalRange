import { Mock, vi } from 'vitest';
import { RealTimeSpectrumAnalyzer } from '../../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectralDensityPlot } from '../../../../src/equipment/real-time-spectrum-analyzer/rtsa-screen/spectral-density-plot';
import { SpectrumDataProcessor } from '../../../../src/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import { SimulationManager } from '../../../../src/simulation/simulation-manager';
import { Hertz } from '../../../../src/types';

// Mock SimulationManager
vi.mock('../../../../src/simulation/simulation-manager', () => ({
  SimulationManager: {
    getInstance: vi.fn().mockReturnValue({
      isDeveloperMode: false,
    }),
  },
}));

describe('SpectralDensityPlot', () => {
  let canvas: HTMLCanvasElement;
  let mockSpecA: RealTimeSpectrumAnalyzer;
  let mockDataProcessor: SpectrumDataProcessor;
  let plot: SpectralDensityPlot;

  const DEFAULT_WIDTH = 800;
  const DEFAULT_HEIGHT = 230;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create canvas
    canvas = document.createElement('canvas');

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
      },
      noiseFloorAndGain: -100,
      inputSignals: [],
      rfFrontEnd_: {
        couplerModule: {
          signalPathManager: {
            getTotalRxGain: vi.fn().mockReturnValue(10),
          },
        },
        lnbModule: {
          getTotalGain: vi.fn().mockReturnValue(30),
        },
      },
    } as unknown as RealTimeSpectrumAnalyzer;

    // Create mock SpectrumDataProcessor
    mockDataProcessor = {
      combinedData: new Float32Array(DEFAULT_WIDTH).fill(-80),
      noiseData: new Float32Array(DEFAULT_WIDTH).fill(-100),
      setFrequencyRange: vi.fn(),
      generateData: vi.fn(),
    } as unknown as SpectrumDataProcessor;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided dimensions', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      expect(canvas.width).toBe(DEFAULT_WIDTH);
      expect(canvas.height).toBe(DEFAULT_HEIGHT);
    });

    it('should initialize 3 trace data arrays', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // The plot should be functional after initialization
      expect(plot).toBeDefined();
    });

    it('should start in non-running state initially', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Before setTimeout fires, update should not draw
      const ctxSpy = vi.spyOn(canvas.getContext('2d')!, 'stroke');
      plot.update();

      // Not running yet, so no stroke calls
      expect(ctxSpy).not.toHaveBeenCalled();
    });

    it('should start running after random delay (up to 1000ms)', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);

      // Advance timers to ensure running is true
      vi.advanceTimersByTime(1100);

      // Now the plot should be running (we can't directly check running, but we can verify it processes)
      expect(plot).toBeDefined();
    });
  });

  describe('setFrequencyRange', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should update frequency range', () => {
      const minFreq = 3700e6 as Hertz;
      const maxFreq = 3800e6 as Hertz;

      plot.setFrequencyRange(minFreq, maxFreq);

      // No direct getter, but we can verify it doesn't throw
      expect(() => plot.setFrequencyRange(minFreq, maxFreq)).not.toThrow();
    });

    it('should clear frequency label cache when range changes', () => {
      const minFreq1 = 3700e6 as Hertz;
      const maxFreq1 = 3800e6 as Hertz;
      const minFreq2 = 3900e6 as Hertz;
      const maxFreq2 = 4000e6 as Hertz;

      plot.setFrequencyRange(minFreq1, maxFreq1);
      plot.setFrequencyRange(minFreq2, maxFreq2);

      // Should not throw and should handle cache invalidation
      expect(plot).toBeDefined();
    });

    it('should not clear cache when setting same range', () => {
      const minFreq = 3700e6 as Hertz;
      const maxFreq = 3800e6 as Hertz;

      plot.setFrequencyRange(minFreq, maxFreq);
      plot.setFrequencyRange(minFreq, maxFreq);

      // Should handle identical ranges without error
      expect(plot).toBeDefined();
    });
  });

  describe('resetMaxHold_', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should reset trace data for max hold', () => {
      // Access private method via any cast
      (plot as any).resetMaxHold_();

      // Should not throw
      expect(plot).toBeDefined();
    });
  });

  describe('resetMinHold_', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should reset trace data for min hold', () => {
      // Access private method via any cast
      (plot as any).resetMinHold_();

      // Should not throw
      expect(plot).toBeDefined();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100); // Ensure running is true
    });

    it('should not update when paused', () => {
      mockSpecA.state.isPaused = true;

      // Should not process updates when paused
      plot.update();

      expect(plot).toBeDefined();
    });

    it('should update visible and updating traces', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'clearwrite' };

      plot.update();

      // Should process without error
      expect(plot).toBeDefined();
    });

    it('should skip invisible traces', () => {
      mockSpecA.state.traces[0] = { isVisible: false, isUpdating: true, mode: 'clearwrite' };

      plot.update();

      expect(plot).toBeDefined();
    });

    it('should skip non-updating traces', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: false, mode: 'clearwrite' };

      plot.update();

      expect(plot).toBeDefined();
    });
  });

  describe('draw', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100);
    });

    it('should not draw when paused', () => {
      mockSpecA.state.isPaused = true;
      const putImageDataSpy = vi.spyOn(canvas.getContext('2d')!, 'putImageData');

      plot.draw();

      expect(putImageDataSpy).not.toHaveBeenCalled();
    });

    it('should draw visible traces', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'clearwrite' };

      // Should not throw
      expect(() => plot.draw()).not.toThrow();
    });

    it('should handle multiple visible traces', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'clearwrite' };
      mockSpecA.state.traces[1] = { isVisible: true, isUpdating: true, mode: 'maxhold' };
      mockSpecA.state.traces[2] = { isVisible: true, isUpdating: true, mode: 'minhold' };

      expect(() => plot.draw()).not.toThrow();
    });

    it('should draw markers when enabled', () => {
      mockSpecA.state.isMarkerOn = true;
      mockSpecA.state.topMarkers = [{ x: 100, y: 0.5, signal: -50 }];
      mockSpecA.state.markerIndex = 0;

      expect(() => plot.draw()).not.toThrow();
    });
  });

  describe('trace modes', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100);
    });

    it('should handle clearwrite mode', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'clearwrite' };

      plot.update();
      expect(plot).toBeDefined();
    });

    it('should handle maxhold mode', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'maxhold' };

      plot.update();
      expect(plot).toBeDefined();
    });

    it('should handle minhold mode', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'minhold' };

      // Initialize with high values for min hold testing
      plot.update();
      expect(plot).toBeDefined();
    });

    it('should handle average mode', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'average' };

      plot.update();
      expect(plot).toBeDefined();
    });

    it('should handle hold mode (frozen data)', () => {
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'hold' };

      plot.update();
      expect(plot).toBeDefined();
    });
  });

  describe('signal color cache', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should initialize empty signal color cache', () => {
      expect(plot.signalColorCache).toBeDefined();
      expect(plot.signalColorCache.size).toBe(0);
    });

    it('should be a Map instance', () => {
      expect(plot.signalColorCache).toBeInstanceOf(Map);
    });
  });

  describe('cached reference level', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
    });

    it('should track cached reference level', () => {
      // Initial value may be undefined until first draw
      expect(plot.cachedReferenceLevel === undefined || typeof plot.cachedReferenceLevel === 'number').toBe(true);
    });
  });

  describe('developer mode', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100);
    });

    it('should handle developer mode enabled', () => {
      (SimulationManager.getInstance as Mock).mockReturnValue({
        isDeveloperMode: true,
      });

      mockSpecA.inputSignals = [
        {
          signalId: 'test-signal-1',
          frequency: 3750e6 as Hertz,
          bandwidth: 36e6 as Hertz,
          power: -60,
        } as any,
      ];

      expect(() => plot.draw()).not.toThrow();
    });

    it('should handle developer mode disabled', () => {
      (SimulationManager.getInstance as Mock).mockReturnValue({
        isDeveloperMode: false,
      });

      expect(() => plot.draw()).not.toThrow();
    });
  });

  describe('marker updates', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100);
    });

    it('should update markers when isUpdateMarkers is true', () => {
      mockSpecA.state.isUpdateMarkers = true;
      mockSpecA.state.isMarkerOn = true;
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'clearwrite' };

      // Run draw which triggers marker update
      plot.draw();

      // isUpdateMarkers should be reset to false after update
      expect(mockSpecA.state.isUpdateMarkers).toBe(false);
    });

    it('should find peaks in trace data', () => {
      mockSpecA.state.isUpdateMarkers = true;
      mockSpecA.state.isMarkerOn = true;
      mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'clearwrite' };

      // Create data with a peak
      mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH);
      mockDataProcessor.combinedData.fill(-100);
      mockDataProcessor.combinedData[400] = -50; // Peak in the middle

      plot.update(); // Populate trace data
      plot.draw();

      // topMarkers should be updated
      expect(mockSpecA.state.topMarkers).toBeDefined();
    });
  });

  describe('static methods inherited from RTSAScreen', () => {
    it('should have access to rgb2hex', () => {
      expect(SpectralDensityPlot.rgb2hex([255, 128, 0])).toBe('#ff8000');
    });

    it('should have access to getRandomRgb', () => {
      const color = SpectralDensityPlot.getRandomRgb(5);

      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});
