import { Hertz } from "@app/types";

/**
 * Antenna configuration interface
 * Defines physical and performance characteristics of an antenna
 */
export interface AntennaConfig {
  /** Antenna model name or identifier */
  name: string;
  /** Antenna diameter in meters */
  diameter: number;
  /** Antenna efficiency (0-1, typically 0.5-0.7 for parabolic dishes) - illumination/spill only (surface Ruze applied separately) */
  efficiency: number;
  /** Primary frequency band (for display/identification) */
  band: 'L' | 'S' | 'C' | 'X' | 'Ku' | 'Ka' | 'Q' | 'V';
  /** Minimum receiving frequency in Hz */
  minRxFrequency: Hertz;
  /** Maximum receiving frequency in Hz */
  maxRxFrequency: Hertz;
  /** Minimum transmitting frequency in Hz */
  minTxFrequency: Hertz;
  /** Maximum transmitting frequency in Hz */
  maxTxFrequency: Hertz;
  /** Feed loss in dB (backward compatibility - used if feedLossModel not specified) */
  feedLoss: number;

  // --- RF Realism Parameters ---
  /** Surface RMS error in meters (e.g., 0.00025-0.0005 for professional 9m dishes) */
  surfaceRms_m?: number;
  /** Projected fractional area blocked by subreflector/struts (0-0.12 typical) */
  blockageFraction?: number;
  /** Cross-polarization discrimination in dB (linear, co-pol vs cross-pol), e.g., 30-35 dB */
  xpd_dB?: number;
  /** Polarization type */
  polType?: 'linear' | 'circular';
  /** Frequency-dependent feed loss model: L(f) = a + b*sqrt(f_GHz) + c*f_GHz (dB) */
  feedLossModel?: { a: number; b: number; c: number };

  // --- Pattern / Pointing Parameters ---
  /** Beamwidth constant k for HPBW ≈ k*λ/D (degrees), typically 70 */
  kBeamConst?: number;
  /** Antenna pattern model type */
  patternModel?: 'ITU465' | 'ParabolicSimple';
  /** Pointing jitter RMS in degrees (e.g., 0.01-0.03°) */
  pointingSigma_deg?: number;

  // --- System Noise Parameters (for G/T) ---
  /** LNA noise figure in dB */
  lnaNF_dB?: number;
  /** Receive chain loss between feed and LNA in dB (adds noise) */
  rxChainLoss_dB?: number;
  /** Physical temperature for noise calculations in Kelvin */
  rxPhysTemp_K?: number;
  /** Sky temperature model type */
  skyTempModel?: 'CbandSimple';
  /** Atmospheric loss model type */
  atmosModel?: 'ITU_R_P676_Simple';

  // --- Mechanical / Environment Parameters ---
  /** Elevation range in degrees [min, max] */
  elRange_deg?: [number, number];
  /** Whether azimuth is continuous */
  azContinuous?: boolean;
  /** Maximum slew rate in degrees per second */
  maxRate_deg_s?: number;
  /** De-pointing coefficient: de-pointing ≈ coef * wind(m/s) in degrees */
  windDePointingCoef_deg_per_mps?: number;
}

/**
 * Predefined antenna configurations for common ground station antennas
 */
export const ANTENNA_CONFIGS: Record<string, AntennaConfig> = {
  // C-Band antennas - Professional VertexRSI 9m with realistic RF physics
  'C_BAND_9M_VERTEX': {
    name: 'VertexRSI 9m C-Band',
    diameter: 9.0,
    efficiency: 0.70, // Illumination + spill only (Ruze applied separately)
    band: 'C',
    minRxFrequency: 3.4e9 as Hertz, // 3.4 GHz (lower for flexibility)
    maxRxFrequency: 4.2e9 as Hertz, // 4.2 GHz
    minTxFrequency: 5.85e9 as Hertz, // 5.85 GHz
    maxTxFrequency: 6.425e9 as Hertz, // 6.425 GHz
    feedLoss: 0.8, // Legacy fallback

    // RF realism
    surfaceRms_m: 0.00035, // 0.35 mm surface RMS
    blockageFraction: 0.07, // 7% projected area blocked
    xpd_dB: 32, // 32 dB cross-pol discrimination
    polType: 'linear',
    feedLossModel: { a: 0.4, b: 0.25, c: 0.02 }, // Frequency-dependent feed loss

    // Pattern/pointing
    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.015, // 0.015° RMS pointing jitter

    // System noise (for G/T)
    lnaNF_dB: 0.7, // High-quality C-band LNA
    rxChainLoss_dB: 0.5, // Feed-to-LNA loss
    rxPhysTemp_K: 290, // Ambient temperature
    skyTempModel: 'CbandSimple',
    atmosModel: 'ITU_R_P676_Simple',
    // Mechanical
    elRange_deg: [5, 90],
    azContinuous: true,
    maxRate_deg_s: 1.2,
    windDePointingCoef_deg_per_mps: 0.0025,
  },
  // C-Band antennas - Basic models
  'C_BAND_9M': {
    name: '9m C-Band',
    diameter: 9.0,
    efficiency: 0.65,
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz, // 3.625 GHz
    maxRxFrequency: 4.2e9 as Hertz, // 4.2 GHz
    minTxFrequency: 5.85e9 as Hertz, // 5.85 GHz
    maxTxFrequency: 6.425e9 as Hertz, // 6.425 GHz
    feedLoss: 0.8,
  },
  'C_BAND_7M': {
    name: '7m C-Band',
    diameter: 7.0,
    efficiency: 0.65,
    band: 'C',
    minRxFrequency: 3.7e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.7,
  },
  'C_BAND_4M': {
    name: '4m C-Band',
    diameter: 4.0,
    efficiency: 0.62,
    band: 'C',
    minRxFrequency: 3.7e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.5,
  },
  'C_BAND_2M': {
    name: '2m C-Band',
    diameter: 2.0,
    efficiency: 0.60,
    band: 'C',
    minRxFrequency: 3.7e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.5,
  },

  // Ku-Band antennas
  'KU_BAND_3M': {
    name: '3m Ku-Band',
    diameter: 3.0,
    efficiency: 0.65,
    band: 'Ku',
    minRxFrequency: 10.7e9 as Hertz, // 10.7 GHz
    maxRxFrequency: 12.75e9 as Hertz, // 12.75 GHz
    minTxFrequency: 12.75e9 as Hertz, // 12.75 GHz
    maxTxFrequency: 14.5e9 as Hertz, // 14.5 GHz
    feedLoss: 0.6,
  },
  'KU_BAND_2M': {
    name: '2m Ku-Band',
    diameter: 2.0,
    efficiency: 0.63,
    band: 'Ku',
    minRxFrequency: 10.7e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 12.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.5,
  },
  'KU_BAND_1M2': {
    name: '1.2m Ku-Band',
    diameter: 1.2,
    efficiency: 0.60,
    band: 'Ku',
    minRxFrequency: 10.7e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 12.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.4,
  },

  // Ka-Band antennas
  'KA_BAND_1M8': {
    name: '1.8m Ka-Band',
    diameter: 1.8,
    efficiency: 0.62,
    band: 'Ka',
    minRxFrequency: 17.7e9 as Hertz, // 17.7 GHz
    maxRxFrequency: 21.2e9 as Hertz, // 21.2 GHz
    minTxFrequency: 17.7e9 as Hertz, // 17.7 GHz
    maxTxFrequency: 21.2e9 as Hertz, // 21.2 GHz
    feedLoss: 0.7,
  },
  'KA_BAND_1M2': {
    name: '1.2m Ka-Band',
    diameter: 1.2,
    efficiency: 0.60,
    band: 'Ka',
    minRxFrequency: 17.7e9 as Hertz,
    maxRxFrequency: 21.2e9 as Hertz,
    minTxFrequency: 17.7e9 as Hertz,
    maxTxFrequency: 21.2e9 as Hertz,
    feedLoss: 0.6,
  },

  // X-Band antenna
  'X_BAND_5M': {
    name: '5m X-Band',
    diameter: 5.0,
    efficiency: 0.65,
    band: 'X',
    minRxFrequency: 7.25e9 as Hertz, // 7.25 GHz
    maxRxFrequency: 8.4e9 as Hertz, // 8.4 GHz
    minTxFrequency: 7.25e9 as Hertz, // 7.25 GHz
    maxTxFrequency: 8.4e9 as Hertz, // 8.4 GHz
    feedLoss: 0.6,
  },
};
