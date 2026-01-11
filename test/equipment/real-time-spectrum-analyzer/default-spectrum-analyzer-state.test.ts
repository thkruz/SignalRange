import { defaultSpectrumAnalyzerState } from '../../../src/equipment/real-time-spectrum-analyzer/defaultSpectrumAnalyzerState';
import { Hertz, dB } from '../../../src/types';

describe('defaultSpectrumAnalyzerState', () => {
  describe('Tap Settings', () => {
    it('should have tap A (TX IF) disabled by default to avoid confusion with RX signals', () => {
      expect(defaultSpectrumAnalyzerState.isUseTapA).toBe(false);
    });

    it('should have tap B (RX IF) enabled by default as the primary tap', () => {
      expect(defaultSpectrumAnalyzerState.isUseTapB).toBe(true);
    });
  });

  describe('Pause and Hold Settings', () => {
    it('should not be paused by default', () => {
      expect(defaultSpectrumAnalyzerState.isPaused).toBe(false);
    });

    it('should not have max hold enabled by default', () => {
      expect(defaultSpectrumAnalyzerState.isMaxHold).toBe(false);
    });

    it('should not have min hold enabled by default', () => {
      expect(defaultSpectrumAnalyzerState.isMinHold).toBe(false);
    });

    it('should not have hold enabled by default', () => {
      expect(defaultSpectrumAnalyzerState.hold).toBe(false);
    });
  });

  describe('Marker Settings', () => {
    it('should have markers disabled by default', () => {
      expect(defaultSpectrumAnalyzerState.isMarkerOn).toBe(false);
    });

    it('should not be updating markers by default', () => {
      expect(defaultSpectrumAnalyzerState.isUpdateMarkers).toBe(false);
    });

    it('should have empty top markers array by default', () => {
      expect(defaultSpectrumAnalyzerState.topMarkers).toEqual([]);
    });

    it('should have marker index at 0 by default', () => {
      expect(defaultSpectrumAnalyzerState.markerIndex).toBe(0);
    });
  });

  describe('Frequency Settings', () => {
    it('should have min frequency of 5 kHz', () => {
      expect(defaultSpectrumAnalyzerState.minFrequency).toBe(5e3 as Hertz);
    });

    it('should have max frequency of 25.5 GHz', () => {
      expect(defaultSpectrumAnalyzerState.maxFrequency).toBe(25.5e9 as Hertz);
    });

    it('should have center frequency of 600 MHz', () => {
      expect(defaultSpectrumAnalyzerState.centerFrequency).toBe(600e6 as Hertz);
    });

    it('should have span of 100 MHz', () => {
      expect(defaultSpectrumAnalyzerState.span).toBe(100e6 as Hertz);
    });

    it('should have last span of 100 MHz', () => {
      expect(defaultSpectrumAnalyzerState.lastSpan).toBe(100e6 as Hertz);
    });

    it('should have RBW of 1 MHz', () => {
      expect(defaultSpectrumAnalyzerState.rbw).toBe(1e6 as Hertz);
    });

    it('should have frequency as the locked control', () => {
      expect(defaultSpectrumAnalyzerState.lockedControl).toBe('freq');
    });
  });

  describe('Amplitude Settings', () => {
    it('should have reference level of 0 dBm', () => {
      expect(defaultSpectrumAnalyzerState.referenceLevel).toBe(0);
    });

    it('should have min amplitude of -100 dBm', () => {
      expect(defaultSpectrumAnalyzerState.minAmplitude).toBe(-100);
    });

    it('should have max amplitude of -40 dBm', () => {
      expect(defaultSpectrumAnalyzerState.maxAmplitude).toBe(-40);
    });

    it('should have scale of 6 dB per division', () => {
      expect(defaultSpectrumAnalyzerState.scaleDbPerDiv).toBe(6 as dB);
    });

    it('should have noise floor without gain of -104 dBm', () => {
      expect(defaultSpectrumAnalyzerState.noiseFloorNoGain).toBe(-104);
    });
  });

  describe('Display Settings', () => {
    it('should skip LNA gain during draw by default', () => {
      expect(defaultSpectrumAnalyzerState.isSkipLnaGainDuringDraw).toBe(true);
    });

    it('should have refresh rate of 10 Hz', () => {
      expect(defaultSpectrumAnalyzerState.refreshRate).toBe(10);
    });

    it('should have screen mode as spectralDensity', () => {
      expect(defaultSpectrumAnalyzerState.screenMode).toBe('spectralDensity');
    });

    it('should have input unit as MHz', () => {
      expect(defaultSpectrumAnalyzerState.inputUnit).toBe('MHz');
    });

    it('should have empty input value', () => {
      expect(defaultSpectrumAnalyzerState.inputValue).toBe('');
    });
  });

  describe('Multi-Trace Support', () => {
    it('should have 3 traces defined', () => {
      expect(defaultSpectrumAnalyzerState.traces).toHaveLength(3);
    });

    it('should have all traces visible by default', () => {
      expect(defaultSpectrumAnalyzerState.traces![0].isVisible).toBe(true);
      expect(defaultSpectrumAnalyzerState.traces![1].isVisible).toBe(true);
      expect(defaultSpectrumAnalyzerState.traces![2].isVisible).toBe(true);
    });

    it('should have all traces updating by default', () => {
      expect(defaultSpectrumAnalyzerState.traces![0].isUpdating).toBe(true);
      expect(defaultSpectrumAnalyzerState.traces![1].isUpdating).toBe(true);
      expect(defaultSpectrumAnalyzerState.traces![2].isUpdating).toBe(true);
    });

    it('should have all traces in clearwrite mode by default', () => {
      expect(defaultSpectrumAnalyzerState.traces![0].mode).toBe('clearwrite');
      expect(defaultSpectrumAnalyzerState.traces![1].mode).toBe('clearwrite');
      expect(defaultSpectrumAnalyzerState.traces![2].mode).toBe('clearwrite');
    });

    it('should have selected trace as 1 by default', () => {
      expect(defaultSpectrumAnalyzerState.selectedTrace).toBe(1);
    });
  });

  describe('Amplitude Range Validation', () => {
    it('should have a 60 dB dynamic range', () => {
      const dynamicRange = defaultSpectrumAnalyzerState.maxAmplitude! - defaultSpectrumAnalyzerState.minAmplitude!;
      expect(dynamicRange).toBe(60);
    });

    it('should have 10 divisions (6 dB each) covering the dynamic range', () => {
      const dynamicRange = defaultSpectrumAnalyzerState.maxAmplitude! - defaultSpectrumAnalyzerState.minAmplitude!;
      const divisions = dynamicRange / (defaultSpectrumAnalyzerState.scaleDbPerDiv as number);
      expect(divisions).toBe(10);
    });
  });

  describe('Frequency Range Validation', () => {
    it('should have valid frequency span (less than max - min)', () => {
      const span = defaultSpectrumAnalyzerState.span as number;
      const maxRange = (defaultSpectrumAnalyzerState.maxFrequency as number) - (defaultSpectrumAnalyzerState.minFrequency as number);
      expect(span).toBeLessThan(maxRange);
    });

    it('should have center frequency within valid range', () => {
      const center = defaultSpectrumAnalyzerState.centerFrequency as number;
      const min = defaultSpectrumAnalyzerState.minFrequency as number;
      const max = defaultSpectrumAnalyzerState.maxFrequency as number;
      expect(center).toBeGreaterThan(min);
      expect(center).toBeLessThan(max);
    });

    it('should have valid start and stop frequencies based on center and span', () => {
      const center = defaultSpectrumAnalyzerState.centerFrequency as number;
      const span = defaultSpectrumAnalyzerState.span as number;
      const min = defaultSpectrumAnalyzerState.minFrequency as number;
      const max = defaultSpectrumAnalyzerState.maxFrequency as number;

      const startFreq = center - span / 2;
      const stopFreq = center + span / 2;

      expect(startFreq).toBeGreaterThanOrEqual(min);
      expect(stopFreq).toBeLessThanOrEqual(max);
    });
  });
});
