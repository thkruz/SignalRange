/**
 * @file WeatherManager - Manages weather events and ice accumulation on antennas
 * @description Processes weather events from scenario data, tracks ice buildup
 * on antenna feed horns when heaters are off, and emits weather-related events.
 */

import { EventBus } from '@app/events/event-bus';
import { Events, WeatherEventData } from '@app/events/events';
import { ObjectiveAnchors } from '@app/objectives/objective-anchor';
import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimClock } from '@app/simulation/sim-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
import type { WeatherSnapshot } from '@app/sync/manager-state-types';
import type { Milliseconds } from 'ootk';

/** Configuration for ice accumulation based on weather severity */
export interface IceAccumulationConfig {
  /** Maximum degradation in dB when fully iced */
  maxDegradation_dB: number;
  /** Time constant in seconds (63% of max reached in this time) */
  timeConstant_s: number;
}

/** Runtime state for a weather event */
export interface WeatherEventRuntime extends WeatherEventData {
  /** Whether the event is currently active */
  isActive: boolean;
  /**
   * Waiting for startAfterObjectiveId. While true, startTime still holds the
   * authored offset; anchoring rewrites it to a mission-elapsed start.
   */
  isAwaitingAnchor?: boolean;
}

/**
 * WeatherManager singleton - manages weather events and ice accumulation
 *
 * Ice accumulation follows exponential buildup when heater is OFF during ice/snow:
 *   ice(t) = maxIce * (1 - e^(-t/tau))
 *
 * Ice melts linearly when heater is ON:
 *   meltRate = 1 dB per minute
 */
export class WeatherManager {
  private static instance_: WeatherManager | null = null;
  private weatherEvents_: WeatherEventRuntime[] = [];
  private missionStartTime_: number = 0;
  private anchors_ = new ObjectiveAnchors([]);

  /** Ice accumulation time in seconds per antenna (keyed by antenna uniqueId) */
  private iceAccumulationTime_: Map<string, number> = new Map();

  /** Severity-based ice accumulation configuration (slowed 4x for gameplay) */
  static readonly SEVERITY_CONFIG: Record<string, IceAccumulationConfig> = {
    minor: { maxDegradation_dB: 2, timeConstant_s: 2400 }, // 40 min to ~63%
    moderate: { maxDegradation_dB: 5, timeConstant_s: 1200 }, // 20 min to ~63%
    severe: { maxDegradation_dB: 10, timeConstant_s: 720 }, // 12 min to ~63%
  };

  /** Melt rate when heater is ON: 1 dB per minute */
  static readonly MELT_RATE_DB_PER_SECOND = 1 / 60;

  /**
   * Rain rate by severity, mm/h, when an event does not name one. Roughly the
   * temperate-zone 0.1 % / 0.01 % exceedance rates; a `storm` is one step
   * heavier than the same severity of `rain`.
   */
  static readonly RAIN_RATE_MM_H: Record<string, number> = {
    minor: 4,
    moderate: 12,
    severe: 30,
    extreme: 50,
  };

  /**
   * Sustained wind by severity, m/s, when an event does not name one (phase
   * 19.4). A storm carries a little more wind than a plain wind event.
   */
  static readonly WIND_SPEED_MPS: Record<string, Record<string, number>> = {
    wind: { minor: 8, moderate: 14, severe: 22 },
    storm: { minor: 10, moderate: 18, severe: 26 },
  };

  /** Rain ramps in and out over this fraction of the event, capped at 5 min */
  static readonly RAIN_RAMP_FRACTION = 0.15;
  static readonly RAIN_RAMP_MAX_S = 300;

  /** Bound handler for cleanup */
  private readonly boundUpdateHandler_: (dt: Milliseconds) => void;

  private constructor() {
    this.missionStartTime_ = missionNowMs();
    this.boundUpdateHandler_ = this.update_.bind(this);

    this.loadWeatherEvents_();
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): WeatherManager {
    this.instance_ ??= new WeatherManager();
    return this.instance_;
  }

  /** Whether a scenario has created the manager (getInstance needs a loaded scenario) */
  static hasInstance(): boolean {
    return this.instance_ !== null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  getCheckpointState(): WeatherSnapshot {
    return {
      missionStartTimeMs: this.missionStartTime_,
      anchors: this.anchors_.getState(),
      events: this.weatherEvents_.map(({ id, startTime, isActive, isAwaitingAnchor }) => ({ id, startTime, isActive, isAwaitingAnchor: Boolean(isAwaitingAnchor) })),
      iceAccumulation: [...this.iceAccumulationTime_],
    };
  }

  restoreCheckpointState(snapshot: Partial<WeatherSnapshot> | undefined): void {
    // Legacy saves retain their hydrated antenna conditions; unresolved
    // objective anchors use the existing first-live-tick fallback.
    if (!snapshot) return;
    if (Number.isFinite(snapshot.missionStartTimeMs)) this.missionStartTime_ = snapshot.missionStartTimeMs!;
    this.anchors_.restoreState(snapshot.anchors);
    for (const saved of Array.isArray(snapshot.events) ? snapshot.events : []) {
      const event = this.weatherEvents_.find((item) => item.id === saved?.id);
      if (!event || !Number.isFinite(saved.startTime)) continue;
      event.startTime = saved.startTime;
      event.isActive = saved.isActive === true;
      event.isAwaitingAnchor = saved.isAwaitingAnchor === true;
    }
    this.iceAccumulationTime_.clear();
    for (const entry of Array.isArray(snapshot.iceAccumulation) ? snapshot.iceAccumulation : []) {
      if (Array.isArray(entry) && typeof entry[0] === 'string' && Number.isFinite(entry[1]) && entry[1] >= 0) this.iceAccumulationTime_.set(entry[0], entry[1]);
    }
  }

  /** Recompute environmental effects after the saved clock has been restored, without advancing ice. */
  refreshRestoredConditions(): void {
    const elapsed = this.getElapsedMissionTime();
    this.updateSunTransit_(elapsed);
    this.updateRain_(elapsed);
    this.updateWind_(elapsed);
  }

  /** Load weather events from current scenario */
  private loadWeatherEvents_(): void {
    const events = ScenarioManager.getInstance().settings.weatherEvents ?? [];
    this.weatherEvents_ = events.map((e) => ({
      ...e,
      isActive: false,
      isAwaitingAnchor: e.startAfterObjectiveId !== undefined,
    }));
    this.anchors_ = new ObjectiveAnchors(events.map((e) => e.startAfterObjectiveId));
  }

  /**
   * Start the clock on events anchored to an objective once it is live (see
   * objective-anchor.ts). The start is written back into startTime so the
   * profiles and WEATHER_EVENT_STARTED carry the real mission-elapsed start.
   */
  private anchorEvents_(elapsedSeconds: number): void {
    this.anchors_.poll(elapsedSeconds);

    for (const event of this.weatherEvents_) {
      if (!event.isAwaitingAnchor) {
        continue;
      }
      const startS = this.anchors_.atS(event.startTime, event.startAfterObjectiveId);
      if (Number.isFinite(startS)) {
        event.startTime = startS;
        event.isAwaitingAnchor = false;
      }
    }
  }

  /** Get elapsed mission time in seconds */
  getElapsedMissionTime(): number {
    return (missionNowMs() - this.missionStartTime_) / 1000;
  }

  /** Main update loop - called on each simulation tick */
  private update_(dt: Milliseconds): void {
    const elapsedSeconds = this.getElapsedMissionTime();
    // UPDATE fires on every fixed step, scenario clock held or not: ice
    // builds and melts on scenario time only, so it holds while a dialog,
    // brief or quiz holds the clock (Phase 34 D9, nats-r9-s20-F1). An
    // operator time skip is not a step and stays excluded, as before
    const dtSeconds = SimClock.isPaused('scenario') ? 0 : dt / 1000;

    // Start objective-anchored events whose objective has come up
    this.anchorEvents_(elapsedSeconds);

    // Update weather event active states
    this.updateWeatherEventStates_(elapsedSeconds);

    // Update ice accumulation for all antennas
    this.updateIceAccumulation_(dtSeconds);

    // Update sun-transit sky-noise degradation for all antennas
    this.updateSunTransit_(elapsedSeconds);

    // Update the rain rate over each site (phase 16, E5)
    this.updateRain_(elapsedSeconds);

    // Update the wind over each site (phase 19.4: wind de-points the beam)
    this.updateWind_(elapsedSeconds);
  }

  /**
   * Wind speed (m/s) an event produces at `elapsedSeconds`: its authored or
   * severity-derived speed, ramped in and out like rain.
   */
  static windSpeedAt(event: WeatherEventRuntime, elapsedSeconds: number): number {
    const table = WeatherManager.WIND_SPEED_MPS[event.type];
    if (!table) {
      return 0;
    }
    const peak = event.windSpeedMps ?? table[event.severity] ?? 0;
    const sinceStart = elapsedSeconds - event.startTime;
    const untilEnd = event.startTime + event.duration - elapsedSeconds;
    if (sinceStart < 0 || untilEnd <= 0) {
      return 0;
    }
    const rampS = Math.min(WeatherManager.RAIN_RAMP_MAX_S, event.duration * WeatherManager.RAIN_RAMP_FRACTION);
    const envelope = rampS > 0 ? Math.min(1, sinceStart / rampS, untilEnd / rampS) : 1;
    return peak * envelope;
  }

  /** Push the site's wind speed to its antennas (0 when calm) */
  private updateWind_(elapsedSeconds: number): void {
    const sim = SimulationManager.getInstance();

    for (const gs of sim.groundStations) {
      let wind = 0;
      for (const event of this.weatherEvents_) {
        if (event.groundStationId === gs.state.id && event.isActive) {
          wind = Math.max(wind, WeatherManager.windSpeedAt(event, elapsedSeconds));
        }
      }

      for (const antenna of gs.antennas) {
        if (antenna.state.windSpeed_mps !== wind && typeof antenna.updateWindSpeed === 'function') {
          antenna.updateWindSpeed(wind);
        }
      }
    }
  }

  /**
   * Rain rate (mm/h) an event produces at `elapsedSeconds`: its authored or
   * severity-derived rate with a linear ramp in and out, so a fade builds and
   * clears the way a front does rather than switching.
   */
  static rainRateAt(event: WeatherEventRuntime, elapsedSeconds: number): number {
    if (event.type !== 'rain' && event.type !== 'storm') {
      return 0;
    }
    const peak = event.rainRateMmPerHour ?? WeatherManager.RAIN_RATE_MM_H[event.type === 'storm' ? WeatherManager.heavierSeverity_(event.severity) : event.severity] ?? 0;
    const sinceStart = elapsedSeconds - event.startTime;
    const untilEnd = event.startTime + event.duration - elapsedSeconds;
    if (sinceStart < 0 || untilEnd <= 0) {
      return 0;
    }
    const rampS = Math.min(WeatherManager.RAIN_RAMP_MAX_S, event.duration * WeatherManager.RAIN_RAMP_FRACTION);
    const envelope = rampS > 0 ? Math.min(1, sinceStart / rampS, untilEnd / rampS) : 1;
    return peak * envelope;
  }

  private static heavierSeverity_(severity: string): string {
    return severity === 'minor' ? 'moderate' : severity === 'moderate' ? 'severe' : 'extreme';
  }

  /**
   * Push the site's rain rate to its antennas. Rain is frequency dependent, so
   * the manager sends the rate and each antenna prices it at its own band and
   * elevation (`AntennaCore.rainAttenuation_dB`). Written as 0 when dry.
   */
  private updateRain_(elapsedSeconds: number): void {
    const sim = SimulationManager.getInstance();

    for (const gs of sim.groundStations) {
      let rate = 0;
      for (const event of this.weatherEvents_) {
        if (event.groundStationId === gs.state.id && event.isActive) {
          rate = Math.max(rate, WeatherManager.rainRateAt(event, elapsedSeconds));
        }
      }

      for (const antenna of gs.antennas) {
        if (antenna.state.rainRate_mmh !== rate) {
          antenna.updateRainRate(rate);
        }
      }
    }
  }

  /**
   * Apply sun-transit sky-noise degradation to affected ground stations.
   *
   * The Sun crossing the antenna boresight raises the noise floor following a
   * smooth rise-peak-fall profile: sin^2(pi * progress) scaled by the event's
   * linkMarginDegradation (peak dB). Since Phase 19.2 the antenna turns that
   * rise into solar antenna temperature (AntennaCore.systemNoise): the carrier
   * keeps its power and the noise climbs, so C/N, the analyzer floor and the
   * AGC all see it. Timing and peak stay authored (DEV-PROP-04): legacy GEO
   * satellites have authored look angles, so the solar ephemeris cannot place
   * the transit. Degradation is RX-only and clears automatically when the
   * event ends - there is no operator mitigation, by design: the training
   * point is to anticipate, ride through, and document.
   */
  private updateSunTransit_(elapsedSeconds: number): void {
    const sim = SimulationManager.getInstance();

    for (const gs of sim.groundStations) {
      const sunEvent = this.weatherEvents_.find((e) => e.groundStationId === gs.state.id && e.type === 'sun-transit' && e.isActive);

      let degradation = 0;
      if (sunEvent) {
        const progress = (elapsedSeconds - sunEvent.startTime) / sunEvent.duration;
        const profile = Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) ** 2;
        degradation = sunEvent.linkMarginDegradation * profile;
      }

      for (const antenna of gs.antennas) {
        if (antenna.state.skyNoiseDegradation_dB !== degradation) {
          antenna.updateSkyNoiseDegradation(degradation);
        }
      }
    }
  }

  /** Check and update which weather events are active */
  private updateWeatherEventStates_(elapsedSeconds: number): void {
    for (const event of this.weatherEvents_) {
      if (event.isAwaitingAnchor) {
        continue;
      }
      const wasActive = event.isActive;
      const shouldBeActive = elapsedSeconds >= event.startTime && elapsedSeconds < event.startTime + event.duration;

      if (shouldBeActive && !wasActive) {
        event.isActive = true;
        EventBus.getInstance().emit(Events.WEATHER_EVENT_STARTED, event);
      } else if (!shouldBeActive && wasActive) {
        event.isActive = false;
        EventBus.getInstance().emit(Events.WEATHER_EVENT_ENDED, event);
      }
    }
  }

  /** Update ice accumulation for all antennas */
  private updateIceAccumulation_(dtSeconds: number): void {
    const sim = SimulationManager.getInstance();

    for (const gs of sim.groundStations) {
      const gsId = gs.state.id;
      const activeIceEvent = this.getActiveIceEvent_(gsId);

      for (const antenna of gs.antennas) {
        const antennaId = antenna.state.uuid;

        if (activeIceEvent && !antenna.state.isHeaterEnabled) {
          // Ice is accumulating - heater OFF during ice/snow weather
          const config = WeatherManager.SEVERITY_CONFIG[activeIceEvent.severity];
          // Ice already on the feed (a scenario's starting state, or what is
          // left after the heater went off again) is where the buildup resumes
          // from, not a clean feed (nats-s20-F7)
          const currentTime = this.iceAccumulationTime_.get(antennaId) || WeatherManager.accumulationTimeForIce_(antenna.state.iceAccumulation_dB, config);
          const newTime = currentTime + dtSeconds;
          this.iceAccumulationTime_.set(antennaId, newTime);

          // Calculate exponential ice buildup
          const iceDegradation = config.maxDegradation_dB * (1 - Math.exp(-newTime / config.timeConstant_s));

          antenna.updateIceAccumulation(iceDegradation);
        } else if (activeIceEvent && antenna.state.isHeaterEnabled && activeIceEvent.heaterMeltDbPerMin !== undefined) {
          // Phase 27 Q5: a storm that outpaces the heater. Snow loads the feed
          // at the unheated rate (the exponential's slope, (max - ice) / tau)
          // and the heater melts what it can; the ice settles where the two
          // balance (max - melt x tau), so the heater buys time, not the link
          const config = WeatherManager.SEVERITY_CONFIG[activeIceEvent.severity];
          const currentIce = antenna.state.iceAccumulation_dB;
          const loadDbPerS = (config.maxDegradation_dB - currentIce) / config.timeConstant_s;
          const meltDbPerS = activeIceEvent.heaterMeltDbPerMin / 60;
          const newIce = Math.min(config.maxDegradation_dB, Math.max(0, currentIce + (loadDbPerS - meltDbPerS) * dtSeconds));

          if (newIce !== currentIce) {
            antenna.updateIceAccumulation(newIce);
          }
          // Where an unheated buildup would resume if the heater goes off
          this.iceAccumulationTime_.set(antennaId, WeatherManager.accumulationTimeForIce_(newIce, config));
        } else if (antenna.state.isHeaterEnabled && antenna.state.iceAccumulation_dB > 0) {
          // Ice is melting - heater ON
          const currentIce = antenna.state.iceAccumulation_dB;
          const meltAmount = WeatherManager.MELT_RATE_DB_PER_SECOND * dtSeconds;
          const newIce = Math.max(0, currentIce - meltAmount);

          antenna.updateIceAccumulation(newIce);

          // Reset accumulation time proportionally
          if (newIce === 0) {
            this.iceAccumulationTime_.set(antennaId, 0);
          } else if (activeIceEvent) {
            // Recalculate accumulation time from current ice level
            const config = WeatherManager.SEVERITY_CONFIG[activeIceEvent.severity];
            const ratio = newIce / config.maxDegradation_dB;
            // ice = max * (1 - e^(-t/tau)) => t = -tau * ln(1 - ice/max)
            if (ratio < 1) {
              const newTime = -config.timeConstant_s * Math.log(1 - ratio);
              this.iceAccumulationTime_.set(antennaId, Math.max(0, newTime));
            }
          }
        } else if (!activeIceEvent && antenna.state.iceAccumulation_dB === 0) {
          // No weather, no ice - reset accumulation time
          this.iceAccumulationTime_.set(antennaId, 0);
        }
      }
    }
  }

  /** Time into an exponential buildup that has reached `iceDb`: ice = max (1 - e^(-t/tau)) => t = -tau ln(1 - ice/max) */
  private static accumulationTimeForIce_(iceDb: number, config: IceAccumulationConfig): number {
    if (!(iceDb > 0)) {
      return 0;
    }
    const ratio = Math.min(0.999, iceDb / config.maxDegradation_dB);

    return -config.timeConstant_s * Math.log(1 - ratio);
  }

  /** Get active ice-producing weather event for a ground station */
  private getActiveIceEvent_(groundStationId: string): WeatherEventRuntime | null {
    return this.weatherEvents_.find((e) => e.groundStationId === groundStationId && e.isActive && (e.type === 'snow' || e.type === 'ice' || e.type === 'hail')) ?? null;
  }

  /**
   * Whether a weather event has run its course: started (anchored, if it
   * waits on an objective) and past startTime + duration on the mission
   * clock. Unknown ids never end. Backs the weather-event-ended condition.
   */
  hasEventEnded(eventId: string): boolean {
    const event = this.weatherEvents_.find((e) => e.id === eventId);
    if (!event || event.isAwaitingAnchor) {
      return false;
    }

    return this.getElapsedMissionTime() >= event.startTime + event.duration;
  }

  /**
   * Seconds of mission time until the event has run its course (0 once it
   * has), or null when that is not known yet (unknown id, or still waiting on
   * its anchor objective). An objective time skip reads it to stop at the end
   * of the weather (Phase 28 D1).
   */
  getSecondsUntilEventEnds(eventId: string): number | null {
    const event = this.weatherEvents_.find((e) => e.id === eventId);
    if (!event || event.isAwaitingAnchor) {
      return null;
    }

    return Math.max(0, event.startTime + event.duration - this.getElapsedMissionTime());
  }

  /**
   * Mission-elapsed second at which an event's degradation is at its maximum
   * and starts to fall (Phase 29 D10): the midpoint of a sun transit (its
   * sin^2 profile), the start of the ramp-down for rain, storm and wind
   * (their plateau ends there), and the end of anything else (ice and snow
   * build for as long as the event runs).
   */
  static peakSeconds(event: WeatherEventRuntime): number {
    if (event.type === 'sun-transit') {
      return event.startTime + event.duration / 2;
    }
    if (event.type === 'rain' || event.type === 'storm' || event.type === 'wind') {
      const rampS = Math.min(WeatherManager.RAIN_RAMP_MAX_S, event.duration * WeatherManager.RAIN_RAMP_FRACTION);
      return event.startTime + event.duration - rampS;
    }

    return event.startTime + event.duration;
  }

  /**
   * Seconds of mission time until the event is `pastPeakSeconds` beyond its
   * peak (0 once it is), or null when that is not known yet (unknown id, or
   * still waiting on its anchor objective). Backs weather-event-peaked.
   */
  getSecondsUntilEventPeaks(eventId: string, pastPeakSeconds = 0): number | null {
    const event = this.weatherEvents_.find((e) => e.id === eventId);
    if (!event || event.isAwaitingAnchor) {
      return null;
    }

    return Math.max(0, WeatherManager.peakSeconds(event) + pastPeakSeconds - this.getElapsedMissionTime());
  }

  /** Whether the event's degradation has passed its maximum (plus pastPeakSeconds) */
  hasEventPeaked(eventId: string, pastPeakSeconds = 0): boolean {
    return this.getSecondsUntilEventPeaks(eventId, pastPeakSeconds) === 0;
  }

  /**
   * An objective time skip (Phase 27 Q4) moved the clocks by `seconds` in one
   * jump. Event windows follow the mission clock on their own; ice is
   * integrated per update, so give it the skipped time here or a skipped wait
   * would neither build nor melt any.
   */
  applyTimeSkip(seconds: number): void {
    if (!(seconds > 0)) {
      return;
    }
    const elapsedSeconds = this.getElapsedMissionTime();
    this.anchorEvents_(elapsedSeconds);
    this.updateWeatherEventStates_(elapsedSeconds);
    this.updateIceAccumulation_(seconds);
  }

  /** Get all active weather events for a ground station */
  getActiveWeatherEvents(groundStationId: string): WeatherEventRuntime[] {
    return this.weatherEvents_.filter((e) => e.groundStationId === groundStationId && e.isActive);
  }

  /** Check if precipitation is currently active at a ground station */
  isPrecipitationActive(groundStationId: string): boolean {
    return this.weatherEvents_.some((e) => e.groundStationId === groundStationId && e.isActive && ['snow', 'rain', 'hail', 'ice'].includes(e.type));
  }

  /** Get the current ice accumulation time for an antenna */
  getIceAccumulationTime(antennaId: string): number {
    return this.iceAccumulationTime_.get(antennaId) ?? 0;
  }

  /** Get all weather events (active and inactive) */
  getAllWeatherEvents(): WeatherEventRuntime[] {
    return [...this.weatherEvents_];
  }
}
