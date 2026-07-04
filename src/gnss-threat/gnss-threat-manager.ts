/**
 * @file GnssThreatManager - GNSS spoofing / timing attack (nats-eu M8)
 * @description Models a GNSS spoof against the station timing reference. The
 * diagnostic tell is that the GNSS timing solution walks off (a growing time
 * offset) while the satellite count stays healthy - unlike a normal outage where
 * satellites drop. The operator must recognize the signature and stop trusting
 * GNSS by forcing the GPSDO to holdover (or a manual reference), riding passes on
 * the disciplined oscillator until the all-clear. The gpsdo-reference-mode-set
 * condition reads the selected reference mode; recovery reuses the existing
 * gpsdo-* conditions.
 *
 * Started only when settings.gnssThreat is present. Subscribes to Events.UPDATE
 * to drive the spoof window + offset drift on the mission clock; tests can call
 * setSpoofActive()/advance() for determinism.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import type { Milliseconds } from 'ootk';

export type GpsdoReferenceMode = 'gnss' | 'holdover' | 'manual';

/** settings.gnssThreat */
export interface GnssThreatConfig {
  /** Ground stations whose timing reference is targeted (for display) */
  groundStationIds?: string[];
  /** Elapsed second the spoof begins */
  spoofStartS: number;
  /** Elapsed second the spoof ends (omit = runs to scenario end) */
  spoofEndS?: number;
  /** Timing-offset drift rate while spoofed, microseconds per second (default 5) */
  offsetDriftUsPerS?: number;
}

interface GnssThreatState {
  spoofActive: boolean;
  /** Accumulated timing offset, microseconds (the tell that GNSS is being spoofed) */
  timeOffsetUs: number;
  referenceMode: GpsdoReferenceMode;
}

export class GnssThreatManager {
  private static instance_: GnssThreatManager | null = null;

  private readonly config_: GnssThreatConfig;
  private readonly state_: GnssThreatState = { spoofActive: false, timeOffsetUs: 0, referenceMode: 'gnss' };
  private readonly missionStartTime_ = Date.now();
  private lastElapsedS_ = 0;
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.gnssThreat as GnssThreatConfig | undefined)
      ?? { spoofStartS: 0 };
    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): GnssThreatManager {
    this.instance_ ??= new GnssThreatManager();

    return this.instance_;
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  get state(): Readonly<GnssThreatState> {
    return this.state_;
  }

  getConfig(): GnssThreatConfig {
    return this.config_;
  }

  /**
   * Whether the timing reference is currently being spoofed AND the operator has
   * not defended against it (still trusting GNSS). This is the "exposed" state a
   * scenario penalizes; once the operator forces holdover/manual it clears.
   */
  get isExposedToSpoof(): boolean {
    return this.state_.spoofActive && this.state_.referenceMode === 'gnss';
  }

  /** Select the GPSDO reference/discipline mode (the defensive action). */
  setReferenceMode(mode: GpsdoReferenceMode): void {
    this.state_.referenceMode = mode;
  }

  isReferenceModeSet(mode: GpsdoReferenceMode): boolean {
    return this.state_.referenceMode === mode;
  }

  /** Force the spoof state (used by the tick and by tests). */
  setSpoofActive(active: boolean): void {
    this.state_.spoofActive = active;
  }

  /**
   * Advance the timing-offset drift by a number of simulated seconds while
   * spoofed and still trusting GNSS. Exposed for deterministic tests; the tick
   * calls it from the mission clock in-app.
   */
  advance(seconds: number): void {
    if (this.isExposedToSpoof) {
      this.state_.timeOffsetUs += (this.config_.offsetDriftUsPerS ?? 5) * seconds;
    }
  }

  private update_(): void {
    const elapsed = (Date.now() - this.missionStartTime_) / 1000;
    const inWindow = elapsed >= this.config_.spoofStartS
      && (this.config_.spoofEndS === undefined || elapsed < this.config_.spoofEndS);
    this.state_.spoofActive = inWindow;

    const deltaS = Math.max(0, elapsed - this.lastElapsedS_);
    this.lastElapsedS_ = elapsed;
    this.advance(deltaS);
  }
}
