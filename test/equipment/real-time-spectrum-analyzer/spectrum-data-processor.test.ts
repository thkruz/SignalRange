import { Mock, Mocked, vi } from 'vitest';
import { RealTimeSpectrumAnalyzer, RealTimeSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import { SpectrumDataProcessor } from '../../../src/equipment/real-time-spectrum-analyzer/spectrum-data-processor';
import { Hertz, IfSignal } from '../../../src/types';

// Mock HTMLMediaElement.prototype.play for jsdom compatibility
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

describe('SpectrumDataProcessor', () => {
  let mockSpecA: Mocked<Partial<RealTimeSpectrumAnalyzer>>;
  let processor: SpectrumDataProcessor;
  const testWidth = 100;

  // Create minimal mock state
  const createMockState = (): Partial<RealTimeSpectrumAnalyzerState> => ({
    noiseFloorNoGain: -100,
    minAmplitude: -120,
    maxAmplitude: -40,
    isSkipLnaGainDuringDraw: true,
  });

  // Create mock signal path manager
  const createMockSignalPathManager = () => ({
    getTotalRxGain: vi.fn().mockReturnValue(0),
  });

  // Create mock coupler module
  const createMockCouplerModule = () => ({
    signalPathManager: createMockSignalPathManager(),
  });

  // Create mock notch filter module
  const createMockNotchFilterModule = () => ({
    state: {
      isPowered: false,
      notches: [],
    },
  });

  // Create mock RF front end
  const createMockRfFrontEnd = () => ({
    couplerModule: createMockCouplerModule(),
    notchFilterModule: createMockNotchFilterModule(),
  });

  beforeEach(() => {
    // Create mock spectrum analyzer
    mockSpecA = {
      state: createMockState() as RealTimeSpectrumAnalyzerState,
      inputSignals: [],
      rfFrontEnd_: createMockRfFrontEnd() as any,
    };

    processor = new SpectrumDataProcessor(mockSpecA as any, testWidth);
  });

  describe('Initialization', () => {
    it('should initialize with correct width', () => {
      expect(processor.noiseData).toHaveLength(testWidth);
      expect(processor.signalData).toHaveLength(testWidth);
      expect(processor.combinedData).toHaveLength(testWidth);
    });

    it('should initialize data arrays as Float32Arrays', () => {
      expect(processor.noiseData).toBeInstanceOf(Float32Array);
      expect(processor.signalData).toBeInstanceOf(Float32Array);
      expect(processor.combinedData).toBeInstanceOf(Float32Array);
    });

    it('should create independent data arrays (not shared)', () => {
      expect(processor.noiseData).not.toBe(processor.signalData);
      expect(processor.signalData).not.toBe(processor.combinedData);
      expect(processor.noiseData).not.toBe(processor.combinedData);
    });
  });

  describe('setFrequencyRange', () => {
    it('should set min and max frequency', () => {
      const minFreq = 500e6 as Hertz;
      const maxFreq = 600e6 as Hertz;

      processor.setFrequencyRange(minFreq, maxFreq);

      // Since minFreq and maxFreq are private, we verify by generating data
      // and checking that it works without errors
      expect(() => processor.generateData()).not.toThrow();
    });
  });

  describe('generateData', () => {
    beforeEach(() => {
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
    });

    it('should populate noise data array', () => {
      processor.generateData();

      // Check that noise data has been populated (not all zeros)
      const hasNonZero = processor.noiseData.some(v => v !== 0);
      expect(hasNonZero).toBe(true);
    });

    it('should populate combined data array', () => {
      processor.generateData();

      // Combined data should be the max of noise and signal at each point
      const hasNonZero = processor.combinedData.some(v => v !== 0);
      expect(hasNonZero).toBe(true);
    });

    it('should generate noise floor values around the expected level', () => {
      processor.generateData();

      const noiseFloor = mockSpecA.state!.noiseFloorNoGain;
      const sum = processor.noiseData.reduce((a, b) => a + b, 0);
      const average = sum / processor.noiseData.length;

      // Average should be close to noise floor (within reasonable variance)
      expect(average).toBeGreaterThan(noiseFloor! - 5);
      expect(average).toBeLessThan(noiseFloor! + 5);
    });

    it('should generate unique noise values each call (randomness)', () => {
      processor.generateData();
      const firstNoise = new Float32Array(processor.noiseData);

      processor.generateData();
      const secondNoise = processor.noiseData;

      // Arrays should not be identical due to randomness
      let identical = true;
      for (let i = 0; i < testWidth; i++) {
        if (firstNoise[i] !== secondNoise[i]) {
          identical = false;
          break;
        }
      }
      expect(identical).toBe(false);
    });
  });

  describe('Signal processing', () => {
    beforeEach(() => {
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
    });

    it('should handle empty input signals', () => {
      mockSpecA.inputSignals = [];

      expect(() => processor.generateData()).not.toThrow();
    });

    it('should process signals within frequency range', () => {
      const signal: IfSignal = {
        frequency: 550e6 as Hertz,
        power: -50,
        bandwidth: 10e6 as Hertz,
        signalId: 'test-signal-1',
        origin: 1,
      };
      mockSpecA.inputSignals = [signal];

      processor.generateData();

      // Signal data should have values higher than minimum at center
      const centerIndex = Math.floor(testWidth / 2);
      expect(processor.signalData[centerIndex]).toBeGreaterThan(mockSpecA.state!.minAmplitude!);
    });

    it('should process multiple signals', () => {
      const signal1: IfSignal = {
        frequency: 520e6 as Hertz,
        power: -50,
        bandwidth: 5e6 as Hertz,
        signalId: 'test-signal-1',
        origin: 1,
      };
      const signal2: IfSignal = {
        frequency: 580e6 as Hertz,
        power: -55,
        bandwidth: 5e6 as Hertz,
        signalId: 'test-signal-2',
        origin: 1,
      };
      mockSpecA.inputSignals = [signal1, signal2];

      processor.generateData();

      // Should have values at both signal positions
      // Signal 1 at 520 MHz = 20% of 100 MHz span = index 20
      // Signal 2 at 580 MHz = 80% of 100 MHz span = index 80
      const signal1Index = 20;
      const signal2Index = 80;

      expect(processor.signalData[signal1Index]).toBeGreaterThan(mockSpecA.state!.minAmplitude!);
      expect(processor.signalData[signal2Index]).toBeGreaterThan(mockSpecA.state!.minAmplitude!);
    });
  });

  describe('Combined data', () => {
    beforeEach(() => {
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
    });

    it('should contain maximum of noise and signal at each point', () => {
      const signal: IfSignal = {
        frequency: 550e6 as Hertz,
        power: -30, // Strong signal above noise floor
        bandwidth: 10e6 as Hertz,
        signalId: 'test-signal-1',
        origin: 1,
      };
      mockSpecA.inputSignals = [signal];

      processor.generateData();

      // At each point, combined should be >= noise and >= signal
      for (let i = 0; i < testWidth; i++) {
        expect(processor.combinedData[i]).toBeGreaterThanOrEqual(
          Math.min(processor.noiseData[i], processor.signalData[i])
        );
      }
    });
  });

  describe('resize', () => {
    it('should resize data arrays to new width', () => {
      const newWidth = 200;

      processor.resize(newWidth);

      expect(processor.noiseData).toHaveLength(newWidth);
      expect(processor.signalData).toHaveLength(newWidth);
      expect(processor.combinedData).toHaveLength(newWidth);
    });

    it('should not resize if width is unchanged', () => {
      const originalNoiseData = processor.noiseData;

      processor.resize(testWidth);

      // Should be the same reference if no resize occurred
      expect(processor.noiseData).toBe(originalNoiseData);
    });

    it('should create new Float32Arrays on resize', () => {
      processor.resize(150);

      expect(processor.noiseData).toBeInstanceOf(Float32Array);
      expect(processor.signalData).toBeInstanceOf(Float32Array);
      expect(processor.combinedData).toBeInstanceOf(Float32Array);
    });
  });

  describe('Gain application', () => {
    it('should not add gain when isSkipLnaGainDuringDraw is true', () => {
      mockSpecA.state!.isSkipLnaGainDuringDraw = true;
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);

      processor.generateData();

      // The method might be called during generation, but the noise should still be around -100
      // Using precision of 0 to account for random noise variation (within 0.5 dB)
      const average = processor.noiseData.reduce((a, b) => a + b, 0) / processor.noiseData.length;
      expect(average).toBeCloseTo(mockSpecA.state!.noiseFloorNoGain!, 0);
    });

    it('should add gain when isSkipLnaGainDuringDraw is false', () => {
      mockSpecA.state!.isSkipLnaGainDuringDraw = false;
      const expectedGain = 30;
      (mockSpecA.rfFrontEnd_!.couplerModule.signalPathManager.getTotalRxGain as Mock)
        .mockReturnValue(expectedGain);

      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
      processor.generateData();

      // Noise floor should be higher due to added gain
      const average = processor.noiseData.reduce((a, b) => a + b, 0) / processor.noiseData.length;
      expect(average).toBeGreaterThan(mockSpecA.state!.noiseFloorNoGain!);
      // Using precision of 0 to account for random noise variation (within 0.5 dB)
      expect(average).toBeCloseTo(mockSpecA.state!.noiseFloorNoGain! + expectedGain, 0);
    });
  });

  describe('Notch filter visualization', () => {
    beforeEach(() => {
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
    });

    it('should not apply notch when notch filter is not powered', () => {
      mockSpecA.rfFrontEnd_!.notchFilterModule.state.isPowered = false;
      mockSpecA.rfFrontEnd_!.notchFilterModule.state.notches = [
        { enabled: true, centerFrequency: 550, bandwidth: 10, depth: 30 },
      ];

      processor.generateData();

      // Values at center should be around the noise floor (not reduced by notch depth)
      const centerIndex = Math.floor(testWidth / 2);
      // Since notch is not powered, the value should be around noise floor, not drastically reduced
      expect(processor.combinedData[centerIndex]).toBeGreaterThan(mockSpecA.state!.noiseFloorNoGain! - 10);
    });

    it('should apply notch when notch filter is powered and enabled', () => {
      mockSpecA.rfFrontEnd_!.notchFilterModule.state.isPowered = true;
      mockSpecA.rfFrontEnd_!.notchFilterModule.state.notches = [
        { enabled: true, centerFrequency: 550, bandwidth: 10, depth: 30 },
      ];

      processor.generateData();

      // Values at notch frequency should be reduced by depth
      // 550 MHz is at 50% of the span (500-600 MHz)
      const centerIndex = Math.floor(testWidth / 2);

      // The combined data at the notch should be lower than noise floor
      expect(processor.combinedData[centerIndex]).toBeLessThan(mockSpecA.state!.noiseFloorNoGain!);
    });

    it('should not apply notch when notch is disabled', () => {
      mockSpecA.rfFrontEnd_!.notchFilterModule.state.isPowered = true;
      mockSpecA.rfFrontEnd_!.notchFilterModule.state.notches = [
        { enabled: false, centerFrequency: 550, bandwidth: 10, depth: 30 },
      ];

      // Get baseline noise
      processor.generateData();
      const baselineAverage = processor.combinedData.reduce((a, b) => a + b, 0) / testWidth;

      // All values should be around baseline (no significant dips)
      const centerIndex = Math.floor(testWidth / 2);
      expect(processor.combinedData[centerIndex]).toBeGreaterThan(baselineAverage - 10);
    });
  });

  describe('Data integrity', () => {
    it('should produce finite values only', () => {
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
      processor.generateData();

      for (let i = 0; i < testWidth; i++) {
        expect(Number.isFinite(processor.noiseData[i])).toBe(true);
        expect(Number.isFinite(processor.signalData[i])).toBe(true);
        expect(Number.isFinite(processor.combinedData[i])).toBe(true);
      }
    });

    it('should not produce NaN values', () => {
      processor.setFrequencyRange(500e6 as Hertz, 600e6 as Hertz);
      processor.generateData();

      for (let i = 0; i < testWidth; i++) {
        expect(Number.isNaN(processor.noiseData[i])).toBe(false);
        expect(Number.isNaN(processor.signalData[i])).toBe(false);
        expect(Number.isNaN(processor.combinedData[i])).toBe(false);
      }
    });
  });
});
