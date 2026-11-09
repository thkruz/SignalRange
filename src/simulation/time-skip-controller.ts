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
 * It advances the one scenario clock (sim-clock.ts), which drives SGP4, pass
 * prediction, the UTC display and every "seconds since mission start"
 * mechanic (command windows, maneuvers, weather, interference, scoring
 * elapsed time, COMSEC key age) - so the console and the sky cannot end up in
 * different hours.
 *
 * Opt-in per scenario via settings.timeSkip; campaigns that do not declare it
 * never see the control.
 *
 * Phase 27 Q4 adds an objective-anchored skip ("Skip 15 min"): an objective
 * with `timeSkip` offers to fast-forward a real wait the scenario compresses
 * (a crew maintenance window, a pass window, a rain cell). Unlike the pass
 * skip it also advances RUN time (SimClock.advanceRun), because the station
 * really sat through that wait: sim timers (lock delays, warm-up, LNB
 * stabilisation) fire, weather ice integrates over it, and the objective's
 * own timed holds earn the skipped seconds. It does not burn the anchoring
 * objective's countdown, and it is logged in the Ops Log.
 *
 * Phase 28 D1: the objective skip runs to the end of the hold (the clock time,
 * weather end or timed hold the objective waits for) and stops as soon as the
 * objective completes, so it never spends a later step's time. It charges no
 * countdown at all: the mission countdown is held through the wait whether
 * the operator waits or skips.
 */

import { CryptoModule } from '@app/equipment/crypto';
import { type OrbitalObserver, OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import type { TimeSkipOffer } from '@app/objectives/objective-types';
import { ObjectivesManager } from '@app/objectives/objectives-manager';
import { OpsLogManager } from '@app/ops-log/ops-log-manager';
import { assetSelectionState } from '@app/pages/mission-control/asset-selection-state';
import { ScenarioManager } from '@app/scenario-manager';
import { PassPlannerService, type SatellitePass, scenarioMinElevation } from '@app/services/pass-planner-service';
import { SimClock } from '@app/simulation/sim-clock';
import { getSimulatedNowMs } from '@app/simulation/sim-time';
import { SimulationManager } from '@app/simulation/simulation-manager';
import { WeatherManager } from '@app/weather/weather-manager';
import type { Degrees } from 'ootk';

/** settings.timeSkip */
export interface TimeSkipConfig {
  /**
   * Stop this many seconds before AOS. The operator should arrive with the
   * antenna still to be pointed and the receiver still to be tuned - handing
   * them a bird already in the beam skips the part that is the lesson.
   * Set to 0 to stop at AOS once preparation is done. Default 120.
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
  /** Set on a missed-pass recovery skip (D4): the objective whose pass was missed and where */
  recovery?: { objectiveId: string; stationId: string | null };
}

const DEFAULT_LEAD_TIME_S = 120;
const DEFAULT_ANIMATION_MS = 2500;
const DEFAULT_MIN_SKIP_S = 300;
const DEFAULT_HORIZON_HOURS = 12;
/** A missed-pass recovery always searches a full day ahead */
const RECOVERY_HORIZON_HOURS = 24;

export class TimeSkipController {
  private static instance_: TimeSkipController | null = null;

  private readonly config_: TimeSkipConfig;
  private readonly passPlanner_ = new PassPlannerService();

  private isSkipping_ = false;
  private totalMs_ = 0;
  private skippedMs_ = 0;
  private startedAtRealMs_ = 0;
  private animationFrameId_: number | null = null;
  private objectiveSkip_: TimeSkipOffer | null = null;
  private passSkip_: SkipTarget | null = null;

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

    const observers = this.stationObservers_();
    const inView = this.orbitalSatellites_().filter((sat) => (observers.length === 0 ? sat.isAboveHorizon : observers.some((observer) => sat.isAboveHorizonFor(observer))));

    if (inView.length > 0) {
      return `${inView[0].name} is in view - work the pass`;
    }

    if (ObjectivesManager.hasInstance() && ObjectivesManager.getInstance().hasRunningObjectiveTimer()) {
      return 'A timed objective is running';
    }

    return null;
  }

  /**
   * The objective wait on offer right now (Phase 27 Q4), or null. Read by the
   * command bar each second to show or hide its skip control. Since Phase 28
   * D1 the offer covers exactly the rest of the hold.
   */
  findObjectiveSkip(): TimeSkipOffer | null {
    if (!ObjectivesManager.hasInstance()) {
      return null;
    }

    return ObjectivesManager.getInstance().getAvailableTimeSkip();
  }

  /**
   * Why the objective skip cannot run now, or null when it can. Narrower than
   * getBlockedReason(): the wait being skipped is the objective's own, so its
   * timer and a bird overhead do not block it; another objective being timed
   * still does.
   */
  getObjectiveSkipBlockedReason(objectiveId: string): string | null {
    if (this.isSkipping_) {
      return 'Skip already running';
    }
    if (!OpsLogManager.isInitialized()) {
      return 'Scenario clock is not running';
    }
    if (OpsLogManager.getInstance().isPaused()) {
      return 'Scenario clock is paused';
    }
    if (ObjectivesManager.hasInstance() && ObjectivesManager.getInstance().hasRunningObjectiveTimer(objectiveId)) {
      return 'Another timed objective is running';
    }

    return null;
  }

  /**
   * Fast-forward the active objective's wait to its end (Phase 28 D1). One
   * shot per objective. Returns false when nothing is on offer or the skip is
   * blocked.
   */
  startObjectiveSkip(): boolean {
    const offer = this.findObjectiveSkip();
    if (!offer || this.getObjectiveSkipBlockedReason(offer.objectiveId) !== null) {
      return false;
    }

    const totalMs = offer.deltaMs;
    ObjectivesManager.getInstance().markTimeSkipUsed(offer.objectiveId);
    this.objectiveSkip_ = offer;
    this.isSkipping_ = true;
    this.totalMs_ = totalMs;
    this.skippedMs_ = 0;
    this.startedAtRealMs_ = Date.now();

    EventBus.getInstance().emit(Events.TIME_SKIP_STARTED, {
      satelliteName: '',
      label: offer.label,
      targetMs: getSimulatedNowMs() + totalMs,
      totalMs,
    });

    this.animationFrameId_ = requestAnimationFrame(this.frame_.bind(this));

    return true;
  }

  /**
   * The next pass worth skipping to, or null when there is nothing to skip to
   * (no orbital satellites, nothing inside the search horizon, or the wait is
   * short enough to just work through).
   *
   * AOS is the satellite's receivable horizon (the first signal), not the
   * scenario's planning mask, so the stop point agrees with the Pass Schedule.
   */
  findTarget(): SkipTarget | null {
    const nowMs = getSimulatedNowMs();
    const next = this.nextPass_(nowMs, this.config_.horizonHours ?? DEFAULT_HORIZON_HOURS);

    if (!next) {
      return null;
    }

    const targetMs = next.aosMs - this.leadTimeS * 1000;
    const deltaMs = targetMs - nowMs;

    // Negative when a pass is in progress or its lead-in has begun; below the
    // floor when the wait is short enough to just work through.
    if (deltaMs < this.minSkipS * 1000) {
      return null;
    }

    return this.toTarget_(next, targetMs, deltaMs);
  }

  /**
   * The next contact when it is coming but too close to skip to (inside the
   * lead time plus the minimum skip), else null. Lets the bar say "Next
   * contact X in 5m49s, too close to skip" instead of "No upcoming contact".
   */
  findTooCloseContact(): { satelliteName: string; untilAosMs: number } | null {
    const nowMs = getSimulatedNowMs();
    const next = this.nextPass_(nowMs, this.config_.horizonHours ?? DEFAULT_HORIZON_HOURS);

    if (!next || next.aosMs <= nowMs) {
      return null;
    }

    const deltaMs = next.aosMs - this.leadTimeS * 1000 - nowMs;

    return deltaMs < this.minSkipS * 1000 ? { satelliteName: next.satelliteName, untilAosMs: next.aosMs - nowMs } : null;
  }

  /**
   * A way back after a missed pass (D4). When an active, incomplete objective
   * is pass-bound (an antenna-locked row naming a satellite) and that
   * satellite has set at the objective's station since the objective
   * activated, offers a skip to its next pass, searching 24 h whatever
   * `horizonHours` is. Null when nothing is missed or the next pass is too
   * close to skip to.
   */
  findRecoveryTarget(): SkipTarget | null {
    if (!ObjectivesManager.hasInstance()) {
      return null;
    }

    const nowMs = getSimulatedNowMs();
    const registry = SimulationManager.getInstance().registry;

    for (const state of ObjectivesManager.getInstance().getObjectiveStates()) {
      if (!state.isActive || state.isCompleted || state.isFailed || state.activatedAt === undefined) {
        continue;
      }

      const stationId = state.objective.groundStation;
      const observers = stationId ? this.stationObservers_().filter((o) => o.name === stationId) : this.stationObservers_();

      for (const condition of state.objective.conditions) {
        const noradId = condition.type === 'antenna-locked' ? (condition.params?.noradId ?? condition.params?.satelliteId) : undefined;
        const found = noradId === undefined ? undefined : registry.get(noradId);
        const sat = found instanceof OrbitalSatellite ? found : undefined;

        if (!sat) {
          continue;
        }

        for (const observer of observers.length > 0 ? observers : [undefined]) {
          if (!this.hasSetSince_(sat, observer, state.activatedAt, nowMs)) {
            continue;
          }

          const next = this.passOptions_(sat, nowMs, RECOVERY_HORIZON_HOURS, observer)[0];
          if (!next || next.aosMs <= nowMs) {
            continue;
          }

          const targetMs = next.aosMs - this.leadTimeS * 1000;
          const deltaMs = targetMs - nowMs;
          if (deltaMs < this.minSkipS * 1000) {
            continue;
          }

          return { ...this.toTarget_(next, targetMs, deltaMs), recovery: { objectiveId: state.objective.id, stationId: observer?.name ?? stationId ?? null } };
        }
      }
    }

    return null;
  }

  /**
   * Run the fast-forward. Returns false when the skip could not start.
   *
   * The skip runs what the target promised: it ends at `target.targetMs`, not
   * `deltaMs` after the click. A target cached by the bar, or held open in the
   * modal, is older than the clock, so the distance is re-derived from now and
   * the skip refused when that has fallen below the minimum (D6).
   *
   * @param target Resolved target from findTarget()
   */
  start(target: SkipTarget): boolean {
    const deltaMs = target.targetMs - getSimulatedNowMs();

    if (this.isSkipping_ || this.getBlockedReason() !== null || deltaMs < this.minSkipS * 1000) {
      return false;
    }

    this.isSkipping_ = true;
    this.totalMs_ = deltaMs;
    this.skippedMs_ = 0;
    this.startedAtRealMs_ = Date.now();
    this.passSkip_ = target;

    EventBus.getInstance().emit(Events.TIME_SKIP_STARTED, {
      satelliteName: target.satelliteName,
      targetMs: target.targetMs,
      totalMs: deltaMs,
    });

    this.animationFrameId_ = requestAnimationFrame(this.frame_.bind(this));

    return true;
  }

  /** Passes for one satellite at the receivable horizon, masked by the scenario. */
  private passOptions_(sat: OrbitalSatellite, nowMs: number, horizonHours: number, observer?: OrbitalObserver): SatellitePass[] {
    return this.passPlanner_.getPasses(sat, nowMs, {
      horizonHours,
      aosElevation: 'receivable',
      minPeakElevation: scenarioMinElevation(ScenarioManager.getInstance().settings),
      observer,
      maxPasses: observer ? 1 : 10,
    });
  }

  /** Earliest pass across every satellite and station inside the horizon. */
  private nextPass_(nowMs: number, horizonHours: number): SatellitePass | undefined {
    const satellites = this.orbitalSatellites_();
    // The skip follows the station the operator is looking at (Pass Schedule
    // and the deck do the same), so the modal never quotes another site's pass.
    // With no station selected, a pass at ANY site is a contact the operator may
    // need to work, so the next pass is the earliest AOS across every station.
    // Only ever the NEXT pass, never one beyond it: searching forward for the
    // first pass with enough lead time would let an operator two minutes from
    // AOS skip straight over the contact they are about to work.
    const allObservers = this.stationObservers_();
    const selected = allObservers.filter((o) => o.name === assetSelectionState.groundStationId);
    const observers = selected.length > 0 ? selected : allObservers;
    const passes = satellites.flatMap((sat) =>
      observers.length === 0 ? this.passOptions_(sat, nowMs, horizonHours) : observers.flatMap((observer) => this.passOptions_(sat, nowMs, horizonHours, observer))
    );

    return passes.sort((a, b) => a.aosMs - b.aosMs)[0];
  }

  /** Whether `sat` completed a pass at `observer` between `sinceMs` and `nowMs`. */
  private hasSetSince_(sat: OrbitalSatellite, observer: OrbitalObserver | undefined, sinceMs: number, nowMs: number): boolean {
    const horizonHours = Math.max(0, (nowMs - sinceMs) / 3_600_000);
    const passes = this.passPlanner_.getPasses(sat, sinceMs, {
      horizonHours,
      aosElevation: 'receivable',
      minPeakElevation: scenarioMinElevation(ScenarioManager.getInstance().settings),
      observer,
      maxPasses: 20,
    });

    return passes.some((pass) => pass.losMs <= nowMs);
  }

  private toTarget_(pass: SatellitePass, targetMs: number, deltaMs: number): SkipTarget {
    return {
      satelliteName: pass.satelliteName,
      noradId: pass.noradId,
      aosMs: pass.aosMs,
      targetMs,
      deltaMs,
      maxEl: pass.maxEl,
      willExpireCryptoKey: TimeSkipController.wouldExpireCryptoKey_(deltaMs),
    };
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
    if (SimClock.isPaused('menu') || (OpsLogManager.isInitialized() && OpsLogManager.getInstance().isPaused())) {
      this.finish_(false);

      return false;
    }

    // The wait is over: the objective completed (its holds also earn the
    // frames that run during the animation, so it can finish a moment
    // early). Stop here; running on would spend the next step's time
    // (nats-r3-s10-F1).
    if (this.objectiveSkip_ && !this.isObjectiveStillWaiting_(this.objectiveSkip_.objectiveId)) {
      this.finish_(true);

      return false;
    }

    const progress = Math.min(1, elapsedRealMs / this.animationMs);
    const requestedMs = TimeSkipController.ease_(progress) * this.totalMs_ - this.skippedMs_;
    // Normal simulation ticks also advance the clock during the animation.
    // Never add those seconds on top of the promised pass arrival time.
    const chunkMs = this.passSkip_ ? Math.min(requestedMs, Math.max(0, this.passSkip_.targetMs - getSimulatedNowMs())) : requestedMs;

    if (chunkMs > 0) {
      this.skippedMs_ += chunkMs;

      // One clock: orbits and every mission-elapsed schedule move together
      if (OpsLogManager.isInitialized()) {
        OpsLogManager.getInstance().advanceClock(chunkMs);
      } else {
        SimClock.skip(chunkMs);
      }

      // An objective wait is time the station sat through: run time (sim
      // timers, warm-ups, stabilisation) and weather ice move with it
      if (this.objectiveSkip_) {
        SimClock.advanceRun(chunkMs);
        if (WeatherManager.hasInstance()) {
          WeatherManager.getInstance().applyTimeSkip(chunkMs / 1000);
        }
      }

      // Countdown timers are decremented state rather than derived from a
      // clock, so they have to be told about the skip explicitly. The
      // objective whose wait this is does not pay for it.
      if (ObjectivesManager.hasInstance()) {
        ObjectivesManager.getInstance().applyTimeSkip(chunkMs, this.objectiveSkip_?.objectiveId);
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

    const objectiveSkip = this.objectiveSkip_;
    this.objectiveSkip_ = null;
    const passSkip = this.passSkip_;
    this.passSkip_ = null;
    if (passSkip && OpsLogManager.isInitialized()) {
      this.logPassSkip_(passSkip, isCompleted);
    }
    if (objectiveSkip && OpsLogManager.isInitialized()) {
      const minutes = Math.round(this.skippedMs_ / 60_000);
      const tail = isCompleted ? '' : ' (stopped early)';
      OpsLogManager.getInstance().log(`Waited out the ${objectiveSkip.label}: clock advanced ${minutes} min${tail}`, 'system', 'Time skip');
    }

    EventBus.getInstance().emit(Events.TIME_SKIP_ENDED, {
      isCompleted,
      skippedMs: this.skippedMs_,
    });
  }

  private logPassSkip_(target: SkipTarget, isCompleted: boolean): void {
    const tail = isCompleted ? '' : ' (stopped early)';
    const minutes = Math.round(this.skippedMs_ / 60_000);
    let line = `Waited out the wait for ${target.satelliteName}: clock advanced ${minutes} min${tail}`;
    if (target.recovery) {
      const station = SimulationManager.getInstance().groundStations?.find((gs) => gs.state.id === target.recovery?.stationId);
      line = `Pass missed; waited for the next ${target.satelliteName} pass${station ? ` at ${station.state.name}` : ''}${tail}`;
    }
    OpsLogManager.getInstance().log(line, 'system', 'Time skip');
  }

  /** Whether the objective an objective skip covers is still open */
  private isObjectiveStillWaiting_(objectiveId: string): boolean {
    if (!ObjectivesManager.hasInstance()) {
      return false;
    }
    const state = ObjectivesManager.getInstance().getObjectiveState(objectiveId);

    return state !== undefined && state.isActive && !state.isCompleted && !state.isFailed;
  }

  private orbitalSatellites_(): OrbitalSatellite[] {
    if (!SimulationManager.hasInstance()) {
      return [];
    }

    return SimulationManager.getInstance().satellites.filter((sat): sat is OrbitalSatellite => sat instanceof OrbitalSatellite);
  }

  /** One observer per ground station in the scenario (empty when unknown). */
  private stationObservers_(): OrbitalObserver[] {
    if (!SimulationManager.hasInstance()) {
      return [];
    }

    return (SimulationManager.getInstance().groundStations ?? []).map((gs) => observerFromLocation(gs.state.location, gs.state.id));
  }

  /**
   * Ease in and out. Purely presentational: a linear ramp reads as a glitch,
   * whereas spinning up and settling reads as time passing quickly.
   */
  private static ease_(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  /** Whether the loaded COMSEC key would age past its validity during a skip. */
  private static wouldExpireCryptoKey_(deltaMs: number): boolean {
    if (!CryptoModule.hasInstance()) {
      return false;
    }

    return CryptoModule.getInstance().getKeyLifeRemainingMs() <= deltaMs;
  }
}
