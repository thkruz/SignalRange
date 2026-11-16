import { RFFrontEndCore } from '@app/equipment/rf-front-end/rf-front-end-core';
import { RFFrontEndModule, RFFrontEndModuleState } from '@app/equipment/rf-front-end/rf-front-end-module';
import { SignalOrigin } from '@app/signal-origin';
import { SimClock } from '@app/simulation/sim-clock';
import { dB, dBm, IfSignal } from '@app/types';

/**
 * AGC module state
 */
export interface AGCState extends RFFrontEndModuleState {
  isPowered: boolean; // Always true (tied to LNB power)
  isBypassed: boolean; // Bypass mode - signals pass through unchanged
  targetLevel: dBm; // Target output power
  currentGain: dB; // Current gain applied (can be negative = attenuation)
  inputPower: dBm; // Measured total input power
  outputPower: dBm; // Actual output power
  attackTime: number; // Attack time constant (ms) - how fast gain reduces
  releaseTime: number; // Release time constant (ms) - how fast gain increases
  maxGain: dB; // Maximum gain limit
  minGain: dB; // Minimum gain limit
}

/** The AGC card's Mode badge: 'no-input' while the LNB or IF filter is off (Phase 34 D7) */
export type AGCStatus = 'active' | 'bypassed' | 'no-input' | 'at-max' | 'at-min';

/**
 * AGC Module Core - Business Logic Layer
 * Automatic Gain Control - measures total power in IF passband and applies
 * uniform gain adjustment to keep output at target level.
 *
 * The detector measures carriers AND the receive noise in the IF filter's
 * bandwidth (Phase 19.2): with no carrier it levels the noise (at max gain
 * only if the noise alone is too weak to reach the target). A passband with
 * no carrier above the noise raises "AGC on noise only - ...", the
 * pre-AOS warning on a LEO board (it replaced the old max-gain rail, which
 * only existed because the detector ignored noise).
 *
 * Key behavior:
 * - Indiscriminate: cannot distinguish wanted signals from interference
 * - When interference is present, reduces gain for ALL signals
 * - Dynamic response with attack/release time constants
 *
 * Position in signal chain: LNB → IF Filter → Notch Filter → AGC
 */
export abstract class AGCModuleCore extends RFFrontEndModule<AGCState> {
  /**
   * Lowest input/output power the AGC detector reports (dBm). With no signals,
   * or with signals far below the noise, the detector reads the noise floor
   * rather than an impossible value such as -395 dBm.
   */
  static readonly DETECTOR_FLOOR_DBM = -120 as dBm;

  outputSignals: IfSignal[] = [];

  /**
   * Carriers must lift the passband power at least this much over the noise
   * alone for the AGC to be levelling a carrier (dB)
   */
  static readonly NOISE_ONLY_MARGIN_DB = 0.5;

  /** The passband holds receive noise and no carrier above it (updated each frame) */
  private isNoiseOnly_ = false;

  /**
   * How long the passband must read noise only, without a break, before the
   * "AGC on noise only" alarm raises, ms (Phase 31 D2, nats-r6-s01-F1): the
   * first frames after a load, before the chain has settled, must not write a
   * raise/clear pair. Clearing is immediate.
   */
  static readonly NOISE_ONLY_HOLD_MS = 1000;

  /** Run time the current noise-only spell started (null: a carrier is up) */
  private noiseOnlySinceMs_: number | null = null;

  /**
   * Hang time, ms (phase 29 D19, nats-r4-s08-F3). After the passband power
   * drops suddenly from a levelled state, the gain is held this long before
   * the release starts, as a hang AGC does, so a carrier that drops out for a
   * second (S8's intermittent Modem 1, a TDMA burst gap) does not pump every
   * other carrier in the IF: without it the AURORA-7 beacon jumped 12 dB on
   * the analyzer each time the station's own 24 MHz carrier blinked off, while
   * its C/N (a ratio) never moved. Attack is never held.
   */
  static readonly HANG_MS = 2000;

  /** A release larger than this, dB, from a levelled loop starts the hang; smaller ones track at once */
  static readonly HANG_THRESHOLD_DB = 1;

  /** The loop was within HANG_THRESHOLD_DB of its target on the last update */
  private isLevelled_ = false;

  /** Run time the current hang started (null: not hanging) */
  private hangStartMs_: number | null = null;

  /**
   * True while the AGC has an IF input: the LNB is powered and the IF filter
   * is not switched off (Phase 34 D7). A front end with no LNB or filter
   * wired (headless use) counts as powered.
   */
  get isInputPowered(): boolean {
    const fe = this.rfFrontEnd_;
    return fe?.lnbModule?.state.isPowered !== false && fe?.filterModule?.state.isPowered !== false;
  }

  /** True when the AGC is levelling noise alone: no carrier above the noise in its passband */
  get isNoiseOnly(): boolean {
    return this.isNoiseOnly_;
  }

  /** Start or end the noise-only spell with this frame's reading */
  private trackNoiseOnlySpell_(): void {
    if (!this.isNoiseOnly_) {
      this.noiseOnlySinceMs_ = null;
      return;
    }
    const now = SimClock.runMs();
    // Run time restarts at 0 each scenario
    if (this.noiseOnlySinceMs_ === null || now < this.noiseOnlySinceMs_) {
      this.noiseOnlySinceMs_ = now;
    }
  }

  /** Noise only for at least NOISE_ONLY_HOLD_MS of run time without a break */
  private isNoiseOnlyHeld_(): boolean {
    if (!this.isNoiseOnly_ || this.noiseOnlySinceMs_ === null) return false;
    const heldMs = SimClock.runMs() - this.noiseOnlySinceMs_;
    return heldMs < 0 || heldMs >= AGCModuleCore.NOISE_ONLY_HOLD_MS;
  }

  /**
   * Get default state for AGC module
   */
  static getDefaultState(): AGCState {
    return {
      isPowered: true, // Always on (tied to LNB)
      isBypassed: false, // AGC active by default
      targetLevel: -30 as dBm, // Typical IF level for modems
      currentGain: 0 as dB, // Start with unity gain
      inputPower: -100 as dBm, // Will be calculated
      outputPower: -100 as dBm, // Will be calculated
      attackTime: 10, // 10ms attack (fast response to overload)
      releaseTime: 100, // 100ms release (slower recovery)
      maxGain: 30 as dB, // +30 dB max amplification
      minGain: -30 as dB, // -30 dB max attenuation
    };
  }

  constructor(state: AGCState, rfFrontEnd: RFFrontEndCore, unit: number) {
    super(state, rfFrontEnd, 'rf-fe-agc', unit);
  }

  /**
   * Get input signals from Notch Filter module
   */
  get inputSignals(): IfSignal[] {
    return this.rfFrontEnd_.notchFilterModule.outputSignals;
  }

  /**
   * Update: Apply AGC to signals
   * 1. Measure total input power
   * 2. Calculate required gain to reach target
   * 3. Apply attack/release smoothing
   * 4. Apply gain uniformly to all signals
   */
  update(): void {
    const inputs = this.inputSignals;

    // Total input power: carriers plus the receive noise in the passband
    // (linear power sum)
    const noiseLinear = this.noiseInputMw_();
    const carriersLinear = inputs.reduce((sum, sig) => sum + 10 ** (sig.power / 10), 0);
    const totalPowerLinear = carriersLinear + noiseLinear;
    this.state.inputPower = AGCModuleCore.toDetectorReading_(totalPowerLinear);
    // Carriers lift the passband less than NOISE_ONLY_MARGIN_DB over the noise
    this.isNoiseOnly_ = noiseLinear > 0 && carriersLinear < noiseLinear * (10 ** (AGCModuleCore.NOISE_ONLY_MARGIN_DB / 10) - 1);
    this.trackNoiseOnlySpell_();

    // Handle bypass mode - pass signals through unchanged
    if (this.state.isBypassed) {
      this.isLevelled_ = false;
      this.hangStartMs_ = null;
      this.state.currentGain = 0 as dB;
      this.state.outputPower = this.state.inputPower;
      this.outputSignals = inputs.map((sig) => ({
        ...sig,
        origin: SignalOrigin.AGC,
      }));
      return;
    }

    // Calculate required gain to reach target
    const targetGain = this.state.targetLevel - this.state.inputPower;

    // Apply attack/release smoothing (exponential)
    // Attack: gain is reducing (input power increased)
    // Release: gain is increasing (input power decreased)
    const isReducing = targetGain < this.state.currentGain;
    const timeConstant = isReducing ? this.state.attackTime : this.state.releaseTime;

    // Calculate alpha for exponential smoothing at ~60 FPS (16.67ms per frame)
    const alpha = 1 - Math.exp(-16.67 / timeConstant);

    if (!this.isHanging_(targetGain)) {
      this.state.currentGain = (this.state.currentGain + (targetGain - this.state.currentGain) * alpha) as dB;
    }
    this.isLevelled_ = Math.abs(targetGain - this.state.currentGain) <= AGCModuleCore.HANG_THRESHOLD_DB;

    // Clamp to gain limits
    this.state.currentGain = Math.max(this.state.minGain, Math.min(this.state.maxGain, this.state.currentGain)) as dB;

    // Apply gain uniformly to all signals
    this.outputSignals = inputs.map((sig) => ({
      ...sig,
      power: (sig.power + this.state.currentGain) as dBm,
      origin: SignalOrigin.AGC,
    }));

    // Calculate actual output power (carriers plus the levelled noise)
    const outputPowerLinear = this.outputSignals.reduce((sum, sig) => sum + 10 ** (sig.power / 10), 0) + noiseLinear * 10 ** (this.state.currentGain / 10);
    this.state.outputPower = AGCModuleCore.toDetectorReading_(outputPowerLinear);
  }

  /**
   * True while a release is held by the hang: the passband dropped more than
   * HANG_THRESHOLD_DB below a levelled loop under HANG_MS ago. A release that
   * outlasts the hang proceeds at the release time constant.
   */
  private isHanging_(targetGain: number): boolean {
    const isBigRelease = targetGain - this.state.currentGain > AGCModuleCore.HANG_THRESHOLD_DB;
    if (!isBigRelease || (!this.isLevelled_ && this.hangStartMs_ === null)) {
      this.hangStartMs_ = null;
      return false;
    }
    const now = SimClock.runMs();
    // Run time restarts at 0 on a scenario load
    if (this.hangStartMs_ === null || now < this.hangStartMs_) {
      this.hangStartMs_ = now;
    }

    return now - this.hangStartMs_ < AGCModuleCore.HANG_MS;
  }

  /**
   * Receive noise arriving at the AGC (mW): k·Tsys over the IF filter's
   * bandwidth with the gain ahead of the AGC (LNB gain less filter loss). An
   * unpowered LNB or filter delivers no noise.
   */
  private noiseInputMw_(): number {
    const fe = this.rfFrontEnd_;
    if (!fe?.lnbModule || !fe.filterModule || !fe.couplerModule) {
      return 0;
    }
    if (!this.isInputPowered) {
      return 0;
    }
    const spm = fe.couplerModule.signalPathManager;
    const noiseDbm = spm.getExternalNoise() - spm.agcGain;

    return Number.isFinite(noiseDbm) ? 10 ** (noiseDbm / 10) : 0;
  }

  /** Converts a summed linear power (mW) to dBm, floored at the detector floor. */
  private static toDetectorReading_(powerLinear: number): dBm {
    if (!(powerLinear > 0)) {
      return AGCModuleCore.DETECTOR_FLOOR_DBM;
    }

    return Math.max(AGCModuleCore.DETECTOR_FLOOR_DBM, 10 * Math.log10(powerLinear)) as dBm;
  }

  /**
   * Get alarms for this module
   */
  getAlarms(): string[] {
    const alarms: string[] = [];

    if (this.state.isBypassed) {
      // No alarms when bypassed
      return alarms;
    }

    // With the LNB (or IF filter) unpowered there is no IF signal to level; max gain is expected, not a fault.
    if (!this.isInputPowered) {
      return alarms;
    }

    // Stowed or slewing to a new position: carriers sliding through the beam
    // are expected, so the gain-limit alarms are inhibited (phase 27, r2-s03-F2:
    // the stow after the S3 handover flashed "max gain - weak signal")
    const isRepositioning = this.rfFrontEnd_?.antenna?.isRepositioning ?? false;

    // Nothing to level but noise: the empty-sky (pre-AOS) indication
    // Raised once it has held NOISE_ONLY_HOLD_MS; inside the hold nothing
    // raises (a max-gain rail on empty sky is not the indication either).
    // The detector integrates the whole IF passband: a narrow CW beacon can
    // show on the analyzer and still be far below that integrated noise, so
    // the text says "no traffic carrier", not "no carrier" (nats-r3-s09-F2).
    // Keep the "AGC on noise only" prefix: specs and quizzes match on it.
    if (this.isNoiseOnly_) {
      if (this.isNoiseOnlyHeld_()) alarms.push('AGC on noise only - passband power is noise, no traffic carrier');
    } else if (!isRepositioning && this.state.currentGain >= this.state.maxGain - 0.5) {
      // Warn when at gain limits
      alarms.push(`AGC at max gain (${this.state.currentGain.toFixed(1)} dB) - weak signal`);
    }

    if (!isRepositioning && this.state.currentGain <= this.state.minGain + 0.5) {
      alarms.push(`AGC at min gain (${this.state.currentGain.toFixed(1)} dB) - possible interference`);
    }

    return alarms;
  }

  /**
   * Sync state from external source
   */
  sync(state: Partial<AGCState>): void {
    super.sync(state);
  }

  // ═══════════════════════════════════════════════════════════════
  // Public handlers for UI/Adapter layer
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle bypass toggle
   * @param isBypassed Optional explicit bypass state, otherwise toggles
   */
  public handleBypassToggle(isBypassed?: boolean): void {
    this.state.isBypassed = isBypassed ?? !this.state.isBypassed;
  }

  /**
   * Get current AGC status for display
   */
  public getStatus(): AGCStatus {
    if (this.state.isBypassed) return 'bypassed';
    // No IF to level: the gain rail is expected, not "At Max" (Phase 34 D7, nats-r9-s03-F2)
    if (!this.isInputPowered) {
      return 'no-input';
    }
    if (this.state.currentGain >= this.state.maxGain - 0.5) return 'at-max';
    if (this.state.currentGain <= this.state.minGain + 0.5) return 'at-min';
    return 'active';
  }
}
