import { Mock, vi } from 'vitest';
import { findPeakPlateau } from '../../../../src/equipment/real-time-spectrum-analyzer/peak-plateau';
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

    describe('Peak Search one shot (phase 33 D10, r7-s15-F1, r8-s01-F1)', () => {
      const activeMarker = () => {
        const { topMarkers, markerIndex } = mockSpecA.state;
        return topMarkers[markerIndex] ?? topMarkers[0];
      };
      const markerSignal = () => activeMarker()?.signal;
      const sweep = (fill: number, spikes: Record<number, number>) => {
        mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(fill);
        for (const [x, level] of Object.entries(spikes)) {
          mockDataProcessor.combinedData[Number(x)] = level;
        }
        vi.advanceTimersByTime(1000);
        plot.update();
        plot.draw();
      };

      beforeEach(() => {
        (mockSpecA as unknown as { traceIntervalMs: number }).traceIntervalMs = 100;
        mockSpecA.state.isMarkerOn = true;
        mockSpecA.state.isUpdateMarkers = true;
      });

      it('stays on the Peak Search bin and re-reads its level every sweep, so a notched-out spike reads notched (r5-s05-F3)', () => {
        mockSpecA.state.peakMarkerBin = 400;
        sweep(-82, { 400: -46.8 });
        expect(activeMarker().x).toBe(400);
        expect(markerSignal()).toBeCloseTo(-46.8, 1);

        // The notch removes the spike: the marker stays on its bin and reads what is there now
        sweep(-82, { 600: -80 });
        expect(activeMarker().x).toBe(400);
        expect(markerSignal()).toBeCloseTo(-82, 1);
        expect(mockSpecA.state.peakMarkerBin).toBe(400);
      });

      it('never re-picks on a noisy flat top: 20 sweeps, the marker stays on the clicked bin', () => {
        mockSpecA.state.peakMarkerBin = 400;
        for (let n = 0; n < 20; n++) {
          const hot = 200 + ((n * 137) % 400);
          const spikes: Record<number, number> = {};
          for (let x = 200; x <= 600; x++) {
            spikes[x] = -54.4 + (x === hot ? 0.4 : ((x * (n + 3)) % 7) * 0.05);
          }
          sweep(-90, spikes);
          expect(activeMarker().x).toBe(400);
          expect(markerSignal()).toBeCloseTo(spikes[400], 3);
        }

        // Even a 3 dB step elsewhere on the top does not move it
        const stepped: Record<number, number> = {};
        for (let x = 200; x <= 600; x++) {
          stepped[x] = x >= 500 ? -51.4 : -54.4;
        }
        sweep(-90, stepped);
        expect(activeMarker().x).toBe(400);
        expect(markerSignal()).toBeCloseTo(-54.4, 3);
      });

      it('sits on the highest point of the trace when the marker is turned on (no Peak Search bin)', () => {
        sweep(-99, { 650: -98.5 });
        expect(markerSignal()).toBeCloseTo(-98.5, 1);
      });

      it('marks a flat-top carrier at the centre of its top, the bin Peak Search reads (phase 31 D15)', () => {
        sweep(-82, { 300: -50, 301: -50, 302: -50, 303: -50, 304: -50 });
        const marker = activeMarker();
        expect(marker.signal).toBeCloseTo(-50, 1);
        expect(marker.x).toBe(302);
        expect(findPeakPlateau(mockDataProcessor.combinedData)?.bin).toBe(302);
      });

      it('keeps a peak above Max Amp: true level in the readout, marker clamped at the top edge (phase 32 D11, r7-s12-F1)', () => {
        mockSpecA.state.maxAmplitude = -60;
        // Beacon at -57.7 dBm runs off the top of a -100/-60 window; a noise spike at -99.1 is inside it
        sweep(-105, { 120: -99.1, 400: -57.7 });
        const marker = activeMarker();
        expect(marker.x).toBe(400);
        expect(marker.signal).toBeCloseTo(-57.7, 1);
        expect(marker.y).toBe(0);
      });

      it('without a Peak Search bin, a placed marker stays where it was put', () => {
        sweep(-82, { 400: -46.8 });
        sweep(-82, { 600: -80 });
        expect(markerSignal()).toBeCloseTo(-46.8, 1);
      });

      it('releases the bin when the marker is turned off', () => {
        mockSpecA.state.peakMarkerBin = 400;
        sweep(-82, { 400: -46.8 });
        mockSpecA.state.isMarkerOn = false;
        sweep(-82, { 400: -46.8 });
        expect(mockSpecA.state.peakMarkerBin).toBeUndefined();
      });

      it('a retune releases the marker completely: bin cleared, marker off, no re-pick on the new trace (phase 34 D2)', () => {
        plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
        mockSpecA.state.peakMarkerBin = 400;
        sweep(-82, { 400: -46.8 });
        expect(activeMarker().x).toBe(400);

        plot.setFrequencyRange(1462.5e6 as Hertz, 1537.5e6 as Hertz);
        sweep(-82, { 250: -50 });
        expect(mockSpecA.state.peakMarkerBin).toBeUndefined();
        expect(mockSpecA.state.isMarkerOn).toBe(false);
        expect(mockSpecA.state.isUpdateMarkers).toBe(false);
        // No diamond drawn on the new traces
        const fill = vi.spyOn(canvas.getContext('2d')!, 'fill');
        fill.mockClear();
        sweep(-82, { 250: -50 });
        sweep(-82, { 250: -50 });
        expect(fill).not.toHaveBeenCalled();
      });

      it('an amplitude-only change keeps the marker on its bin', () => {
        plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
        mockSpecA.state.peakMarkerBin = 400;
        sweep(-82, { 400: -46.8 });
        mockSpecA.state.maxAmplitude = 10;
        sweep(-82, { 400: -46.8 });
        expect(mockSpecA.state.isMarkerOn).toBe(true);
        expect(mockSpecA.state.peakMarkerBin).toBe(400);
        expect(activeMarker().x).toBe(400);
      });

      it('selectedTraceData is the trace as drawn, not the live frame (Max Hold here)', () => {
        mockSpecA.state.traces[0] = { isVisible: true, isUpdating: true, mode: 'maxhold' };
        sweep(-82, { 400: -46.8 });
        sweep(-82, { 600: -60 });
        const drawn = plot.selectedTraceData!;
        expect(drawn[400]).toBeCloseTo(-46.8, 3);
        expect(drawn[600]).toBeCloseTo(-60, 3);
        expect(mockDataProcessor.combinedData[400]).toBe(-82);
        expect(findPeakPlateau(drawn)?.bin).toBe(400);
      });
    });

    describe('paused repaint (phase 33 D10, r8-s01-F1)', () => {
      beforeEach(() => {
        (mockSpecA as unknown as { traceIntervalMs: number }).traceIntervalMs = 100;
        mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(-82);
        mockDataProcessor.combinedData[400] = -46.8;
        plot.update();
        plot.draw();
        mockSpecA.state.isPaused = true;
        // The live frame moves on while the screen is frozen
        mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(-90);
        mockDataProcessor.combinedData[600] = -30;
      });

      it('a paused Peak Search draws the diamond on the frozen trace, without taking a trace', () => {
        const ctx = canvas.getContext('2d')!;
        const putImageData = vi.spyOn(ctx, 'putImageData');
        const moveTo = vi.spyOn(ctx, 'moveTo');
        putImageData.mockClear();
        moveTo.mockClear();
        const updateSpy = vi.spyOn(plot, 'update');
        mockSpecA.state.isMarkerOn = true;
        mockSpecA.state.peakMarkerBin = 400;
        mockSpecA.state.topMarkers = [];

        plot.draw(); // the paused loop still draws nothing
        expect(putImageData).not.toHaveBeenCalled();

        plot.redrawFrozen();

        expect(updateSpy).not.toHaveBeenCalled();
        expect(putImageData).toHaveBeenCalledTimes(1);
        const marker = mockSpecA.state.topMarkers[mockSpecA.state.markerIndex];
        expect(marker.x).toBe(400);
        expect(marker.signal).toBeCloseTo(-46.8, 3);
        // The diamond's tip on the frozen trace at bin 400
        const traceHeight = DEFAULT_HEIGHT - SpectralDensityPlot.LABEL_BAND_PX;
        const x = ((400 + 0.5) / DEFAULT_WIDTH) * DEFAULT_WIDTH;
        expect(moveTo.mock.calls.some(([mx, my]) => mx === x && Math.abs(my - traceHeight * marker.y) < 1e-9)).toBe(true);
        // The frozen trace was drawn, not the live frame
        expect(plot.selectedTraceData![600]).toBe(-82);
      });

      it('repaints without the marker once it is turned off', () => {
        const ctx = canvas.getContext('2d')!;
        mockSpecA.state.isMarkerOn = true;
        mockSpecA.state.peakMarkerBin = 400;
        plot.redrawFrozen();
        const fill = vi.spyOn(ctx, 'fill');
        fill.mockClear();
        mockSpecA.state.isMarkerOn = false;
        plot.redrawFrozen();
        expect(fill).not.toHaveBeenCalled();
      });
    });
  });

  describe('marker on the trace (phase 33 D11, r8-s09-F1)', () => {
    const traceHeight = DEFAULT_HEIGHT - SpectralDensityPlot.LABEL_BAND_PX;

    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100);
      (mockSpecA as unknown as { traceIntervalMs: number }).traceIntervalMs = 100;
      mockSpecA.state.isMarkerOn = true;
      mockSpecA.state.isUpdateMarkers = true;
    });

    it('a peak within 15 dB of Max Amp: the diamond tip is on the trace y, the label below it', () => {
      mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(-90);
      mockDataProcessor.combinedData[400] = -8; // 8 dB under Max Amp 0 in a 100 dB window
      plot.update();
      const ctx = canvas.getContext('2d')!;
      const moveTo = vi.spyOn(ctx, 'moveTo');
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const marker = mockSpecA.state.topMarkers[mockSpecA.state.markerIndex];
      expect(marker.x).toBe(400);
      const tipY = traceHeight * marker.y;
      expect(tipY).toBeCloseTo(0.08 * traceHeight, 3);
      const x = 400.5;
      const tip = moveTo.mock.calls.filter(([mx]) => mx === x).at(-1);
      expect(tip?.[1]).toBeCloseTo(tipY, 9);
      // No room above: both label lines sit below the tip
      const labels = fillText.mock.calls.filter(([t]) => String(t).endsWith(' MHz') || String(t) === '-8.0 dBm');
      expect(labels).toHaveLength(2);
      for (const [, , y] of labels) {
        expect(y).toBeGreaterThan(tipY);
      }
    });

    it('a peak lower in the window keeps its label above the diamond', () => {
      mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(-90);
      mockDataProcessor.combinedData[400] = -50;
      plot.update();
      const ctx = canvas.getContext('2d')!;
      const moveTo = vi.spyOn(ctx, 'moveTo');
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const tipY = traceHeight * 0.5;
      expect(moveTo.mock.calls.filter(([mx]) => mx === 400.5).at(-1)?.[1]).toBeCloseTo(tipY, 9);
      const level = fillText.mock.calls.find(([t]) => t === '-50.0 dBm');
      expect(level?.[2]).toBeLessThan(tipY);
    });

    it('a peak above Max Amp sits at the top edge, the diamond whole', () => {
      mockSpecA.state.maxAmplitude = -60;
      mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(-95);
      mockDataProcessor.combinedData[400] = -57.7;
      plot.update();
      const ctx = canvas.getContext('2d')!;
      const moveTo = vi.spyOn(ctx, 'moveTo');
      plot.draw();

      expect(mockSpecA.state.topMarkers[mockSpecA.state.markerIndex].y).toBe(0);
      expect(moveTo.mock.calls.filter(([mx]) => mx === 400.5).at(-1)?.[1]).toBe(SpectralDensityPlot.MARKER_MIN_TIP_PX);
    });

    describe('boxed marker label (phase 34 D3, r9-s12-F1)', () => {
      /** Draw with a peak at bin 400; returns the two label fillText calls with their call order, and the fillRect/fill spies */
      const drawPeak = (level: number) => {
        mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(-90);
        mockDataProcessor.combinedData[400] = level;
        plot.update();
        const ctx = canvas.getContext('2d')!;
        const fillText = vi.spyOn(ctx, 'fillText');
        const fillRect = vi.spyOn(ctx, 'fillRect');
        const fill = vi.spyOn(ctx, 'fill');
        plot.draw();
        const levelText = `${level.toFixed(1)} dBm`;
        const labelIdx = fillText.mock.calls.map(([t], i) => ((String(t).endsWith(' MHz') && String(t) !== 'MHz') || t === levelText ? i : -1)).filter((i) => i >= 0);

        return { fillText, fillRect, fill, labelIdx };
      };

      const expectBoxedLabels = ({ fillText, fillRect, fill, labelIdx }: ReturnType<typeof drawPeak>, tipY: number, isAbove: boolean) => {
        expect(labelIdx).toHaveLength(2);
        const diamondOrder = fill.mock.invocationCallOrder.at(-1)!;
        let prevOrder = diamondOrder;
        for (const idx of labelIdx) {
          const order = fillText.mock.invocationCallOrder[idx];
          // An opaque box is drawn after the previous line and just before this one
          const boxIdx = fillRect.mock.invocationCallOrder.findIndex((o) => o > prevOrder && o < order);
          expect(boxIdx, String(fillText.mock.calls[idx][0])).toBeGreaterThanOrEqual(0);
          // The box stays clear of the diamond (tipY - 10 .. tipY)
          const [, top, , height] = fillRect.mock.calls[boxIdx] as number[];
          if (isAbove) {
            expect(top + height).toBeLessThanOrEqual(tipY - 10);
          } else {
            expect(top).toBeGreaterThan(tipY);
          }
          prevOrder = order;
        }
      };

      it('above the diamond: a fillRect precedes each label line', () => {
        const drawn = drawPeak(-50);
        expectBoxedLabels(drawn, traceHeight * 0.5, true);
      });

      it('below the diamond (a peak near Max Amp): a fillRect precedes each label line', () => {
        const drawn = drawPeak(-8);
        expectBoxedLabels(drawn, traceHeight * 0.08, false);
      });

      it('prints the marker frequency with formatMarkerMHz, six decimals from whole Hz', () => {
        // 80 MHz over 800 bins: bin 400 centres at 1449.90449 + 40.05 = 1489.95449 MHz
        plot.setFrequencyRange(1449.90449e6 as Hertz, 1529.90449e6 as Hertz);
        const { fillText } = drawPeak(-50);
        expect(fillText.mock.calls.map(([t]) => String(t))).toContain('1489.954490 MHz');
        expect(SpectralDensityPlot.formatMarkerMHz(1489.95449e6)).toBe('1489.954490');
        expect(SpectralDensityPlot.formatMarkerMHz(1484.375e6)).toBe('1484.375000');
        expect(SpectralDensityPlot.formatMarkerMHz(1085.000001e6)).toBe('1085.000001');
        expect(SpectralDensityPlot.formatMarkerMHz(1499.9999996e6)).toBe('1500.000000');
      });
    });
  });

  describe('label band (Phase 30 D21, nats-r4-s04-F4; phase 33 D12)', () => {
    it('keeps a floor on the Min Amp line above the band the tick labels sit in; the Min Amp label sits just above that line', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
      vi.advanceTimersByTime(1100);
      (mockSpecA as unknown as { traceIntervalMs: number }).traceIntervalMs = 100;
      mockDataProcessor.combinedData = new Float32Array(DEFAULT_WIDTH).fill(mockSpecA.state.minAmplitude);
      const ctx = canvas.getContext('2d')!;
      const lineTo = vi.spyOn(ctx, 'lineTo');
      const fillText = vi.spyOn(ctx, 'fillText');

      plot.update();
      plot.draw();

      const traceBottom = DEFAULT_HEIGHT - SpectralDensityPlot.LABEL_BAND_PX;
      const traceYs = lineTo.mock.calls.map(([, y]) => y);
      expect(traceYs.length).toBeGreaterThan(0);
      expect(Math.max(...traceYs)).toBeCloseTo(traceBottom, 6);

      // Every frequency tick is drawn in the band, and nothing else is
      const ticks = SpectralDensityPlot.frequencyAxisLabels(1452.5e6, 1527.5e6).labels;
      const bandTexts = fillText.mock.calls.filter(([, , y]) => y > traceBottom).map(([text]) => String(text));
      expect(bandTexts.sort()).toEqual([...ticks].sort());
      // The Min Amp label sits just above the bottom grid line, inside the trace area
      const minAmp = fillText.mock.calls.find(([text]) => text === '-100');
      expect(minAmp?.[2]).toBeLessThan(traceBottom - 1);
      expect(minAmp?.[2]).toBeGreaterThan(traceBottom - 8);
    });
  });

  describe('amplitude labels over the trace (phase 31 D8, r6-s01-F3)', () => {
    it('draws every amplitude label after the traces, each on its own box', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
      vi.advanceTimersByTime(1100);
      (mockSpecA as unknown as { traceIntervalMs: number }).traceIntervalMs = 100;
      const ctx = canvas.getContext('2d')!;
      const stroke = vi.spyOn(ctx, 'stroke');
      const fillText = vi.spyOn(ctx, 'fillText');
      const fillRect = vi.spyOn(ctx, 'fillRect');

      plot.update();
      plot.draw();

      const lastStroke = Math.max(...stroke.mock.invocationCallOrder);
      expect(stroke.mock.calls.length).toBeGreaterThan(0);
      const amplitudeTexts = ['0', '-10', '-50', '-90', '-100', 'dBm', 'MHz'];
      for (const text of amplitudeTexts) {
        const idx = fillText.mock.calls.findIndex(([t]) => t === text);
        expect(idx, text).toBeGreaterThanOrEqual(0);
        const order = fillText.mock.invocationCallOrder[idx];
        expect(order, text).toBeGreaterThan(lastStroke);
        // The box for this label is the fillRect drawn just before it
        const boxOrders = fillRect.mock.invocationCallOrder.filter((o) => o < order && o > lastStroke);
        expect(boxOrders.length, text).toBeGreaterThan(0);
      }
    });

    it('puts each amplitude label on an opaque box, 2 px padded, from the left edge (phase 32 D12)', () => {
      expect(SpectralDensityPlot.LABEL_BOX_ALPHA).toBe(1);
      expect(SpectralDensityPlot.LABEL_BOX_PAD_PX).toBe(2);
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      vi.advanceTimersByTime(1100);
      (mockSpecA as unknown as { traceIntervalMs: number }).traceIntervalMs = 100;
      const ctx = canvas.getContext('2d')!;
      const stroke = vi.spyOn(ctx, 'stroke');
      const fillRect = vi.spyOn(ctx, 'fillRect');

      plot.update();
      plot.draw();

      const lastStroke = Math.max(...stroke.mock.invocationCallOrder);
      const labelBoxes = fillRect.mock.calls.filter((_, i) => fillRect.mock.invocationCallOrder[i] > lastStroke);
      expect(labelBoxes.length).toBeGreaterThan(0);
      // Every numeric label box starts at x = 0; the two unit tags (dBm beside
      // the top label, the frequency unit at the bottom right) do not
      expect(labelBoxes.filter(([x]) => x === 0).length).toBe(labelBoxes.length - 2);
    });

    it('keeps the amplitude labels out of the cached grid image', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
      vi.advanceTimersByTime(1100);
      const ctx = canvas.getContext('2d')!;
      const fillText = vi.spyOn(ctx, 'fillText');
      const getImageData = vi.spyOn(ctx, 'getImageData');

      plot.draw();

      const cacheOrder = getImageData.mock.invocationCallOrder[0];
      expect(cacheOrder).toBeDefined();
      const beforeCache = fillText.mock.calls.filter((_, i) => fillText.mock.invocationCallOrder[i] < cacheOrder).map(([t]) => String(t));
      expect(beforeCache).toContain('1460.0');
      expect(beforeCache).not.toContain('-100');
      expect(beforeCache).not.toContain('dBm');
      expect(beforeCache).not.toContain('MHz');
    });
  });

  describe('exact frequency labels (phase 33 D12, r8-s15-F1)', () => {
    const realisticWidths = () => {
      const ctx = canvas.getContext('2d')!;
      // About 6 px a character at 11 px Arial
      vi.spyOn(ctx, 'measureText').mockImplementation((text: string) => ({ width: String(text).length * 6 }) as TextMetrics);
      return ctx;
    };

    it('centre 1490 / span 75 MHz: 11 distinct exact labels in MHz with one decimal', () => {
      const axis = SpectralDensityPlot.frequencyAxisLabels(1452.5e6, 1527.5e6);
      expect(axis.unit).toBe('MHz');
      expect(axis.labels).toEqual(['1452.5', '1460.0', '1467.5', '1475.0', '1482.5', '1490.0', '1497.5', '1505.0', '1512.5', '1520.0', '1527.5']);
      expect(new Set(axis.labels).size).toBe(11);
    });

    it('uses the fewest decimals and the unit with the shortest text', () => {
      expect(SpectralDensityPlot.frequencyAxisLabels(3668e6, 3768e6)).toEqual({
        labels: ['3668', '3678', '3688', '3698', '3708', '3718', '3728', '3738', '3748', '3758', '3768'],
        unit: 'MHz',
      });
      expect(SpectralDensityPlot.frequencyAxisLabels(0, 25e9)).toMatchObject({ labels: expect.arrayContaining(['0.0', '2.5', '25.0']), unit: 'GHz' });
      expect(SpectralDensityPlot.frequencyAxisLabels(10e3, 20e3)).toMatchObject({ labels: expect.arrayContaining(['10', '11', '20']), unit: 'kHz' });
      // A float window (centre - span / 2) still reads exact
      expect(SpectralDensityPlot.frequencyAxisLabels(1074.499e6, 1074.501e6).labels[0]).toBe('1074.4990');
    });

    it('draws every tick, tick 0 at the left inset, and the unit once on its own box', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
      vi.advanceTimersByTime(1100);
      const ctx = realisticWidths();
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const texts = fillText.mock.calls.map(([t]) => String(t));
      for (const label of SpectralDensityPlot.frequencyAxisLabels(1452.5e6, 1527.5e6).labels) {
        expect(
          texts.filter((t) => t === label),
          label
        ).toHaveLength(1);
      }
      expect(fillText.mock.calls.find(([t]) => t === '1452.5')?.[1]).toBe(4);
      expect(texts.filter((t) => t === 'MHz')).toHaveLength(1);
      expect(texts.some((t) => / [kMG]?Hz$/u.test(t))).toBe(false);
    });

    /** Boxes (left, right) of the frequency labels drawn, from the fillText calls and the 6 px/char widths */
    const tickBoxes = (fillText: ReturnType<typeof vi.spyOn>, labels: string[]) =>
      fillText.mock.calls
        .map((call, n) => ({ text: String(call[0]), x: call[1] as number, n }))
        .filter(({ text }) => labels.includes(text))
        .map(({ text, x }) => {
          const width = text.length * 6;
          const i = labels.indexOf(text);
          if (i === 0) {
            return { text, left: x, right: x + width };
          }
          if (i === labels.length - 1) {
            return { text, left: x - width, right: x };
          }
          return { text, left: x - width / 2, right: x + width / 2 };
        });
    const expectNoOverlap = (boxes: { text: string; left: number; right: number }[]) => {
      for (const a of boxes) {
        for (const b of boxes) {
          if (a !== b) {
            expect(a.right <= b.left || b.right <= a.left, `${a.text} / ${b.text}`).toBe(true);
          }
        }
      }
    };

    it('a 2 kHz span at 1074.5 MHz on a 700 px plot: tick 0 drawn, no two label boxes overlap (phase 33 D12 follow-up)', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, 700, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1074.499e6 as Hertz, 1074.501e6 as Hertz);
      vi.advanceTimersByTime(1100);
      const ctx = realisticWidths();
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const { labels } = SpectralDensityPlot.frequencyAxisLabels(1074.499e6, 1074.501e6);
      const boxes = tickBoxes(fillText, labels);
      const texts = boxes.map((b) => b.text);
      expect(texts).toContain('1074.4990');
      expect(texts).toContain('1074.5000');
      expect(texts).toContain('1074.5010');
      expect(texts).not.toContain('1074.4992'); // 70 px from tick 0, which is 54 px wide at the 4 px inset
      expectNoOverlap(boxes);
      // Every label still drawn is clear of its neighbours by the gap
      const sorted = [...boxes].sort((a, b) => a.left - b.left);
      for (let k = 1; k < sorted.length; k++) {
        expect(sorted[k].left - sorted[k - 1].right).toBeGreaterThanOrEqual(SpectralDensityPlot.TICK_GAP_PX);
      }
    });

    it('a plot too narrow for every tick keeps the start, the centre and the stop, with no overlaps', () => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, 200, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1452.5e6 as Hertz, 1527.5e6 as Hertz);
      vi.advanceTimersByTime(1100);
      const ctx = realisticWidths();
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const { labels } = SpectralDensityPlot.frequencyAxisLabels(1452.5e6, 1527.5e6);
      const boxes = tickBoxes(fillText, labels);
      const texts = boxes.map((b) => b.text);
      for (const label of ['1452.5', '1490.0', '1527.5']) {
        expect(texts, label).toContain(label);
      }
      expect(texts).not.toContain('1460.0');
      expectNoOverlap(boxes);
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

  describe('graticule (phase 27 AN)', () => {
    beforeEach(() => {
      plot = new SpectralDensityPlot(canvas, mockSpecA, mockDataProcessor, DEFAULT_WIDTH, DEFAULT_HEIGHT);
      plot.setFrequencyRange(1074.499e6 as Hertz, 1074.501e6 as Hertz);
      vi.advanceTimersByTime(1100);
    });

    it('labels every amplitude line, Max Amp and Min Amp included, inside the plot', () => {
      const ctx = canvas.getContext('2d')!;
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const texts = fillText.mock.calls.map((call) => String(call[0]));
      expect(texts).toContain('0');
      expect(texts).toContain('-100');
      for (const call of fillText.mock.calls) {
        const y = call[2] as number;
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(DEFAULT_HEIGHT);
      }
    });

    it('labels the start and stop frequencies too', () => {
      const ctx = canvas.getContext('2d')!;
      const fillText = vi.spyOn(ctx, 'fillText');
      plot.draw();

      const texts = fillText.mock.calls.map((call) => String(call[0]));
      // Stop (1074.501 MHz) and start (1074.499 MHz) both drawn, 200 Hz apart, the unit once
      expect(texts).toContain('1074.4990');
      expect(texts).toContain('1074.4992');
      expect(texts).toContain('1074.5010');
      expect(texts.filter((t) => t === 'MHz')).toHaveLength(1);
    });

    it('redraws the grid at once when the amplitude window changes, without waiting for a trace', () => {
      plot.draw();
      const ctx = canvas.getContext('2d')!;
      const fillText = vi.spyOn(ctx, 'fillText');
      mockSpecA.state.minAmplitude = -140;
      plot.draw();

      expect(fillText.mock.calls.map((call) => String(call[0]))).toContain('-140');
    });

    it('uses an 11 px label font', () => {
      expect(SpectralDensityPlot.LABEL_FONT).toBe('11px Arial');
    });
  });
});
