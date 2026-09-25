/**
 * @file WeatherManager - Manages weather events and ice accumulation on antennas
 * @description Processes weather events from scenario data, tracks ice buildup
 * on antenna feed horns when heaters are off, and emits weather-related events.
 */

import { EventBus } from '@app/events/event-bus';
import { Events, WeatherEventData } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { missionNowMs } from '@app/simulation/mission-clock';
import { SimulationManager } from '@app/simulation/simulation-manager';
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

  /** Load weather events from current scenario */
  private loadWeatherEvents_(): void {
    const events = ScenarioManager.getInstance().settings.weatherEvents ?? [];
    this.weatherEvents_ = events.map((e) => ({
      ...e,
      isActive: false,
      isAwaitingAnchor: e.startAfterObjectiveId !== undefined,
    }));
  }

  /**
   * Start the clock on events anchored to an objective once it is active.
   * Polled rather than driven by OBJECTIVE_ACTIVATED: checkpoint restore sets
   * objective state without emitting it, and the first objective activates
   * before this manager exists. A restored-complete anchor also counts, so a
   * refresh past the anchor still gets its event.
   */
  private anchorEvents_(elapsedSeconds: number): void {
    const objectivesManager = SimulationManager.getInstance().objectivesManager;

    for (const event of this.weatherEvents_) {
      if (!event.isAwaitingAnchor || !event.startAfterObjectiveId) {
        continue;
      }
      const anchor = objectivesManager?.getObjectiveState(event.startAfterObjectiveId);
      if (anchor?.isActive || anchor?.isCompleted) {
        event.startTime = elapsedSeconds + event.startTime;
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
    const dtSeconds = dt / 1000;

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
   * linkMarginDegradation (peak dB). Degradation is RX-only and clears
   * automatically when the event ends - there is no operator mitigation, by
   * design: the training point is to anticipate, ride through, and document.
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
          const currentTime = this.iceAccumulationTime_.get(antennaId) ?? 0;
          const newTime = currentTime + dtSeconds;
          this.iceAccumulationTime_.set(antennaId, newTime);

          // Calculate exponential ice buildup
          const config = WeatherManager.SEVERITY_CONFIG[activeIceEvent.severity];
          const iceDegradation = config.maxDegradation_dB * (1 - Math.exp(-newTime / config.timeConstant_s));

          antenna.updateIceAccumulation(iceDegradation);
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

  /** Get active ice-producing weather event for a ground station */
  private getActiveIceEvent_(groundStationId: string): WeatherEventRuntime | null {
    return this.weatherEvents_.find((e) => e.groundStationId === groundStationId && e.isActive && (e.type === 'snow' || e.type === 'ice' || e.type === 'hail')) ?? null;
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
