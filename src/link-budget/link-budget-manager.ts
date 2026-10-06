/**
 * @file LinkBudgetManager - Link-budget / EIRP planning console (nats-eu M1)
 * @description Commissioning-era mechanic: before a pass the operator computes
 * the predicted carrier-to-noise for the link from pass geometry and station
 * parameters (a real Friis budget), confirms it matches the acceptance test
 * card, then commits the link and verifies the achieved margin clears the demod
 * threshold. The console holds the worksheet result and the committed margin;
 * the link-budget-computed / link-margin-met objective conditions read them.
 *
 * Phase 19.3: the worksheet gains an optional uplink half (uplink EIRP, uplink
 * path loss, satellite G/T, optional C/IM). When it is filled in, the graded
 * value is the composite C/N of a bent-pipe relay,
 *   (C/N)^-1 = (C/N_up)^-1 + (C/N_down)^-1 + (C/IM)^-1,
 * which is what the receiver measures on a transponded carrier (the relayed
 * RfSignal carries the uplink + IM C/N0 as upstreamCn0DbHz). Without it the
 * downlink alone is graded, so direct (non-transponded) downlinks such as the
 * nats-eu SAR video budgets grade exactly as before.
 *
 * Started only when settings.linkBudget is present, so other campaigns never
 * instantiate it. All state is driven through the public API, which both the
 * (future) console UI and unit tests exercise - no simulation coupling.
 */

import { ScenarioManager } from '@app/scenario-manager';

/** Boltzmann constant, J/K */
const BOLTZMANN_J_PER_K = 1.380649e-23;
/** Boltzmann constant, dBW/K/Hz (about -228.6) */
const BOLTZMANN_DBW_PER_K_HZ = 10 * Math.log10(BOLTZMANN_J_PER_K);

/** settings.linkBudget */
export interface LinkBudgetConfig {
  /** Human label for the planned link (e.g. "MERIDIAN-SAR-1 downlink, max-el pass") */
  label?: string;
  /**
   * Ground-truth C/N (dB) the correctly-filled worksheet must yield. Optional
   * since Phase 19.2: when absent the worksheet is graded against the
   * engine's own clear-sky C/N for the link (`setEnginePrediction`). The
   * calibration ledger checks every remaining authored value against the
   * engine (scripts/calibration/diff.mjs).
   */
  expectedCNRDb?: number;
  /** Tolerance (dB) for accepting the operator's computed C/N as correct (default 1.0) */
  toleranceDb?: number;
  /** Demod C/N threshold (dB) the margin is measured against */
  thresholdCNRDb: number;
  /** Required link margin (dB) above threshold for the link to be accepted (default 3) */
  requiredMarginDb?: number;
}

/** Operator-entered worksheet fields for the Friis budget */
export interface LinkBudgetInputs {
  /** Downlink EIRP at the satellite, dBm */
  eirpDbm: number;
  /** Free-space path loss over the slant range, dB */
  fsplDb: number;
  /** Receive antenna gain, dBi */
  rxGainDbi: number;
  /** System noise temperature, K */
  systemNoiseTempK: number;
  /** Occupied bandwidth, Hz */
  bandwidthHz: number;
  /** Additional implementation / pointing / atmospheric losses, dB (default 0) */
  miscLossDb?: number;
}

/**
 * Operator-entered uplink half of the worksheet (Phase 19.3). The uplink C/N
 * is computed in the same occupied bandwidth as the downlink.
 */
export interface UplinkBudgetInputs {
  /** Ground-station uplink EIRP, dBW */
  uplinkEirpDbw: number;
  /** Free-space path loss on the uplink slant range, dB */
  uplinkFsplDb: number;
  /** Satellite receive figure of merit G/T, dB/K */
  satGOverTDbK: number;
  /** Occupied bandwidth, Hz (the downlink's bandwidth) */
  bandwidthHz: number;
  /** Additional uplink losses (atmospheric, pointing), dB (default 0) */
  miscLossDb?: number;
  /** Carrier-to-intermodulation ratio at the transponder output, dB (omit for a single carrier / linear amplifier) */
  carrierToImDb?: number;
}

/** The three C/N figures of a filled two-hop worksheet, dB */
export interface CompositeCnrResult {
  uplinkCNRDb: number;
  downlinkCNRDb: number;
  compositeCNRDb: number;
}

interface LinkBudgetState {
  /**
   * Operator's most recent graded C/N, dB (null before first compute): the
   * composite when the uplink half was filled in, else the downlink C/N
   */
  computedCNRDb: number | null;
  /** Downlink-only C/N from the most recent compute, dB */
  computedDownlinkCNRDb: number | null;
  /** Uplink C/N from the most recent compute, dB (null when the uplink half was left empty) */
  computedUplinkCNRDb: number | null;
  /** Composite C/N from the most recent compute, dB (null when the uplink half was left empty) */
  computedCompositeCNRDb: number | null;
  /** Committed link margin over threshold, dB (null before commit) */
  appliedMarginDb: number | null;
}

export class LinkBudgetManager {
  private static instance_: LinkBudgetManager | null = null;

  private readonly config_: LinkBudgetConfig | null;
  private readonly state_: LinkBudgetState = {
    computedCNRDb: null,
    computedDownlinkCNRDb: null,
    computedUplinkCNRDb: null,
    computedCompositeCNRDb: null,
    appliedMarginDb: null,
  };
  /** The engine's clear-sky C/N for the link, used when no expectedCNRDb is authored */
  private enginePrediction_: (() => number | null) | null = null;

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.linkBudget as LinkBudgetConfig | undefined) ?? null;
  }

  static getInstance(): LinkBudgetManager {
    this.instance_ ??= new LinkBudgetManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    this.instance_ = null;
  }

  get state(): Readonly<LinkBudgetState> {
    return this.state_;
  }

  getConfig(): LinkBudgetConfig | null {
    return this.config_;
  }

  /**
   * Pure Friis carrier-to-noise, dB. Received power (dBm) less thermal noise
   * power in the occupied bandwidth (dBm). Extracted so it is unit-testable and
   * shared by the console UI.
   */
  static computeCNRDb(inputs: LinkBudgetInputs): number {
    const rxPowerDbm = inputs.eirpDbm - inputs.fsplDb + inputs.rxGainDbi - (inputs.miscLossDb ?? 0);
    // Thermal noise power in W -> dBm: 10log10(kTB) + 30
    const noiseW = BOLTZMANN_J_PER_K * inputs.systemNoiseTempK * inputs.bandwidthHz;
    const noiseDbm = 10 * Math.log10(noiseW) + 30;

    return rxPowerDbm - noiseDbm;
  }

  /**
   * Pure uplink carrier-to-noise at the satellite input, dB, in the occupied
   * bandwidth: C/N_up = EIRP_up - FSPL_up - L + G/T - 10log10(k) - 10log10(B).
   */
  static computeUplinkCNRDb(inputs: UplinkBudgetInputs): number {
    return inputs.uplinkEirpDbw - inputs.uplinkFsplDb - (inputs.miscLossDb ?? 0) + inputs.satGOverTDbK - BOLTZMANN_DBW_PER_K_HZ - 10 * Math.log10(inputs.bandwidthHz);
  }

  /**
   * Combine independent C/N (or C/I, C/IM) terms in dB by adding their
   * reciprocals in linear: (C/N)^-1 = sum (C/N_i)^-1. Non-finite +Infinity
   * terms (an absent impairment) drop out; with no finite terms the result is
   * +Infinity.
   */
  static combineCnDb(...termsDb: number[]): number {
    let inv = 0;
    for (const t of termsDb) {
      if (t === Number.NEGATIVE_INFINITY) {
        return Number.NEGATIVE_INFINITY;
      }
      if (Number.isFinite(t)) {
        inv += 10 ** (-t / 10);
      }
    }

    return inv > 0 ? -10 * Math.log10(inv) : Number.POSITIVE_INFINITY;
  }

  /** Uplink, downlink and composite C/N of a bent-pipe relay, dB */
  static computeCompositeCNRDb(downlink: LinkBudgetInputs, uplink: UplinkBudgetInputs): CompositeCnrResult {
    const uplinkCNRDb = LinkBudgetManager.computeUplinkCNRDb(uplink);
    const downlinkCNRDb = LinkBudgetManager.computeCNRDb(downlink);
    const compositeCNRDb = LinkBudgetManager.combineCnDb(uplinkCNRDb, downlinkCNRDb, uplink.carrierToImDb ?? Number.POSITIVE_INFINITY);

    return { uplinkCNRDb, downlinkCNRDb, compositeCNRDb };
  }

  /**
   * Run the planning computation from a filled worksheet; stores + returns the
   * graded C/N (dB). With an uplink half the graded value is the composite,
   * without it the downlink alone (the pre-19.3 behaviour).
   */
  computeCNR(inputs: LinkBudgetInputs, uplink: UplinkBudgetInputs | null = null): number {
    const downlinkCNRDb = LinkBudgetManager.computeCNRDb(inputs);
    this.state_.computedDownlinkCNRDb = downlinkCNRDb;

    if (!uplink) {
      this.state_.computedUplinkCNRDb = null;
      this.state_.computedCompositeCNRDb = null;
      this.state_.computedCNRDb = downlinkCNRDb;

      return downlinkCNRDb;
    }

    const result = LinkBudgetManager.computeCompositeCNRDb(inputs, uplink);
    this.state_.computedUplinkCNRDb = result.uplinkCNRDb;
    this.state_.computedCompositeCNRDb = result.compositeCNRDb;
    this.state_.computedCNRDb = result.compositeCNRDb;

    return result.compositeCNRDb;
  }

  /**
   * Commit the link once equipment is configured. `achievedCNRDb` is the C/N the
   * configured chain actually delivers (from the live receiver in-app; supplied
   * directly in tests). Stores the margin over the demod threshold.
   */
  commitLink(achievedCNRDb: number): void {
    if (!this.config_) {
      return;
    }
    this.state_.appliedMarginDb = achievedCNRDb - this.config_.thresholdCNRDb;
  }

  /**
   * Register the engine's clear-sky C/N for the planned link (the link-budget
   * tab supplies it from the live receive chain). Graded against when the
   * scenario authors no expectedCNRDb.
   */
  setEnginePrediction(predict: (() => number | null) | null): void {
    this.enginePrediction_ = predict;
  }

  /** The C/N the worksheet is graded against: authored, else the engine's clear-sky prediction */
  expectedCNRDb(): number | null {
    if (!this.config_) {
      return null;
    }

    return this.config_.expectedCNRDb ?? this.enginePrediction_?.() ?? null;
  }

  /** Whether the operator's computed C/N matches the acceptance truth within tolerance. */
  isBudgetComputedCorrectly(): boolean {
    const expected = this.expectedCNRDb();
    if (!this.config_ || this.state_.computedCNRDb === null || expected === null) {
      return false;
    }
    const tol = this.config_.toleranceDb ?? 1.0;

    return Math.abs(this.state_.computedCNRDb - expected) <= tol;
  }

  /** Whether the committed margin meets the required threshold (or an override minMarginDb). */
  isMarginMet(minMarginDbOverride?: number): boolean {
    if (!this.config_ || this.state_.appliedMarginDb === null) {
      return false;
    }
    const required = minMarginDbOverride ?? this.config_.requiredMarginDb ?? 3;

    return this.state_.appliedMarginDb >= required;
  }
}
