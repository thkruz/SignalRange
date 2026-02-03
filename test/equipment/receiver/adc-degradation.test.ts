import { dB, dBFS, dBm } from '@app/types';
import {
  ADCDegradationResult,
  ADCStatus,
  calculateADCDegradation,
} from '../../../src/equipment/receiver/adc-degradation';
import { ADCConfig, DEFAULT_ADC_CONFIG } from '../../../src/equipment/receiver/adc-constants';

describe('adc-degradation', () => {
  describe('calculateADCDegradation', () => {
    describe('optimal region', () => {
      it('should return optimal status at AGC target level (-30 dBm)', () => {
        const result = calculateADCDegradation(-30 as dBm);

        expect(result.status).toBe('optimal');
        expect(result.inputLevel_dBFS).toBe(-8); // -30 - (-22) = -8 dBFS
        expect(result.clipPenalty_dB).toBe(0);
        expect(result.quantizationPenalty_dB).toBe(0);
        expect(result.totalPenalty_dB).toBe(0);
      });

      it('should return optimal status within the sweet spot', () => {
        // Sweet spot is between -2 dBFS (clip) and -20 dBFS (quantization)
        // That maps to -24 dBm to -42 dBm with default config

        const testLevels = [-24, -28, -30, -35, -40] as dBm[];

        testLevels.forEach((level) => {
          const result = calculateADCDegradation(level);
          expect(result.status).toBe('optimal');
          expect(result.totalPenalty_dB).toBe(0);
        });
      });

      it('should have zero penalties at exact thresholds', () => {
        // Just at clip threshold: -22 + (-2) = -24 dBm
        const atClipThreshold = calculateADCDegradation(-24 as dBm);
        expect(atClipThreshold.clipPenalty_dB).toBe(0);
        expect(atClipThreshold.status).toBe('optimal');

        // Just at quantization threshold: -22 + (-20) = -42 dBm
        const atQuantThreshold = calculateADCDegradation(-42 as dBm);
        expect(atQuantThreshold.quantizationPenalty_dB).toBe(0);
        expect(atQuantThreshold.status).toBe('optimal');
      });
    });

    describe('clipping region', () => {
      it('should detect clipping above clip threshold', () => {
        // Above clip threshold (-24 dBm with default config)
        const result = calculateADCDegradation(-22 as dBm);

        expect(result.status).toBe('clipping');
        expect(result.inputLevel_dBFS).toBe(0); // At full scale
        expect(result.clipPenalty_dB).toBeGreaterThan(0);
        expect(result.quantizationPenalty_dB).toBe(0);
      });

      it('should apply exponential penalty for overdrive', () => {
        // Test that penalty increases exponentially with overdrive
        const level1 = calculateADCDegradation(-23 as dBm); // 1 dB overdrive
        const level2 = calculateADCDegradation(-21 as dBm); // 3 dB overdrive
        const level3 = calculateADCDegradation(-18 as dBm); // 6 dB overdrive

        expect(level2.clipPenalty_dB).toBeGreaterThan(level1.clipPenalty_dB);
        expect(level3.clipPenalty_dB).toBeGreaterThan(level2.clipPenalty_dB);

        // Verify exponential nature: 6 dB overdrive should give much more than 2x penalty of 3 dB
        const ratio = level3.clipPenalty_dB / level2.clipPenalty_dB;
        expect(ratio).toBeGreaterThan(2);
      });

      it('should mark severe clipping above 6 dB overdrive', () => {
        // 6+ dB overdrive = severe clipping
        // Clip threshold at -2 dBFS = -24 dBm
        // 6 dB overdrive means -18 dBm (4 dBFS)
        const result = calculateADCDegradation(-16 as dBm);

        expect(result.status).toBe('severe-clipping');
        expect(result.inputLevel_dBFS).toBe(6); // -16 - (-22) = 6 dBFS
      });

      it('should still be regular clipping at exactly 6 dB overdrive', () => {
        // At exactly 6 dB overdrive: clip threshold (-2) + 6 = 4 dBFS = -18 dBm
        const result = calculateADCDegradation(-18 as dBm);

        expect(result.status).toBe('clipping');
        expect(result.inputLevel_dBFS).toBe(4);
      });
    });

    describe('low-level region (quantization noise)', () => {
      it('should detect low-level below quantization threshold', () => {
        // Below quantization threshold (-42 dBm with default config)
        const result = calculateADCDegradation(-48 as dBm);

        expect(result.status).toBe('low-level');
        expect(result.inputLevel_dBFS).toBe(-26); // -48 - (-22) = -26 dBFS
        expect(result.quantizationPenalty_dB).toBeGreaterThan(0);
        expect(result.clipPenalty_dB).toBe(0);
      });

      it('should apply 6.02 dB penalty per bit lost', () => {
        // 6 dB below threshold = ~1 bit lost
        const result6dBBelow = calculateADCDegradation(-48 as dBm); // -26 dBFS, 6 dB below -20

        // Penalty should be approximately 6.02 dB
        expect(result6dBBelow.quantizationPenalty_dB).toBeCloseTo(6.02, 1);

        // 12 dB below threshold = ~2 bits lost
        const result12dBBelow = calculateADCDegradation(-54 as dBm); // -32 dBFS, 12 dB below -20

        expect(result12dBBelow.quantizationPenalty_dB).toBeCloseTo(12.04, 1);
      });

      it('should mark severe-low for signals more than 12 dB below threshold', () => {
        // 12+ dB below quantization threshold
        // Quantization threshold at -20 dBFS = -42 dBm
        // 12 dB below = -54 dBm
        const result = calculateADCDegradation(-56 as dBm);

        expect(result.status).toBe('severe-low');
      });

    });

    describe('total penalty', () => {
      it('should sum clip and quantization penalties', () => {
        // This is an edge case where both penalties could theoretically apply
        // (though in practice clip takes precedence for status)
        const result = calculateADCDegradation(-30 as dBm);

        expect(result.totalPenalty_dB).toBe(
          result.clipPenalty_dB + result.quantizationPenalty_dB
        );
      });

      it('should have total penalty equal to clip penalty when clipping', () => {
        const result = calculateADCDegradation(-20 as dBm);

        expect(result.totalPenalty_dB).toBe(result.clipPenalty_dB);
        expect(result.quantizationPenalty_dB).toBe(0);
      });

      it('should have total penalty equal to quantization penalty when low', () => {
        const result = calculateADCDegradation(-50 as dBm);

        expect(result.totalPenalty_dB).toBe(result.quantizationPenalty_dB);
        expect(result.clipPenalty_dB).toBe(0);
      });
    });

    describe('inputLevel_dBFS', () => {
      it('should correctly calculate input level in dBFS', () => {
        // fullScale_dBm is -22 dBm by default
        expect(calculateADCDegradation(-22 as dBm).inputLevel_dBFS).toBe(0);
        expect(calculateADCDegradation(-30 as dBm).inputLevel_dBFS).toBe(-8);
        expect(calculateADCDegradation(-12 as dBm).inputLevel_dBFS).toBe(10);
        expect(calculateADCDegradation(-42 as dBm).inputLevel_dBFS).toBe(-20);
      });
    });

    describe('custom config', () => {
      const customConfig: ADCConfig = {
        targetLevel_dBFS: -10 as dBFS,
        clipThreshold_dBFS: -4 as dBFS,
        quantizationThreshold_dBFS: -25 as dBFS,
        fullScale_dBm: -15 as dBm,
        enob: 10,
      };

      it('should use custom full scale reference', () => {
        const result = calculateADCDegradation(-15 as dBm, customConfig);
        expect(result.inputLevel_dBFS).toBe(0);
      });

      it('should use custom clip threshold', () => {
        // Clip threshold at -4 dBFS = -15 + (-4) = -19 dBm
        const optimal = calculateADCDegradation(-20 as dBm, customConfig);
        expect(optimal.status).toBe('optimal');
        expect(optimal.clipPenalty_dB).toBe(0);

        const clipping = calculateADCDegradation(-18 as dBm, customConfig);
        expect(clipping.status).toBe('clipping');
        expect(clipping.clipPenalty_dB).toBeGreaterThan(0);
      });

      it('should use custom quantization threshold', () => {
        // Quantization threshold at -25 dBFS = -15 + (-25) = -40 dBm
        const optimal = calculateADCDegradation(-39 as dBm, customConfig);
        expect(optimal.status).toBe('optimal');
        expect(optimal.quantizationPenalty_dB).toBe(0);

        const lowLevel = calculateADCDegradation(-42 as dBm, customConfig);
        expect(lowLevel.status).toBe('low-level');
        expect(lowLevel.quantizationPenalty_dB).toBeGreaterThan(0);
      });

      it('should use custom ENOB for penalty cap', () => {
        const maxPenalty = customConfig.enob * 6.02;
        const result = calculateADCDegradation(-150 as dBm, customConfig);

        expect(result.quantizationPenalty_dB).toBeLessThanOrEqual(maxPenalty);
        expect(result.quantizationPenalty_dB).toBeCloseTo(maxPenalty, 0);
      });
    });

    describe('edge cases', () => {
      it('should handle zero dBm input', () => {
        const result = calculateADCDegradation(0 as dBm);

        expect(result.inputLevel_dBFS).toBe(22); // 0 - (-22) = 22 dBFS
        expect(result.status).toBe('severe-clipping');
        expect(result.clipPenalty_dB).toBeGreaterThan(10);
      });

      it('should handle very high power input', () => {
        const result = calculateADCDegradation(10 as dBm);

        expect(result.inputLevel_dBFS).toBe(32);
        expect(result.status).toBe('severe-clipping');
      });

      it('should handle very low power input', () => {
        const result = calculateADCDegradation(-100 as dBm);

        expect(result.inputLevel_dBFS).toBe(-78);
        expect(result.status).toBe('severe-low');
        // -78 dBFS is 58 dB below -20 dBFS threshold
        // Penalty = 58 dB (below ENOB cap of 72.24)
        expect(result.quantizationPenalty_dB).toBeCloseTo(58, 0);
      });

      it('should cap penalty at ENOB limit for extremely low signals', () => {
        // Need a signal low enough to exceed ENOB cap
        // Cap = 12 * 6.02 = 72.24 dB
        // Threshold = -20 dBFS = -42 dBm
        // Need underdrive > 72.24 dB, so level < -20 - 72.24 = -92.24 dBFS
        // In dBm: -22 + (-92.24) = -114.24 dBm
        const result = calculateADCDegradation(-120 as dBm);

        const maxPenalty = DEFAULT_ADC_CONFIG.enob * 6.02;
        expect(result.quantizationPenalty_dB).toBeCloseTo(maxPenalty, 0);
      });

      it('should handle fractional dBm values', () => {
        const result = calculateADCDegradation(-30.5 as dBm);

        expect(result.inputLevel_dBFS).toBeCloseTo(-8.5, 5);
        expect(result.status).toBe('optimal');
      });
    });

    describe('status priority', () => {
      it('should prioritize clipping status over low-level', () => {
        // This tests the edge case where both conditions might theoretically
        // be true (though physically impossible)
        // In the actual code, clipping is checked first and prevents low-level status

        const clipping = calculateADCDegradation(-20 as dBm);
        expect(clipping.status).toBe('clipping');
        // No quantization penalty when clipping
        expect(clipping.quantizationPenalty_dB).toBe(0);
      });
    });
  });
});
