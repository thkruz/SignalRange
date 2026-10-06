import { dBm } from '@app/types';
import { ADCConfig, DEFAULT_ADC_CONFIG } from '../../../src/equipment/receiver/adc-constants';
import { calculateADCDegradation, clippingSdrLinear, quantizationSnrLinear } from '../../../src/equipment/receiver/adc-degradation';

/** A 30 Msps carrier that is the whole composite, at 15 dB Es/N0 */
const carrierAt = (power: number, esN0 = 15, symbolRate = 30e6) => ({ power_dBm: power, esN0_dB: esN0, symbolRate_Hz: symbolRate });

describe('adc-degradation (phase 19.5 quantization + clipping model)', () => {
  describe('levels', () => {
    it('reports the composite level in dBFS against the -22 dBm full scale', () => {
      expect(calculateADCDegradation(-30 as dBm).inputLevel_dBFS).toBe(-8);
      expect(calculateADCDegradation(-22 as dBm).inputLevel_dBFS).toBe(0);
    });
  });

  describe('the sweet spot', () => {
    it('costs a 15 dB carrier nothing measurable across the AGC operating window', () => {
      for (const level of [-28, -30, -35, -40, -45]) {
        const result = calculateADCDegradation(level as dBm, carrierAt(level));
        expect(result.status, `${level} dBm`).toBe('optimal');
        expect(result.totalPenalty_dB, `${level} dBm`).toBeLessThan(0.3);
      }
    });
  });

  describe('quantization', () => {
    it('grows as the drive falls: about 1 dB lost per dB once quantization noise dominates', () => {
      const a = calculateADCDegradation(-70 as dBm, carrierAt(-70));
      const b = calculateADCDegradation(-75 as dBm, carrierAt(-75));
      expect(b.quantizationPenalty_dB).toBeGreaterThan(a.quantizationPenalty_dB);
      // Deep in the quantization-limited region SNR_q falls 1:1 with level
      const deep1 = calculateADCDegradation(-90 as dBm, carrierAt(-90));
      const deep2 = calculateADCDegradation(-95 as dBm, carrierAt(-95));
      expect(deep2.quantizationSnr_dB - deep1.quantizationSnr_dB).toBeCloseTo(-5, 6);
    });

    it('marks low-level once the penalty reaches 0.5 dB and severe-low at 3 dB', () => {
      const statuses = [-55, -60, -65, -70, -75].map((l) => calculateADCDegradation(l as dBm, carrierAt(l)));
      expect(statuses.some((r) => r.status === 'low-level')).toBe(true);
      expect(statuses.some((r) => r.status === 'severe-low')).toBe(true);
      for (const r of statuses) {
        if (r.status === 'low-level') expect(r.quantizationPenalty_dB).toBeGreaterThanOrEqual(0.5);
        if (r.status === 'severe-low') expect(r.quantizationPenalty_dB).toBeGreaterThanOrEqual(3);
      }
    });

    it('hurts a narrow carrier less (processing gain: quantization noise spreads over fs/2)', () => {
      const wide = calculateADCDegradation(-60 as dBm, carrierAt(-60, 15, 30e6));
      const narrow = calculateADCDegradation(-60 as dBm, carrierAt(-60, 15, 1e6));
      expect(narrow.quantizationPenalty_dB).toBeLessThan(wide.quantizationPenalty_dB);
      expect(narrow.quantizationSnr_dB - wide.quantizationSnr_dB).toBeCloseTo(10 * Math.log10(30), 6);
    });

    it('scales with ENOB: two more bits buy 12 dB of quantization SNR', () => {
      const tenBit: ADCConfig = { ...DEFAULT_ADC_CONFIG, enob: 10 };
      expect(10 * Math.log10(quantizationSnrLinear(-40, 30e6, tenBit) / quantizationSnrLinear(-40, 30e6))).toBeCloseTo(12.04, 6);
    });
  });

  describe('clipping', () => {
    it('distortion rises steeply as the composite approaches full scale', () => {
      const sdr = [-12, -6, -3, 0, 3].map((l) => 10 * Math.log10(clippingSdrLinear(l)));
      for (let i = 1; i < sdr.length; i++) {
        expect(sdr[i]).toBeLessThan(sdr[i - 1]);
      }
      expect(sdr[0]).toBeGreaterThan(80);
      expect(sdr[3]).toBeGreaterThan(10);
      expect(sdr[3]).toBeLessThan(16);
    });

    it('lights the clip indicator above -2 dBFS and goes severe once it costs 3 dB', () => {
      expect(calculateADCDegradation(-23 as dBm, carrierAt(-23)).status).toBe('clipping');
      expect(calculateADCDegradation(-16 as dBm, carrierAt(-16)).status).toBe('severe-clipping');
      expect(calculateADCDegradation(-16 as dBm, carrierAt(-16)).clipPenalty_dB).toBeGreaterThanOrEqual(3);
    });

    it('costs a clean carrier more than a noisy one (the distortion adds to its own noise)', () => {
      const clean = calculateADCDegradation(-22 as dBm, carrierAt(-22, 20));
      const noisy = calculateADCDegradation(-22 as dBm, carrierAt(-22, 5));
      expect(clean.clipPenalty_dB).toBeGreaterThan(noisy.clipPenalty_dB);
    });
  });

  describe('combination', () => {
    it('adds the impairments as noise powers, so the total is at least each part', () => {
      const r = calculateADCDegradation(-22 as dBm, carrierAt(-60));
      expect(r.totalPenalty_dB).toBeGreaterThanOrEqual(r.clipPenalty_dB - 1e-9);
      expect(r.totalPenalty_dB).toBeGreaterThanOrEqual(r.quantizationPenalty_dB - 1e-9);
      expect(r.totalPenalty_dB).toBeLessThanOrEqual(r.clipPenalty_dB + r.quantizationPenalty_dB + 1e-9);
    });

    it('defaults to a 15 dB, 30 Msps carrier when only the level is known', () => {
      expect(calculateADCDegradation(-30 as dBm)).toEqual(calculateADCDegradation(-30 as dBm, carrierAt(-30)));
    });
  });
});
