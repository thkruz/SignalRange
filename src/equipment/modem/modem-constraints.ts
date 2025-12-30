/**
 * Modem constraints and validation for L-band equipment.
 *
 * L-band IF (Intermediate Frequency) range: 950-2150 MHz
 * This is the standard range after LNB downconversion from C-band, Ku-band, etc.
 */

export const LBAND_MODEM_CONSTRAINTS = {
  frequency: { min: 950, max: 2150, unit: 'MHz' },
  bandwidth: { min: 0.1, max: 72, unit: 'MHz' },
} as const;

export type ValidationError = {
  field: 'frequency' | 'bandwidth';
  message: string;
  educationalHint?: string;
};

/**
 * Validate modem frequency is within L-band IF range.
 *
 * @param freqMHz - Frequency in MHz
 * @returns ValidationError if invalid, null if valid
 */
export function validateModemFrequency(freqMHz: number): ValidationError | null {
  const { min, max } = LBAND_MODEM_CONSTRAINTS.frequency;

  if (isNaN(freqMHz)) {
    return {
      field: 'frequency',
      message: 'Invalid frequency value',
      educationalHint: 'Please enter a numeric value in MHz.',
    };
  }

  if (freqMHz < min) {
    return {
      field: 'frequency',
      message: `Frequency ${freqMHz} MHz is below L-band range`,
      educationalHint: `L-band IF range is ${min}-${max} MHz. The LNB converts RF signals to this intermediate frequency range.`,
    };
  }

  if (freqMHz > max) {
    return {
      field: 'frequency',
      message: `Frequency ${freqMHz} MHz is above L-band range`,
      educationalHint: `L-band IF range is ${min}-${max} MHz. Higher frequencies require different equipment (e.g., C-band, Ku-band LNBs).`,
    };
  }

  return null;
}

/**
 * Validate modem bandwidth is within equipment capability.
 *
 * @param bwMHz - Bandwidth in MHz
 * @returns ValidationError if invalid, null if valid
 */
export function validateModemBandwidth(bwMHz: number): ValidationError | null {
  const { min, max } = LBAND_MODEM_CONSTRAINTS.bandwidth;

  if (isNaN(bwMHz)) {
    return {
      field: 'bandwidth',
      message: 'Invalid bandwidth value',
      educationalHint: 'Please enter a numeric value in MHz.',
    };
  }

  if (bwMHz < min) {
    return {
      field: 'bandwidth',
      message: `Bandwidth ${bwMHz} MHz is too narrow`,
      educationalHint: `Minimum bandwidth is ${min} MHz. Narrower bandwidths would not carry enough data for typical satellite signals.`,
    };
  }

  if (bwMHz > max) {
    return {
      field: 'bandwidth',
      message: `Bandwidth ${bwMHz} MHz exceeds modem capability`,
      educationalHint: `Maximum bandwidth is ${max} MHz. Wider signals require multiple carriers or higher-capability modems.`,
    };
  }

  return null;
}

/**
 * Validate all modem parameters.
 *
 * @param freqMHz - Frequency in MHz
 * @param bwMHz - Bandwidth in MHz
 * @returns Array of validation errors (empty if all valid)
 */
export function validateModemConfig(freqMHz: number, bwMHz: number): ValidationError[] {
  const errors: ValidationError[] = [];

  const freqError = validateModemFrequency(freqMHz);
  if (freqError) errors.push(freqError);

  const bwError = validateModemBandwidth(bwMHz);
  if (bwError) errors.push(bwError);

  return errors;
}
