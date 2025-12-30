import { formatFrequencyMHz, formatBandwidthMHz } from '../../src/utils/format-number';

describe('format-number utilities', () => {
  describe('formatFrequencyMHz', () => {
    it('should convert Hz to MHz correctly', () => {
      expect(formatFrequencyMHz(1000000)).toBe('1');
      expect(formatFrequencyMHz(1500000000)).toBe('1500');
      expect(formatFrequencyMHz(1100000000)).toBe('1100');
    });

    it('should handle fractional MHz values', () => {
      expect(formatFrequencyMHz(1100500000)).toBe('1100.5');
      expect(formatFrequencyMHz(1400550000)).toBe('1400.55');
      expect(formatFrequencyMHz(1234567890)).toBe('1234.56789');
    });

    it('should avoid floating point artifacts', () => {
      // This is the key test - these values can produce floating point errors
      // e.g., 1400500000 / 1e6 might equal 1400.5000000000002 without proper handling
      const result1 = formatFrequencyMHz(1400500000);
      expect(result1).toBe('1400.5');
      expect(result1).not.toContain('0000000');

      const result2 = formatFrequencyMHz(1234500000);
      expect(result2).toBe('1234.5');
      expect(result2).not.toContain('0000000');
    });

    it('should handle exact integer MHz values', () => {
      expect(formatFrequencyMHz(950000000)).toBe('950');
      expect(formatFrequencyMHz(2150000000)).toBe('2150');
    });

    it('should handle small frequencies', () => {
      expect(formatFrequencyMHz(1000)).toBe('0.001');
      expect(formatFrequencyMHz(100000)).toBe('0.1');
    });

    it('should handle zero', () => {
      expect(formatFrequencyMHz(0)).toBe('0');
    });

    it('should preserve precision for typical satellite frequencies', () => {
      // L-band frequencies after LNB downconversion
      expect(formatFrequencyMHz(950000000)).toBe('950');
      expect(formatFrequencyMHz(1100000000)).toBe('1100');
      expect(formatFrequencyMHz(1500000000)).toBe('1500');
      expect(formatFrequencyMHz(2150000000)).toBe('2150');
    });

    it('should handle frequencies with many decimal places', () => {
      // User might type 1400.123456
      const inputHz = 1400.123456 * 1e6; // 1400123456
      const result = formatFrequencyMHz(inputHz);

      // Should preserve reasonable precision without floating point noise
      expect(result).toBe('1400.123456');
    });

    it('should not add trailing zeros', () => {
      expect(formatFrequencyMHz(1100000000)).toBe('1100');
      expect(formatFrequencyMHz(1100000000)).not.toBe('1100.0');
      expect(formatFrequencyMHz(1100000000)).not.toBe('1100.00');
    });

    it('should handle edge cases for floating point math', () => {
      // Test cases known to cause floating point issues
      // 0.1 + 0.2 !== 0.3 in floating point

      // Simulate a round-trip: user types value, stored in Hz, converted back
      const userInput = 1400.1;
      const storedHz = userInput * 1e6; // 1400100000
      const displayed = formatFrequencyMHz(storedHz);

      expect(displayed).toBe('1400.1');
    });
  });

  describe('formatBandwidthMHz', () => {
    it('should convert Hz to MHz correctly (same as frequency)', () => {
      expect(formatBandwidthMHz(1000000)).toBe('1');
      expect(formatBandwidthMHz(20000000)).toBe('20');
      expect(formatBandwidthMHz(36000000)).toBe('36');
    });

    it('should handle fractional bandwidth values', () => {
      expect(formatBandwidthMHz(100000)).toBe('0.1'); // 0.1 MHz
      expect(formatBandwidthMHz(500000)).toBe('0.5'); // 0.5 MHz
      expect(formatBandwidthMHz(10500000)).toBe('10.5'); // 10.5 MHz
    });

    it('should avoid floating point artifacts', () => {
      const result = formatBandwidthMHz(10500000);
      expect(result).toBe('10.5');
      expect(result).not.toContain('0000000');
    });

    it('should handle typical satellite bandwidth values', () => {
      expect(formatBandwidthMHz(100000)).toBe('0.1'); // 100 kHz
      expect(formatBandwidthMHz(1000000)).toBe('1'); // 1 MHz
      expect(formatBandwidthMHz(10000000)).toBe('10'); // 10 MHz
      expect(formatBandwidthMHz(20000000)).toBe('20'); // 20 MHz
      expect(formatBandwidthMHz(36000000)).toBe('36'); // 36 MHz
      expect(formatBandwidthMHz(72000000)).toBe('72'); // 72 MHz
    });

    it('should handle edge case bandwidths', () => {
      // Very narrow bandwidth (minimum)
      expect(formatBandwidthMHz(100000)).toBe('0.1');

      // Maximum bandwidth
      expect(formatBandwidthMHz(72000000)).toBe('72');
    });
  });

  describe('round-trip precision preservation', () => {
    // These tests verify the main use case: user types a value,
    // it gets stored (possibly in Hz), and displayed back exactly

    it('should preserve user input through storage and display', () => {
      const testCases = [
        '950',
        '1100',
        '1100.5',
        '1400.55',
        '1500.123',
        '2150',
      ];

      testCases.forEach(userInput => {
        const valueMHz = parseFloat(userInput);
        const storedHz = valueMHz * 1e6;
        const displayed = formatFrequencyMHz(storedHz);

        expect(displayed).toBe(userInput);
      });
    });

    it('should handle values that cause floating point issues', () => {
      // These specific values are known to cause issues
      const problematicValues = [
        { input: '0.1', hz: 100000 },
        { input: '0.2', hz: 200000 },
        { input: '0.3', hz: 300000 }, // 0.1 + 0.2 = 0.30000000000000004
        { input: '1.1', hz: 1100000 },
        { input: '1.2', hz: 1200000 },
        { input: '1.3', hz: 1300000 },
      ];

      problematicValues.forEach(({ input, hz }) => {
        const displayed = formatFrequencyMHz(hz);
        expect(displayed).toBe(input);
      });
    });
  });
});
