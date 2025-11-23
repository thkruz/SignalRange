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

export enum ANTENNA_CONFIG_KEYS {
  C_BAND_9M_VORTEK = "C_BAND_9M_VORTEK",
  KU_BAND_9M_LIMIT = "KU_BAND_9M_LIMIT",
  X_BAND_3M_ANTESTAR_RS = "X_BAND_3M_ANTESTAR_RS",
  C_BAND_3M_ANTESTAR = "C_BAND_3M_ANTESTAR",
  KU_BAND_3M_ANTESTAR = "KU_BAND_3M_ANTESTAR",
  C_BAND_2M4_ANTESTAR = "C_BAND_2M4_ANTESTAR",
  KU_BAND_2M4_ANTESTAR = "KU_BAND_2M4_ANTESTAR",
  KU_BAND_1M8_OFFSET = "KU_BAND_1M8_OFFSET",
  C_BAND_1M8_OFFSET = "C_BAND_1M8_OFFSET",
  C_BAND_9M = "C_BAND_9M",
  C_BAND_7M = "C_BAND_7M",
  C_BAND_4M = "C_BAND_4M",
  C_BAND_2M = "C_BAND_2M",
  KU_BAND_3M = "KU_BAND_3M",
  KU_BAND_2M = "KU_BAND_2M",
  KU_BAND_1M2 = "KU_BAND_1M2",
  KA_BAND_1M8 = "KA_BAND_1M8",
  KA_BAND_1M2 = "KA_BAND_1M2",
  X_BAND_5M = "X_BAND_5M",
}

/**
 * Predefined antenna configurations for common ground station antennas
 */
export const ANTENNA_CONFIGS: Record<ANTENNA_CONFIG_KEYS, AntennaConfig> = {
  // ───────────────────────────────── C-Band (9 m) ─────────────────────────────────
  // Based on Vertex/General Dynamics 9 m Cassegrain
  C_BAND_9M_VORTEK: {
    name: 'Vortek / Global Mechanics 9m C-Band',
    diameter: 9.0,
    efficiency: 0.70,            // illumination/spill only; Ruze handled elsewhere
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.6,

    // RF realism (from spec sheets)
    surfaceRms_m: 0.0005,        // ≤0.5 mm RMS
    blockageFraction: 0.08,      // cassegrain + struts typical
    xpd_dB: 35,                  // on-axis (typical)
    polType: 'linear',
    feedLossModel: { a: 0.2, b: 0.1, c: 0.01 },

    // Pattern / pointing
    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.02,     // tight EOA pointing
    // Mechanical / environment
    elRange_deg: [5, 90],
    azContinuous: false,
    maxRate_deg_s: 0.06,         // conservative jackscrew rate
    windDePointingCoef_deg_per_mps: 0.003,

    // System noise (G/T budgeting helpers)
    lnaNF_dB: 0.7,
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
    skyTempModel: 'CbandSimple',
    atmosModel: 'ITU_R_P676_Simple',
  },

  // Based on Antesky Limit-motion 9 m Ku/DBS (covers Ku Tx and high-band DBS Tx)
  KU_BAND_9M_LIMIT: {
    name: '9m Ku/DBS Limitek-Motion',
    diameter: 9.0,
    efficiency: 0.67,
    band: 'Ku',
    minRxFrequency: 10.7e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 13.75e9 as Hertz, // includes Ku Tx
    maxTxFrequency: 18.4e9 as Hertz,  // extends to DBS Tx
    feedLoss: 0.6,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.08,
    xpd_dB: 35,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.021,    // spec step-track rms
    elRange_deg: [0, 90],
    azContinuous: false,         // two-segment az by spec
    maxRate_deg_s: 0.06,

    lnaNF_dB: 1.0,
    rxChainLoss_dB: 0.6,
    rxPhysTemp_K: 290,
  },

  // ───────────────────────────────── X-Band (3 m) ─────────────────────────────────
  // Based on Antesky 3.0 m X-band Remote Sensing (LEO) — circular pol, fast pedestal
  X_BAND_3M_ANTESTAR_RS: {
    name: 'Antestar 3.0m X-band RS',
    diameter: 3.0,
    efficiency: 0.62,
    band: 'X',
    minRxFrequency: 7.25e9 as Hertz,
    maxRxFrequency: 7.75e9 as Hertz,
    minTxFrequency: 7.9e9 as Hertz,
    maxTxFrequency: 8.4e9 as Hertz,
    feedLoss: 0.4,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.06,
    xpd_dB: 30,
    polType: 'circular',
    feedLossModel: { a: 0.2, b: 0.1, c: 0.015 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.05,   // servo position ≤0.05° rms
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 3.0,        // 0–3°/s per axis

    lnaNF_dB: 1.0,
    rxChainLoss_dB: 0.6,
    rxPhysTemp_K: 290,
  },

  // ───────────────────────────────── Ku/C-Band (3 m) ───────────────────────────────
  // Based on Antesky 3.0 m ring-focus VSAT (C/Ku)
  C_BAND_3M_ANTESTAR: {
    name: 'Antestar 3.0m C-Band VSAT',
    diameter: 3.0,
    efficiency: 0.62,
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.2,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.06,
    xpd_dB: 35,
    polType: 'linear',
    feedLossModel: { a: 0.2, b: 0.1, c: 0.005 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.07,
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 0.2,

    lnaNF_dB: 0.8,
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
  },

  KU_BAND_3M_ANTESTAR: {
    name: 'Antestar 3.0m Ku-Band VSAT',
    diameter: 3.0,
    efficiency: 0.62,
    band: 'Ku',
    minRxFrequency: 10.95e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 13.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.25,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.06,
    xpd_dB: 35,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.07,
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 0.2,

    lnaNF_dB: 1.0,
    rxChainLoss_dB: 0.6,
    rxPhysTemp_K: 290,
  },

  // ───────────────────────────────── Ku/C-Band (2.4 m) ─────────────────────────────
  // Based on Antesky 2.4 m ring-focus VSAT (C/Ku), with measured noise temp and XPD
  C_BAND_2M4_ANTESTAR: {
    name: 'Antestar 2.4m C-Band VSAT',
    diameter: 2.4,
    efficiency: 0.60,
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.2,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.06,
    xpd_dB: 35,
    polType: 'linear',
    feedLossModel: { a: 0.2, b: 0.1, c: 0.005 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.08,
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 0.2,

    lnaNF_dB: 0.9,
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
  },

  KU_BAND_2M4_ANTESTAR: {
    name: 'Antestar 2.4m Ku-Band VSAT',
    diameter: 2.4,
    efficiency: 0.60,
    band: 'Ku',
    minRxFrequency: 10.95e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 13.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.25,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.06,
    xpd_dB: 35,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.08,
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 0.2,

    lnaNF_dB: 1.0,
    rxChainLoss_dB: 0.6,
    rxPhysTemp_K: 290,
  },

  // ───────────────────────────────── Ku/C-Band (1.8 m offset) ──────────────────────
  KU_BAND_1M8_OFFSET: {
    name: 'Antestar 1.8m Ku-Band Offset',
    diameter: 1.8,
    efficiency: 0.63,
    band: 'Ku',
    minRxFrequency: 10.95e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 13.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.25,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.02,     // offset: low blockage
    xpd_dB: 30,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.1,
    elRange_deg: [1, 80],
    azContinuous: true,
    maxRate_deg_s: 0.3,

    lnaNF_dB: 1.0,
    rxChainLoss_dB: 0.6,
    rxPhysTemp_K: 290,
  },

  C_BAND_1M8_OFFSET: {
    name: 'Antestar 1.8m C-Band Offset',
    diameter: 1.8,
    efficiency: 0.62,
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.2,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.02,
    xpd_dB: 30,
    polType: 'linear',
    feedLossModel: { a: 0.2, b: 0.1, c: 0.005 },

    kBeamConst: 70,
    patternModel: 'ITU465',
    pointingSigma_deg: 0.1,
    elRange_deg: [1, 80],
    azContinuous: true,
    maxRate_deg_s: 0.3,

    lnaNF_dB: 0.9,
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
  },

  // ───────────────────────────────── Existing basic presets (kept) ─────────────────
  C_BAND_9M: {
    name: '9m C-Band',
    diameter: 9.0,
    efficiency: 0.65,
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.8,
  },
  C_BAND_7M: {
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
  C_BAND_4M: {
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
  C_BAND_2M: {
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

  KU_BAND_3M: {
    name: '3m Ku-Band',
    diameter: 3.0,
    efficiency: 0.65,
    band: 'Ku',
    minRxFrequency: 10.7e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 12.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.6,
  },
  KU_BAND_2M: {
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
  KU_BAND_1M2: {
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

  KA_BAND_1M8: {
    name: '1.8m Ka-Band',
    diameter: 1.8,
    efficiency: 0.62,
    band: 'Ka',
    minRxFrequency: 17.7e9 as Hertz,
    maxRxFrequency: 21.2e9 as Hertz,
    minTxFrequency: 17.7e9 as Hertz,
    maxTxFrequency: 21.2e9 as Hertz,
    feedLoss: 0.7,
  },
  KA_BAND_1M2: {
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

  X_BAND_5M: {
    name: '5m X-Band',
    diameter: 5.0,
    efficiency: 0.65,
    band: 'X',
    minRxFrequency: 7.25e9 as Hertz,
    maxRxFrequency: 8.4e9 as Hertz,
    minTxFrequency: 7.25e9 as Hertz,
    maxTxFrequency: 8.4e9 as Hertz,
    feedLoss: 0.6,
  },
};
