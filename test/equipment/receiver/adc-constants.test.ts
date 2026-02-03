import { dB, dBFS, dBm } from '@app/types';
import {
  ADCConfig,
  DEFAULT_ADC_CONFIG,
  dBmToDbfs,
  dBfsToDbm,
} from '../../../src/equipment/receiver/adc-constants';

describe('adc-constants', () => {
  describe('DEFAULT_ADC_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ADC_CONFIG.targetLevel_dBFS).toBe(-8);
      expect(DEFAULT_ADC_CONFIG.clipThreshold_dBFS).toBe(-2);
      expect(DEFAULT_ADC_CONFIG.quantizationThreshold_dBFS).toBe(-20);
      expect(DEFAULT_ADC_CONFIG.fullScale_dBm).toBe(-22);
      expect(DEFAULT_ADC_CONFIG.enob).toBe(12);
    });

    it('should have proper sweet spot relationship', () => {
      // The sweet spot is the range between clip and quantization thresholds
      const sweetSpotRange =
        DEFAULT_ADC_CONFIG.clipThreshold_dBFS - DEFAULT_ADC_CONFIG.quantizationThreshold_dBFS;
      expect(sweetSpotRange).toBe(18); // -2 - (-20) = 18 dB of optimal range
    });

    it('should have target level within the sweet spot', () => {
      expect(DEFAULT_ADC_CONFIG.targetLevel_dBFS).toBeLessThan(
        DEFAULT_ADC_CONFIG.clipThreshold_dBFS
      );
      expect(DEFAULT_ADC_CONFIG.targetLevel_dBFS).toBeGreaterThan(
        DEFAULT_ADC_CONFIG.quantizationThreshold_dBFS
      );
    });
  });

  describe('dBmToDbfs', () => {
    it('should convert dBm to dBFS using default config', () => {
      // At -22 dBm (full scale), dBFS should be 0
      expect(dBmToDbfs(-22 as dBm)).toBe(0);

      // At -30 dBm (AGC target), dBFS should be -8
      expect(dBmToDbfs(-30 as dBm)).toBe(-8);

      // At -42 dBm (low level), dBFS should be -20
      expect(dBmToDbfs(-42 as dBm)).toBe(-20);
    });

    it('should handle positive dBFS values (clipping region)', () => {
      // Signal above full scale
      expect(dBmToDbfs(-20 as dBm)).toBe(2);
      expect(dBmToDbfs(-12 as dBm)).toBe(10);
    });

    it('should handle very low signals', () => {
      // Very low signal below quantization threshold
      expect(dBmToDbfs(-52 as dBm)).toBe(-30);
      expect(dBmToDbfs(-62 as dBm)).toBe(-40);
    });

    it('should use custom config when provided', () => {
      const customConfig: ADCConfig = {
        targetLevel_dBFS: -10 as dBFS,
        clipThreshold_dBFS: -3 as dBFS,
        quantizationThreshold_dBFS: -25 as dBFS,
        fullScale_dBm: -15 as dBm, // Different full scale reference
        enob: 14,
      };

      // At -15 dBm (custom full scale), dBFS should be 0
      expect(dBmToDbfs(-15 as dBm, customConfig)).toBe(0);

      // At -25 dBm, dBFS should be -10
      expect(dBmToDbfs(-25 as dBm, customConfig)).toBe(-10);
    });

    it('should maintain linear relationship', () => {
      // Every 1 dBm change should result in 1 dBFS change
      const base = dBmToDbfs(-30 as dBm);
      expect(dBmToDbfs(-29 as dBm)).toBe(base + 1);
      expect(dBmToDbfs(-31 as dBm)).toBe(base - 1);
      expect(dBmToDbfs(-25 as dBm)).toBe(base + 5);
      expect(dBmToDbfs(-35 as dBm)).toBe(base - 5);
    });
  });

  describe('dBfsToDbm', () => {
    it('should convert dBFS to dBm using default config', () => {
      // At 0 dBFS, should be -22 dBm (full scale)
      expect(dBfsToDbm(0 as dBFS)).toBe(-22);

      // At -8 dBFS (target), should be -30 dBm
      expect(dBfsToDbm(-8 as dBFS)).toBe(-30);

      // At -20 dBFS (quantization threshold), should be -42 dBm
      expect(dBfsToDbm(-20 as dBFS)).toBe(-42);
    });

    it('should handle positive dBFS values', () => {
      // Above full scale
      expect(dBfsToDbm(2 as dBFS)).toBe(-20);
      expect(dBfsToDbm(10 as dBFS)).toBe(-12);
    });

    it('should handle very negative dBFS values', () => {
      expect(dBfsToDbm(-30 as dBFS)).toBe(-52);
      expect(dBfsToDbm(-40 as dBFS)).toBe(-62);
    });

    it('should use custom config when provided', () => {
      const customConfig: ADCConfig = {
        targetLevel_dBFS: -10 as dBFS,
        clipThreshold_dBFS: -3 as dBFS,
        quantizationThreshold_dBFS: -25 as dBFS,
        fullScale_dBm: -15 as dBm,
        enob: 14,
      };

      expect(dBfsToDbm(0 as dBFS, customConfig)).toBe(-15);
      expect(dBfsToDbm(-10 as dBFS, customConfig)).toBe(-25);
    });

    it('should maintain linear relationship', () => {
      const base = dBfsToDbm(-8 as dBFS);
      expect(dBfsToDbm(-7 as dBFS)).toBe(base + 1);
      expect(dBfsToDbm(-9 as dBFS)).toBe(base - 1);
      expect(dBfsToDbm(-3 as dBFS)).toBe(base + 5);
      expect(dBfsToDbm(-13 as dBFS)).toBe(base - 5);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve values through dBm -> dBFS -> dBm conversion', () => {
      const testValues = [-50, -42, -30, -22, -15, -10, 0] as dBm[];

      testValues.forEach((dBmValue) => {
        const dBFSValue = dBmToDbfs(dBmValue);
        const roundTrip = dBfsToDbm(dBFSValue);
        expect(roundTrip).toBe(dBmValue);
      });
    });

    it('should preserve values through dBFS -> dBm -> dBFS conversion', () => {
      const testValues = [-40, -20, -8, 0, 5, 10] as dBFS[];

      testValues.forEach((dBFSValue) => {
        const dBmValue = dBfsToDbm(dBFSValue);
        const roundTrip = dBmToDbfs(dBmValue);
        expect(roundTrip).toBe(dBFSValue);
      });
    });

    it('should work with custom config for round-trip', () => {
      const customConfig: ADCConfig = {
        targetLevel_dBFS: -12 as dBFS,
        clipThreshold_dBFS: -4 as dBFS,
        quantizationThreshold_dBFS: -30 as dBFS,
        fullScale_dBm: -18 as dBm,
        enob: 16,
      };

      const dBmValue = -35 as dBm;
      const dBFSValue = dBmToDbfs(dBmValue, customConfig);
      const roundTrip = dBfsToDbm(dBFSValue, customConfig);
      expect(roundTrip).toBe(dBmValue);
    });
  });
});
