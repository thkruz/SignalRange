/**
 * @file LinkBudgetManager - Link-budget / EIRP planning console (nats-eu M1)
 * @description Commissioning-era mechanic: before a pass the operator computes
 * the predicted carrier-to-noise for the link from pass geometry and station
 * parameters (a real Friis budget), confirms it matches the acceptance test
 * card, then commits the link and verifies the achieved margin clears the demod
 * threshold. The console holds the worksheet result and the committed margin;
 * the link-budget-computed / link-margin-met objective conditions read them.
 *
 * Started only when settings.linkBudget is present, so other campaigns never
 * instantiate it. All state is driven through the public API, which both the
 * (future) console UI and unit tests exercise - no simulation coupling.
 */

import { ScenarioManager } from '@app/scenario-manager';

/** Boltzmann constant, J/K */
const BOLTZMANN_J_PER_K = 1.380649e-23;

/** settings.linkBudget */
export interface LinkBudgetConfig {
  /** Human label for the planned link (e.g. "MERIDIAN-SAR-1 downlink, max-el pass") */
  label?: string;
  /** Ground-truth C/N (dB) the correctly-filled worksheet must yield */
  expectedCNRDb: number;
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

interface LinkBudgetState {
  /** Operator's most recent computed C/N, dB (null before first compute) */
  computedCNRDb: number | null;
  /** Committed link margin over threshold, dB (null before commit) */
  appliedMarginDb: number | null;
}

export class LinkBudgetManager {
  private static instance_: LinkBudgetManager | null = null;

  private readonly config_: LinkBudgetConfig | null;
  private readonly state_: LinkBudgetState = { computedCNRDb: null, appliedMarginDb: null };

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

  /** Run the planning computation from a filled worksheet; stores + returns C/N (dB). */
  computeCNR(inputs: LinkBudgetInputs): number {
    const cnr = LinkBudgetManager.computeCNRDb(inputs);
    this.state_.computedCNRDb = cnr;

    return cnr;
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

  /** Whether the operator's computed C/N matches the acceptance truth within tolerance. */
  isBudgetComputedCorrectly(): boolean {
    if (!this.config_ || this.state_.computedCNRDb === null) {
      return false;
    }
    const tol = this.config_.toleranceDb ?? 1.0;

    return Math.abs(this.state_.computedCNRDb - this.config_.expectedCNRDb) <= tol;
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
