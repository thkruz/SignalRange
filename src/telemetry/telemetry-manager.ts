/**
 * @file TelemetryManager - spacecraft state-of-health telemetry (phase 18 E)
 * @description A read-only telemetry stream from one satellite: channels
 * grouped by subsystem, each with a nominal value, noise, yellow/red limit
 * bands, and scripted excursions on the mission clock. Frames flow only while
 * the station has an antenna locked on the bird; when the link drops the
 * last values freeze and the stream reads STALE.
 *
 * The telemetry-frames-received / telemetry-channel-in-band /
 * telemetry-soh-nominal conditions and the soh-red-limit / soh-yellow-limit /
 * telemetry-stale facts read this state. Started only when
 * settings.telemetry is present.
 */

import { CommandingManager } from '@app/commanding/commanding-manager';
import { OrbitalSatellite, observerFromLocation } from '@app/equipment/satellite/orbital-satellite';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { Milliseconds } from 'ootk';

export type TelemetryBand = 'green' | 'yellow' | 'red';

/** settings.telemetry.channels[] */
export interface TelemetryChannelConfig {
  id: string;
  label: string;
  unit: string;
  /** Subsystem the channel belongs to (EPS, TCS, ADCS, COMM, OBC, PAYLOAD ...) */
  subsystem: string;
  nominal: number;
  /** Peak-to-peak noise on the reading (default 0) */
  noise?: number;
  /** Outside [yellowLow, yellowHigh] the channel reads yellow (omit a side to leave it unbounded) */
  yellowLow?: number;
  yellowHigh?: number;
  /** Outside [redLow, redHigh] the channel reads red */
  redLow?: number;
  redHigh?: number;
  /** Decimal places shown (default 1) */
  decimals?: number;
}

/** settings.telemetry.excursions[] - a scripted departure from nominal */
export interface TelemetryExcursionConfig {
  id: string;
  channelId: string;
  /** Elapsed second the excursion starts */
  startTime: number;
  /** Seconds it lasts (omit = to the end of the scenario) */
  duration?: number;
  /** Value the channel ramps to */
  rampToValue: number;
  /** Seconds the ramp takes (default 0 = step) */
  rampSeconds?: number;
  /**
   * The excursion ends when this TT&C command has been acknowledged (a
   * commandable cause: a stuck heater, a mode). The channel then ramps back
   * to nominal over recoverySeconds (default rampSeconds) from the ACK.
   */
  endsOnCommandId?: string;
  recoverySeconds?: number;
  label?: string;
}

/** settings.telemetry */
export interface TelemetryConfig {
  groundStationId: string;
  satelliteNoradId: number;
  /** Antenna that must be locked on the bird for frames to flow (default: any antenna on the station) */
  antennaIndex?: number;
  /** Frames per second of mission time (default 1) */
  frameRateHz?: number;
  /** Seconds without a frame before the stream reads STALE (default 10) */
  staleAfterS?: number;
  /** Pointing tolerance (deg) for a manually pointed antenna to count as linked (default 1.5) */
  pointingToleranceDeg?: number;
  channels: TelemetryChannelConfig[];
  excursions?: TelemetryExcursionConfig[];
}

export interface TelemetryReading {
  id: string;
  label: string;
  unit: string;
  subsystem: string;
  value: number;
  band: TelemetryBand;
  decimals: number;
  config: TelemetryChannelConfig;
}

export class TelemetryManager {
  private static instance_: TelemetryManager | null = null;

  private readonly config_: TelemetryConfig;
  private readonly missionStartTime_ = missionNowMs();
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;
  private lastElapsedS_ = 0;
  private frameAccumulatorS_ = 0;
  private frameCount_ = 0;
  private lastFrameElapsedS_: number | null = null;
  /** Last received value per channel (frozen while stale) */
  private readonly values_ = new Map<string, number>();
  /** Test override for the link (null = read the antennas) */
  private linkOverride_: boolean | null = null;

  private constructor() {
    this.config_ = (ScenarioManager.getInstance().settings.telemetry as TelemetryConfig | undefined) ?? {
      groundStationId: '',
      satelliteNoradId: 0,
      channels: [],
    };
    for (const ch of this.config_.channels) this.values_.set(ch.id, ch.nominal);
    this.boundUpdateHandler_ = this.update_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): TelemetryManager {
    this.instance_ ??= new TelemetryManager();

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

  getConfig(): TelemetryConfig {
    return this.config_;
  }

  get frameCount(): number {
    return this.frameCount_;
  }

  /** Seconds since the last frame, Infinity when none has arrived. */
  get secondsSinceFrame(): number {
    return this.lastFrameElapsedS_ === null ? Number.POSITIVE_INFINITY : this.lastElapsedS_ - this.lastFrameElapsedS_;
  }

  /** No fresh frame within staleAfterS (default 10 s). */
  get isStale(): boolean {
    return this.secondsSinceFrame > (this.config_.staleAfterS ?? 10);
  }

  /**
   * Whether an antenna on the station has the bird in its beam right now:
   * either locked on it (program-track / auto-track), or pointed within
   * pointingToleranceDeg of where the bird is from this site (a manually
   * pointed dish on a GEO slot).
   */
  isLinked(): boolean {
    if (this.linkOverride_ !== null) return this.linkOverride_;
    if (!SimulationManager.hasInstance()) return false;
    const sim = SimulationManager.getInstance();
    const gs = sim.groundStations.find((g) => g.state.id === this.config_.groundStationId);
    if (!gs) return false;
    const antennas = this.config_.antennaIndex !== undefined ? [gs.antennas[this.config_.antennaIndex]] : gs.antennas;
    const sat = sim.getSatByNoradId(this.config_.satelliteNoradId);
    const view = sat instanceof OrbitalSatellite ? sat.geometryFor(observerFromLocation(gs.state.location)) : (sat as { az?: number; el?: number } | undefined);
    const tolerance = this.config_.pointingToleranceDeg ?? 1.5;

    return antennas.some((antenna) => {
      if (!antenna) return false;
      const state = antenna.state as { isLocked?: boolean; isPowered?: boolean; targetSatelliteId?: number | null; azimuth: number; elevation: number };
      if (state.isPowered === false) return false;
      const target = state.targetSatelliteId;
      const targetOk = target === undefined || target === null || target === this.config_.satelliteNoradId;
      if (state.isLocked && targetOk) return true;
      if (!view || view.az === undefined || view.el === undefined) return false;
      let azDiff = Math.abs((((state.azimuth % 360) + 360) % 360) - view.az);
      if (azDiff > 180) azDiff = 360 - azDiff;

      return azDiff <= tolerance && Math.abs(state.elevation - view.el) <= tolerance;
    });
  }

  /** Test hook: force the link up or down (null = read the antennas again). */
  setLinkOverride(linked: boolean | null): void {
    this.linkOverride_ = linked;
  }

  /** Current readings, in config order. */
  getReadings(): TelemetryReading[] {
    return this.config_.channels.map((ch) => {
      const value = this.values_.get(ch.id) ?? ch.nominal;

      return { id: ch.id, label: ch.label, unit: ch.unit, subsystem: ch.subsystem, value, band: TelemetryManager.bandOf(ch, value), decimals: ch.decimals ?? 1, config: ch };
    });
  }

  getReading(channelId: string): TelemetryReading | undefined {
    return this.getReadings().find((r) => r.id === channelId);
  }

  /** Band of a channel (green when the channel is unknown). */
  bandOf(channelId: string): TelemetryBand {
    return this.getReading(channelId)?.band ?? 'green';
  }

  /** Every channel green and the stream fresh. */
  isSohNominal(): boolean {
    return !this.isStale && this.getReadings().every((r) => r.band === 'green');
  }

  /** Any channel in the given band (or worse) with the stream fresh. */
  hasBand(band: TelemetryBand): boolean {
    if (this.isStale) return false;
    const rank: Record<TelemetryBand, number> = { green: 0, yellow: 1, red: 2 };

    return this.getReadings().some((r) => rank[r.band] >= rank[band]);
  }

  static bandOf(ch: TelemetryChannelConfig, value: number): TelemetryBand {
    if ((ch.redLow !== undefined && value < ch.redLow) || (ch.redHigh !== undefined && value > ch.redHigh)) return 'red';
    if ((ch.yellowLow !== undefined && value < ch.yellowLow) || (ch.yellowHigh !== undefined && value > ch.yellowHigh)) return 'yellow';

    return 'green';
  }

  /**
   * Advance the stream by a number of mission seconds. Frames arrive at
   * frameRateHz while linked; each frame samples every channel. Exposed for
   * deterministic tests; the tick calls it from the mission clock in-app.
   */
  advance(seconds: number): void {
    if (seconds <= 0) return;
    this.lastElapsedS_ += seconds;
    if (!this.isLinked()) {
      this.frameAccumulatorS_ = 0;

      return;
    }
    const period = 1 / (this.config_.frameRateHz ?? 1);
    this.frameAccumulatorS_ += seconds;
    // A long jump (time skip) still delivers one fresh frame per tick rather
    // than thousands: the reading is what matters, not the count.
    if (this.frameAccumulatorS_ >= period) {
      const frames = Math.min(Math.floor(this.frameAccumulatorS_ / period), 10);
      this.frameAccumulatorS_ -= frames * period;
      this.frameCount_ += frames;
      this.lastFrameElapsedS_ = this.lastElapsedS_;
      this.sample_(this.lastElapsedS_);
    }
  }

  /** The value a channel should read at an elapsed time (nominal + excursion + noise). */
  valueAt(ch: TelemetryChannelConfig, elapsedS: number): number {
    let value = ch.nominal;
    for (const ex of this.config_.excursions ?? []) {
      if (ex.channelId !== ch.id) continue;
      if (elapsedS < ex.startTime) continue;
      const ramp = ex.rampSeconds ?? 0;
      const excursionValueAt = (t: number): number => {
        const progress = ramp > 0 ? Math.min(1, (t - ex.startTime) / ramp) : 1;
        return ch.nominal + (ex.rampToValue - ch.nominal) * progress;
      };
      // The excursion ends at its scheduled end, or when its command ACKs.
      let end = ex.duration === undefined ? Number.POSITIVE_INFINITY : ex.startTime + ex.duration;
      const ackAt = ex.endsOnCommandId && CommandingManager.isInitialized() ? CommandingManager.getInstance().acknowledgedAt(ex.endsOnCommandId) : undefined;
      if (ackAt !== undefined && ackAt >= ex.startTime && ackAt < end) end = ackAt;
      if (elapsedS < end) {
        value = excursionValueAt(elapsedS);
        continue;
      }
      // After the end: a commanded excursion recovers over recoverySeconds; a scheduled one stops.
      if (ackAt !== undefined && end === ackAt) {
        const recovery = ex.recoverySeconds ?? ramp;
        const from = excursionValueAt(end);
        const progress = recovery > 0 ? Math.min(1, (elapsedS - end) / recovery) : 1;
        value = from + (ch.nominal - from) * progress;
      }
    }
    const noise = ch.noise ?? 0;
    if (noise > 0) {
      // Deterministic jitter: the same second always reads the same value.
      const phase = Math.sin(elapsedS * 12.9898 + ch.id.length * 78.233) * 43758.5453;
      value += (phase - Math.floor(phase) - 0.5) * noise;
    }

    return value;
  }

  private sample_(elapsedS: number): void {
    for (const ch of this.config_.channels) this.values_.set(ch.id, this.valueAt(ch, elapsedS));
  }

  private update_(): void {
    const elapsed = (missionNowMs() - this.missionStartTime_) / 1000;
    const deltaS = Math.max(0, elapsed - this.lastElapsedS_);
    this.lastElapsedS_ = elapsed - deltaS; // advance() re-adds it
    this.advance(deltaS);
  }
}
