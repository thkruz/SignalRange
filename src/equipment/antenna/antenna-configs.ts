import { Hertz } from '@app/types';
import { ANTENNA_CONFIG_KEYS } from './antenna-config-keys';

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
  band: 'VHF' | 'UHF' | 'L' | 'S' | 'C' | 'X' | 'Ku' | 'Ka' | 'Q' | 'V';
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
  /**
   * Cross-polarization loss (dB) applied when a circular-pol antenna receives the
   * wrong handedness (e.g. RHCP antenna vs LHCP signal). Opt-in: when omitted the
   * legacy 3 dB constant applies, preserving existing circular-pol antenna behavior.
   */
  circularCrossPolLoss_dB?: number;

  // --- Gain Model (non-parabolic antennas) ---
  /**
   * Gain model selector. Opt-in: when omitted (all dish configs) the parabolic
   * aperture math (Ruze/blockage, HPBW = k*λ/D) applies unchanged. 'fixed' uses
   * fixedGain_dBi/fixedBeamwidth3dB_deg directly — for wire antennas (yagi, QFH,
   * patch) where diameter-based formulas are meaningless.
   */
  gainModel?: 'parabolic' | 'fixed';
  /** Boresight gain in dBi when gainModel === 'fixed' */
  fixedGain_dBi?: number;
  /** 3 dB beamwidth in degrees when gainModel === 'fixed' */
  fixedBeamwidth3dB_deg?: number;
  /** Front-to-back ratio (dB) capping off-axis rolloff when gainModel === 'fixed' (default 20) */
  fixedFrontToBack_dB?: number;

  // --- Pattern / Pointing Parameters ---
  /** Beamwidth constant k for HPBW ≈ k*λ/D (degrees), typically 70 */
  kBeamConst?: number;
  /**
   * Sidelobe envelope (phase 19.4): 'S580' = ITU-R S.580-6 (29 - 25 log theta),
   * 'S465' = ITU-R S.465-6 (32 - 25 log theta), both -10 dBi beyond 48 deg,
   * under the ITU-R RR Appendix 8 near-in pattern. Omitted: S.580 when
   * D/lambda > 50, else S.465 (plan Q5). Ignored by the fixed gain model.
   */
  patternModel?: 'S580' | 'S465';
  /**
   * Servo pointing jitter RMS in degrees (e.g., 0.01-0.05). Combined with the
   * off-axis angle in quadrature, so it costs its mean pointing loss.
   */
  pointingSigma_deg?: number;

  // --- System Noise Parameters (for G/T) ---
  /** LNA noise figure in dB */
  lnaNF_dB?: number;
  /**
   * Receive chain loss between feed and LNA in dB. Not part of the receive
   * chain since Phase 19.2: the carrier never paid it, so the noise model does
   * not either (one reference plane; the LNA sits at the feed).
   */
  rxChainLoss_dB?: number;
  /**
   * Ground pickup through spillover and sidelobes, K at the aperture (Phase
   * 19.2 noise model). Defaults: 5 K for a dish, 60 K for a wire antenna whose
   * wide pattern sees the ground. Calibrated against the datasheet antenna
   * temperatures in test/reference/anchors.ts.
   */
  spilloverK?: number;
  /** Physical temperature for noise calculations in Kelvin */
  rxPhysTemp_K?: number;

  // --- Mechanical / Environment Parameters ---
  /** Elevation range in degrees [min, max] */
  elRange_deg?: [number, number];
  /** Whether azimuth is continuous */
  azContinuous?: boolean;
  /** Azimuth range in degrees [min, max] for non-continuous antennas (e.g., [-180, 540] for cable wrap) */
  azRange_deg?: [number, number];
  /** Maximum slew rate in degrees per second, per axis */
  maxRate_deg_s?: number;
  /** Maximum axis acceleration in degrees per second squared (default: reach maxRate in 1 s) */
  maxAccel_deg_s2?: number;
  /** De-pointing coefficient: de-pointing ≈ coef * wind(m/s) in degrees */
  windDePointingCoef_deg_per_mps?: number;

  // --- ACU Identification ---
  /** ACU model number (e.g., "Kratos NGC-2200") */
  acuModel?: string;
  /** ACU serial number (e.g., "ACU-01") */
  acuSerialNumber?: string;
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
    // Illumination/spill only; Ruze and blockage are applied separately.
    // Fitted (phase 19.4, DEV-ANT-07) so the gain at the feed flange (aperture
    // gain less the 0.44 dB feed loss) is the CPI 9.0 m datasheet's 50.0 dBi at
    // 4 GHz (test/reference/anchors.ts): 0.83 with 4 % blockage gives 49.9.
    // Was 0.7 and 8 %, 1.2 dB under the datasheet.
    efficiency: 0.83,
    band: 'C',
    minRxFrequency: 3.625e9 as Hertz,
    maxRxFrequency: 4.2e9 as Hertz,
    minTxFrequency: 5.85e9 as Hertz,
    maxTxFrequency: 6.425e9 as Hertz,
    feedLoss: 0.6,

    // RF realism (from spec sheets)
    surfaceRms_m: 0.0005, // ≤0.5 mm RMS
    blockageFraction: 0.04, // shaped Cassegrain: subreflector + struts
    xpd_dB: 35, // on-axis (typical)
    polType: 'linear',
    feedLossModel: { a: 0.2, b: 0.1, c: 0.01 },

    // Pattern / pointing: the CPI datasheet prints the S.580-6 envelope
    kBeamConst: 70,
    patternModel: 'S580',
    pointingSigma_deg: 0.02, // tight EOA pointing
    // Mechanical / environment
    elRange_deg: [5, 90],
    azContinuous: false,
    // A full-motion 9 m teleport pedestal: 0.5 deg/s per axis, 0.5 deg/s^2
    // (phase 19.4, plan Q6 class 0.3-0.5; was 2.5 deg/s for pacing)
    maxRate_deg_s: 0.5,
    maxAccel_deg_s2: 0.5,
    windDePointingCoef_deg_per_mps: 0.003,

    // System noise (G/T budgeting helpers)
    lnaNF_dB: 0.7,
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
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
    maxTxFrequency: 18.4e9 as Hertz, // extends to DBS Tx
    feedLoss: 0.6,

    surfaceRms_m: 0.0005,
    blockageFraction: 0.08,
    xpd_dB: 35,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
    pointingSigma_deg: 0.021, // spec step-track rms
    elRange_deg: [0, 90],
    azContinuous: false, // two-segment az by spec
    maxRate_deg_s: 0.35,

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
    pointingSigma_deg: 0.05, // servo position ≤0.05° rms
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 3.0, // 0–3°/s per axis

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
    pointingSigma_deg: 0.07,
    elRange_deg: [0, 90],
    azContinuous: true,
    maxRate_deg_s: 0.2,

    lnaNF_dB: 0.8,
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
  },

  // ───────────────────────────────── Ku-Band LEO (4 m) ─────────────────────────────
  // Fast-pedestal Ku tracking antenna for LEO downlink stations (NATS Europe).
  // Modeled on X-band remote-sensing pedestals but with Ku feed: full-hemisphere
  // coverage, continuous azimuth, and slew rates sized for high-elevation passes.
  KU_BAND_4M_LEO_TRACKER: {
    name: 'Leonis 4.0m Ku-Band LEO Tracker',
    diameter: 4.0,
    efficiency: 0.63,
    band: 'Ku',
    minRxFrequency: 10.7e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 13.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.3,

    surfaceRms_m: 0.0004,
    blockageFraction: 0.06,
    xpd_dB: 32,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
    pointingSigma_deg: 0.05, // servo position rms during rate tracking
    elRange_deg: [0, 90],
    azContinuous: true,
    // Purpose-built LEO tracker, 10 deg/s and 5 deg/s^2 per axis (phase 19.4,
    // plan Q6 class 5-10 deg/s; was 20). Moderate and high passes track
    // cleanly; a near-zenith pass outruns the azimuth axis at culmination
    // (the azimuth rate demand goes to infinity at the zenith): the keyhole.
    // Validated by test/campaigns/nats-eu-rf-validation.test.ts.
    maxRate_deg_s: 10.0,
    maxAccel_deg_s2: 5.0,
    windDePointingCoef_deg_per_mps: 0.002,

    lnaNF_dB: 1.0,
    rxChainLoss_dB: 0.6,
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
    efficiency: 0.6,
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
    // Fitted (phase 19.4, DEV-ANT-07) to the Prodelin 1244 datasheet's 47.4 dBi
    // at the flange, 11.725 GHz (offset feed, no blockage). Was 0.6 with 6 %
    // blockage, 1.3 dB under.
    efficiency: 0.72,
    band: 'Ku',
    minRxFrequency: 10.95e9 as Hertz,
    maxRxFrequency: 12.75e9 as Hertz,
    minTxFrequency: 13.75e9 as Hertz,
    maxTxFrequency: 14.5e9 as Hertz,
    feedLoss: 0.25,

    surfaceRms_m: 0.0005,
    blockageFraction: 0,
    xpd_dB: 35,
    polType: 'linear',
    // 0.29 dB at 11.7 GHz: fitted (Phase 19.2) so the antenna temperature at
    // the flange matches the Prodelin 1244 datasheet, 48 K at 20 deg
    // (test/reference/anchors.ts). The old a 0.25 / b 0.1 / c 0.01 gave 0.71 dB
    // and 70 K.
    feedLossModel: { a: 0.1, b: 0.05, c: 0.002 },

    kBeamConst: 70,
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
    blockageFraction: 0.02, // offset: low blockage
    xpd_dB: 30,
    polType: 'linear',
    feedLossModel: { a: 0.25, b: 0.1, c: 0.01 },

    kBeamConst: 70,
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
    efficiency: 0.6,
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
    efficiency: 0.6,
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
    efficiency: 0.6,
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

  // ───────────────────────────────── Backyard / DIY (Campaign 3) ───────────────────
  // Non-parabolic antennas using the fixed gain model. Receive-only stations:
  // Tx ranges mirror Rx so the range checks never trip (no transmitter is wired).

  // DIY quadrifilar helix for 137 MHz weather satellites. Near-hemispheric
  // pattern — no rotator, mounted pointing straight up.
  VHF_QFH_137: {
    name: 'DIY 137 MHz Quadrifilar Helix',
    diameter: 0.4, // physical size only; gain comes from fixed model
    efficiency: 0.6,
    band: 'VHF',
    minRxFrequency: 130e6 as Hertz,
    maxRxFrequency: 148e6 as Hertz,
    minTxFrequency: 130e6 as Hertz,
    maxTxFrequency: 148e6 as Hertz,
    feedLoss: 0.5, // coax run to the shack

    gainModel: 'fixed',
    fixedGain_dBi: 3.0,
    fixedBeamwidth3dB_deg: 140,
    fixedFrontToBack_dB: 10, // some response even toward the horizon/ground

    xpd_dB: 20,
    polType: 'circular',
    circularCrossPolLoss_dB: 12, // hand-wound helix, modest discrimination

    pointingSigma_deg: 0.5, // it's zip-tied to a fence post
    elRange_deg: [85, 90], // fixed skyward (nudge the mast by hand)
    azContinuous: false,
    maxRate_deg_s: 0.5, // walking over and re-aiming the mast

    lnaNF_dB: 1.5, // budget SDR front end
    rxChainLoss_dB: 1.0,
    rxPhysTemp_K: 290,
  },

  // Crossed yagi on a repurposed TV rotator: switchable RHCP/LHCP feed.
  UHF_CROSSED_YAGI_70CM: {
    name: 'DIY 70cm Crossed Yagi',
    diameter: 1.5, // boom length; gain comes from fixed model
    efficiency: 0.6,
    band: 'UHF',
    minRxFrequency: 420e6 as Hertz,
    maxRxFrequency: 450e6 as Hertz,
    minTxFrequency: 420e6 as Hertz,
    maxTxFrequency: 450e6 as Hertz,
    feedLoss: 0.8,

    gainModel: 'fixed',
    fixedGain_dBi: 12.0,
    fixedBeamwidth3dB_deg: 40,
    fixedFrontToBack_dB: 18,

    xpd_dB: 20,
    polType: 'circular',
    circularCrossPolLoss_dB: 18, // wrong handedness decisively kills lock

    pointingSigma_deg: 0.8, // TV rotator has real backlash
    elRange_deg: [0, 90],
    azContinuous: false,
    azRange_deg: [0, 360],
    maxRate_deg_s: 6.0, // typical hobby az/el rotator

    lnaNF_dB: 1.2,
    rxChainLoss_dB: 1.0,
    rxPhysTemp_K: 290,
  },

  // GPS patch antenna on a mast, fixed skyward, for L1 reception.
  L_BAND_GPS_PATCH: {
    name: 'GPS L1 Patch Antenna',
    diameter: 0.08,
    efficiency: 0.6,
    band: 'L',
    minRxFrequency: 1560e6 as Hertz,
    maxRxFrequency: 1610e6 as Hertz,
    minTxFrequency: 1560e6 as Hertz,
    maxTxFrequency: 1610e6 as Hertz,
    feedLoss: 0.4,

    gainModel: 'fixed',
    fixedGain_dBi: 5.0,
    fixedBeamwidth3dB_deg: 100,
    fixedFrontToBack_dB: 15,

    xpd_dB: 25,
    polType: 'circular',
    circularCrossPolLoss_dB: 15,

    pointingSigma_deg: 0.5,
    elRange_deg: [85, 90], // fixed skyward (nudge the mast by hand)
    azContinuous: false,
    maxRate_deg_s: 0.5, // walking over and re-aiming the mast

    lnaNF_dB: 1.0, // active patch with built-in LNA
    rxChainLoss_dB: 0.5,
    rxPhysTemp_K: 290,
  },
};
