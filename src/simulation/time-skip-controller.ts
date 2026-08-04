/**
 * @file TimeSkipController - Operator-driven fast-forward to the next contact
 * @description LEO scenarios spend most of their wall-clock time waiting for a
 * bird to rise. Scenarios 7 and 8 can put 40+ minutes of dead sky between the
 * shift starting and the pass the mission is actually about, which is realistic
 * and is also nothing to train on. This runs that wait at several hundred times
 * real speed and stops short of AOS, so the operator still does acquisition
 * themselves.
 *
 * It is a FAST-FORWARD, not a jump. Each animation frame advances the scenario
 * clock (and the mission clock) by one chunk, and the existing simulation loop
 * propagates orbits and evaluates objective conditions against every chunk. A
 * single `advanceClock(fortyMinutes)` would be one line instead of this file,
 * but nothing scheduled inside the skipped window would ever be evaluated.
 *
 * Two clocks move together, which is the whole reason mission-clock.ts exists:
 *   - the SCENARIO clock (OpsLogManager) - drives SGP4, pass prediction, the UTC
 *     display, and
 *   - the MISSION clock (missionNowMs) - drives every "seconds since mission
 *     start" mechanic: command windows, maneuvers, weather, interference,
 *     scoring elapsed time, COMSEC key age.
 * Advancing one without the other puts the console and the sky in different
 * hours.
 *
 * Opt-in per scenario via settings.timeSkip; campaigns that do not declare it
 * never see the control.
 */

import { OrbitalSatellite } from '@app/equipment/satellite/orbital-satellite';
import { CryptoModule } from '@app/equipment/crypto';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { ScenarioManager } from '@app/scenario-manager';
import { PassPlannerService, scenarioMinElevation } from '@app/services/pass-planner-service';
import { addSkippedTime } from '@app/simulation/mission-clock';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Degrees } from 'ootk';

/** settings.timeSkip */
export interface TimeSkipConfig {
  /**
   * Stop this many seconds before AOS. The operator should arrive with the
   * antenna still to be pointed and the receiver still to be tuned - handing
   * them a bird already in the beam skips the part that is the lesson.
   * Default 120.
   */
  leadTimeS?: number;
  /** Real-time duration of the fast-forward, ms. Default 2500. */
  animationMs?: number;
  /**
   * Do not offer a skip for waits shorter than this, in seconds. Short waits are
   * part of the job; the control exists for the dead half-hours. Default 300.
   */
  minSkipS?: number;
  /** How far ahead to look for the next pass, in hours. Default 12. */
  horizonHours?: number;
}

/** A resolved fast-forward: where it lands and what it is aiming at. */
export interface SkipTarget {
  satelliteName: string;
  noradId: number;
  /** AOS of the pass being skipped to, Unix ms on the scenario clock */
  aosMs: number;
  /** Where the skip stops (aosMs minus the lead time), Unix ms */
  targetMs: number;
  /** Scenario time the skip covers, ms */
  deltaMs: number;
  /** Maximum elevation of the pass being skipped to */
  maxEl: Degrees;
  /** True when the loaded COMSEC key would age out during the skip */
  willExpireCryptoKey: boolean;
}

const DEFAULT_LEAD_TIME_S = 120;
const DEFAULT_ANIMATION_MS = 2500;
const DEFAULT_MIN_SKIP_S = 300;
const DEFAULT_HORIZON_HOURS = 12;

export class TimeSkipController {
  private static instance_: TimeSkipController | null = null;

  private readonly config_: TimeSkipConfig;
  private readonly passPlanner_ = new PassPlannerService();

  private isSkipping_ = false;
  private totalMs_ = 0;
  private skippedMs_ = 0;
  private startedAtRealMs_ = 0;
  private animationFrameId_: number | null = null;

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.timeSkip as TimeSkipConfig | undefined) ?? {};
  }

  static getInstance(): TimeSkipController {
    this.instance_ ??= new TimeSkipController();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    this.instance_?.cancel();
    this.instance_ = null;
  }

  get isSkipping(): boolean {
    return this.isSkipping_;
  }

  get leadTimeS(): number {
    return this.config_.leadTimeS ?? DEFAULT_LEAD_TIME_S;
  }

  get animationMs(): number {
    return this.config_.animationMs ?? DEFAULT_ANIMATION_MS;
  }

  get minSkipS(): number {
    return this.config_.minSkipS ?? DEFAULT_MIN_SKIP_S;
  }

  /**
   * Why a skip cannot be offered right now, phrased for the operator, or null
   * when it can.
   *
   * The rules are all versions of "do not skip anything the operator is
   * supposed to be doing": not while a bird is up, not while the scenario clock
   * is stopped for a brief or a failure, not while an objective is being timed.
   */
  getBlockedReason(): string | null {
    if (this.isSkipping_) {
      return 'Skip already running';
    }

    if (!OpsLogManager.isInitialized()) {
      return 'Scenario clock is not running';
    }

    if (OpsLogManager.getInstance().isPaused()) {
      return 'Scenario clock is paused';
    }

    const inView = this.orbitalSatellites_().filter((sat) => sat.isAboveHorizon);

    if (inView.length > 0) {
      return `${inView[0].name} is in view - work the pass`;
    }

    if (ObjectivesManager.hasInstance() && ObjectivesManager.getInstance().hasRunningObjectiveTimer()) {
      return 'A timed objective is running';
    }

    return null;
  }

  /**
   * The next pass worth skipping to, or null when there is nothing to skip to
   * (no orbital satellites, nothing inside the search horizon, or the wait is
   * short enough to just work through).
   */
  findTarget(): SkipTarget | null {
    const satellites = this.orbitalSatellites_();

    if (satellites.length === 0) {
      return null;
    }

    const nowMs = getSimulatedNowMs();
    const leadMs = this.leadTimeS * 1000;
    const passes = this.passPlanner_.getContactSchedule(satellites, nowMs, {
      horizonHours: this.config_.horizonHours ?? DEFAULT_HORIZON_HOURS,
      minElevation: scenarioMinElevation(ScenarioManager.getInstance().settings),
    });

    // Only ever the NEXT pass, never one beyond it. Searching forward for the
    // first pass with enough lead time would let an operator sitting two
    // minutes from AOS skip straight over the contact they are about to work,
    // which is the one thing this control must not do.
    const next = passes[0];

    if (!next) {
      return null;
    }

    const targetMs = next.aosMs - leadMs;
    const deltaMs = targetMs - nowMs;

    // Negative when a pass is in progress or its lead-in has begun; below the
    // floor when the wait is short enough to just work through.
    if (deltaMs < this.minSkipS * 1000) {
      return null;
    }

    return {
      satelliteName: next.satelliteName,
      noradId: next.noradId,
      aosMs: next.aosMs,
      targetMs,
      deltaMs,
      maxEl: next.maxEl,
      willExpireCryptoKey: TimeSkipController.wouldExpireCryptoKey_(deltaMs),
    };
  }

  /**
   * Run the fast-forward. Returns false when the skip could not start.
   *
   * @param target Resolved target from findTarget()
   */
  start(target: SkipTarget): boolean {
    if (this.isSkipping_ || this.getBlockedReason() !== null || target.deltaMs <= 0) {
      return false;
    }

    this.isSkipping_ = true;
    this.totalMs_ = target.deltaMs;
    this.skippedMs_ = 0;
    this.startedAtRealMs_ = Date.now();

    EventBus.getInstance().emit(Events.TIME_SKIP_STARTED, {
      satelliteName: target.satelliteName,
      targetMs: target.targetMs,
      totalMs: target.deltaMs,
    });

    this.animationFrameId_ = requestAnimationFrame(this.frame_.bind(this));

    return true;
  }

  /**
   * Advance the skip to where it should be `elapsedRealMs` into the animation.
   *
   * Separated from the animation frame so tests can drive a whole skip
   * deterministically without a browser clock.
   *
   * @param elapsedRealMs Real milliseconds since the skip started
   * @returns true while the skip is still running
   */
  step(elapsedRealMs: number): boolean {
    if (!this.isSkipping_) {
      return false;
    }

    // A failed objective or an opened brief stops the clock mid-skip. Advancing
    // through a paused scenario would run the sky forward while the mission is
    // frozen, so bail out and keep whatever has been skipped so far.
    if (OpsLogManager.isInitialized() && OpsLogManager.getInstance().isPaused()) {
      this.finish_(false);

      return false;
    }

    const progress = Math.min(1, elapsedRealMs / this.animationMs);
    const chunkMs = TimeSkipController.ease_(progress) * this.totalMs_ - this.skippedMs_;

    if (chunkMs > 0) {
      this.skippedMs_ += chunkMs;

      // Both clocks, same chunk, same frame - see the file header.
      if (OpsLogManager.isInitialized()) {
        OpsLogManager.getInstance().advanceClock(chunkMs);
      }
      addSkippedTime(chunkMs);

      // Countdown timers are decremented state rather than derived from a
      // clock, so they have to be told about the skip explicitly.
      if (ObjectivesManager.hasInstance()) {
        ObjectivesManager.getInstance().applyTimeSkip(chunkMs);
      }

      EventBus.getInstance().emit(Events.TIME_SKIP_PROGRESS, {
        progress,
        simNowMs: getSimulatedNowMs(),
        skippedMs: this.skippedMs_,
        totalMs: this.totalMs_,
      });
    }

    if (progress >= 1) {
      this.finish_(true);

      return false;
    }

    return true;
  }

  /** Stop a running skip where it stands. */
  cancel(): void {
    if (this.isSkipping_) {
      this.finish_(false);
    }
  }

  private frame_(): void {
    this.animationFrameId_ = null;

    if (this.step(Date.now() - this.startedAtRealMs_)) {
      this.animationFrameId_ = requestAnimationFrame(this.frame_.bind(this));
    }
  }

  private finish_(isCompleted: boolean): void {
    if (this.animationFrameId_ !== null) {
      cancelAnimationFrame(this.animationFrameId_);
      this.animationFrameId_ = null;
    }

    this.isSkipping_ = false;

    EventBus.getInstance().emit(Events.TIME_SKIP_ENDED, {
      isCompleted,
      skippedMs: this.skippedMs_,
    });
  }

  private orbitalSatellites_(): OrbitalSatellite[] {
    if (!SimulationManager.hasInstance()) {
      return [];
    }

    return SimulationManager.getInstance().satellites
      .filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite);
  }

  /**
   * Ease in and out. Purely presentational: a linear ramp reads as a glitch,
   * whereas spinning up and settling reads as time passing quickly.
   */
  private static ease_(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
  }

  /** Whether the loaded COMSEC key would age past its validity during a skip. */
  private static wouldExpireCryptoKey_(deltaMs: number): boolean {
    if (!CryptoModule.hasInstance()) {
      return false;
    }

    return CryptoModule.getInstance().getKeyLifeRemainingMs() <= deltaMs;
  }
}
