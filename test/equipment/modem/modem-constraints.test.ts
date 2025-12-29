import {
  LBAND_MODEM_CONSTRAINTS,
  ValidationError,
  validateModemFrequency,
  validateModemBandwidth,
  validateModemConfig,
} from '../../../src/equipment/modem/modem-constraints';

describe('modem-constraints', () => {
  describe('LBAND_MODEM_CONSTRAINTS', () => {
    it('should define L-band frequency constraints', () => {
      expect(LBAND_MODEM_CONSTRAINTS.frequency.min).toBe(950);
      expect(LBAND_MODEM_CONSTRAINTS.frequency.max).toBe(2150);
      expect(LBAND_MODEM_CONSTRAINTS.frequency.unit).toBe('MHz');
    });

    it('should define bandwidth constraints', () => {
      expect(LBAND_MODEM_CONSTRAINTS.bandwidth.min).toBe(0.1);
      expect(LBAND_MODEM_CONSTRAINTS.bandwidth.max).toBe(72);
      expect(LBAND_MODEM_CONSTRAINTS.bandwidth.unit).toBe('MHz');
    });
  });

  describe('validateModemFrequency', () => {
    it('should return null for valid frequency in L-band range', () => {
      expect(validateModemFrequency(950)).toBeNull();
      expect(validateModemFrequency(1100)).toBeNull();
      expect(validateModemFrequency(1500)).toBeNull();
      expect(validateModemFrequency(2150)).toBeNull();
    });

    it('should return error for frequency below L-band range', () => {
      const error = validateModemFrequency(800);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
      expect(error!.message).toContain('800');
      expect(error!.message).toContain('below L-band range');
      expect(error!.educationalHint).toContain('950-2150 MHz');
      expect(error!.educationalHint).toContain('LNB');
    });

    it('should return error for frequency at minimum boundary minus epsilon', () => {
      const error = validateModemFrequency(949.9);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
    });

    it('should return error for frequency above L-band range', () => {
      const error = validateModemFrequency(2500);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
      expect(error!.message).toContain('2500');
      expect(error!.message).toContain('above L-band range');
      expect(error!.educationalHint).toContain('950-2150 MHz');
    });

    it('should return error for frequency at maximum boundary plus epsilon', () => {
      const error = validateModemFrequency(2150.1);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
    });

    it('should return error for NaN frequency', () => {
      const error = validateModemFrequency(NaN);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
      expect(error!.message).toContain('Invalid');
    });

    it('should return error for negative frequency', () => {
      const error = validateModemFrequency(-100);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
    });

    it('should return error for zero frequency', () => {
      const error = validateModemFrequency(0);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('frequency');
    });

    it('should handle floating point frequencies correctly', () => {
      expect(validateModemFrequency(1100.5)).toBeNull();
      expect(validateModemFrequency(1400.55)).toBeNull();
      expect(validateModemFrequency(1400.123456)).toBeNull();
    });
  });

  describe('validateModemBandwidth', () => {
    it('should return null for valid bandwidth', () => {
      expect(validateModemBandwidth(0.1)).toBeNull();
      expect(validateModemBandwidth(1)).toBeNull();
      expect(validateModemBandwidth(20)).toBeNull();
      expect(validateModemBandwidth(72)).toBeNull();
    });

    it('should return error for bandwidth below minimum', () => {
      const error = validateModemBandwidth(0.05);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('bandwidth');
      expect(error!.message).toContain('too narrow');
      expect(error!.educationalHint).toContain('0.1 MHz');
    });

    it('should return error for zero bandwidth', () => {
      const error = validateModemBandwidth(0);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('bandwidth');
    });

    it('should return error for negative bandwidth', () => {
      const error = validateModemBandwidth(-5);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('bandwidth');
    });

    it('should return error for bandwidth above maximum', () => {
      const error = validateModemBandwidth(100);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('bandwidth');
      expect(error!.message).toContain('exceeds modem capability');
      expect(error!.educationalHint).toContain('72 MHz');
    });

    it('should return error for bandwidth at maximum plus epsilon', () => {
      const error = validateModemBandwidth(72.1);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('bandwidth');
    });

    it('should return error for NaN bandwidth', () => {
      const error = validateModemBandwidth(NaN);

      expect(error).not.toBeNull();
      expect(error!.field).toBe('bandwidth');
      expect(error!.message).toContain('Invalid');
    });

    it('should handle floating point bandwidths correctly', () => {
      expect(validateModemBandwidth(0.5)).toBeNull();
      expect(validateModemBandwidth(10.25)).toBeNull();
      expect(validateModemBandwidth(36.125)).toBeNull();
    });
  });

  describe('validateModemConfig', () => {
    it('should return empty array for valid configuration', () => {
      const errors = validateModemConfig(1100, 20);

      expect(errors).toHaveLength(0);
    });

    it('should return frequency error for invalid frequency', () => {
      const errors = validateModemConfig(800, 20);

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('frequency');
    });

    it('should return bandwidth error for invalid bandwidth', () => {
      const errors = validateModemConfig(1100, 100);

      expect(errors).toHaveLength(1);
      expect(errors[0].field).toBe('bandwidth');
    });

    it('should return both errors when both are invalid', () => {
      const errors = validateModemConfig(800, 100);

      expect(errors).toHaveLength(2);
      expect(errors.some(e => e.field === 'frequency')).toBe(true);
      expect(errors.some(e => e.field === 'bandwidth')).toBe(true);
    });

    it('should validate boundary conditions', () => {
      // At boundaries - should be valid
      expect(validateModemConfig(950, 0.1)).toHaveLength(0);
      expect(validateModemConfig(2150, 72)).toHaveLength(0);

      // Just outside boundaries - should be invalid
      expect(validateModemConfig(949, 0.1)).toHaveLength(1);
      expect(validateModemConfig(2151, 72)).toHaveLength(1);
      expect(validateModemConfig(950, 0.09)).toHaveLength(1);
      expect(validateModemConfig(2150, 73)).toHaveLength(1);
    });
  });

  describe('ValidationError type', () => {
    it('should have correct shape', () => {
      const error: ValidationError = {
        field: 'frequency',
        message: 'Test message',
        educationalHint: 'Test hint',
      };

      expect(error.field).toBe('frequency');
      expect(error.message).toBe('Test message');
      expect(error.educationalHint).toBe('Test hint');
    });

    it('should allow optional educationalHint', () => {
      const error: ValidationError = {
        field: 'bandwidth',
        message: 'Test message',
      };

      expect(error.field).toBe('bandwidth');
      expect(error.message).toBe('Test message');
      expect(error.educationalHint).toBeUndefined();
    });
  });
});
