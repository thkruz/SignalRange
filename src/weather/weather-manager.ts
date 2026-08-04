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
    minor: { maxDegradation_dB: 2, timeConstant_s: 2400 },    // 40 min to ~63%
    moderate: { maxDegradation_dB: 5, timeConstant_s: 1200 }, // 20 min to ~63%
    severe: { maxDegradation_dB: 10, timeConstant_s: 720 },   // 12 min to ~63%
  };

  /** Melt rate when heater is ON: 1 dB per minute */
  static readonly MELT_RATE_DB_PER_SECOND = 1 / 60;

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

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_ = null;
    }
  }

  /** Load weather events from current scenario */
  private loadWeatherEvents_(): void {
    const events = ScenarioManager.getInstance().settings.weatherEvents ?? [];
    this.weatherEvents_ = events.map(e => ({
      ...e,
      isActive: false,
    }));
  }

  /** Get elapsed mission time in seconds */
  getElapsedMissionTime(): number {
    return (missionNowMs() - this.missionStartTime_) / 1000;
  }

  /** Main update loop - called on each simulation tick */
  private update_(dt: Milliseconds): void {
    const elapsedSeconds = this.getElapsedMissionTime();
    const dtSeconds = dt / 1000;

    // Update weather event active states
    this.updateWeatherEventStates_(elapsedSeconds);

    // Update ice accumulation for all antennas
    this.updateIceAccumulation_(dtSeconds);

    // Update sun-transit sky-noise degradation for all antennas
    this.updateSunTransit_(elapsedSeconds);
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
      const sunEvent = this.weatherEvents_.find(e =>
        e.groundStationId === gs.state.id &&
        e.type === 'sun-transit' &&
        e.isActive
      );

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
      const wasActive = event.isActive;
      const shouldBeActive = elapsedSeconds >= event.startTime &&
        elapsedSeconds < (event.startTime + event.duration);

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
          const iceDegradation = config.maxDegradation_dB *
            (1 - Math.exp(-newTime / config.timeConstant_s));

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
    return this.weatherEvents_.find(e =>
      e.groundStationId === groundStationId &&
      e.isActive &&
      (e.type === 'snow' || e.type === 'ice' || e.type === 'hail')
    ) ?? null;
  }

  /** Get all active weather events for a ground station */
  getActiveWeatherEvents(groundStationId: string): WeatherEventRuntime[] {
    return this.weatherEvents_.filter(e =>
      e.groundStationId === groundStationId && e.isActive
    );
  }

  /** Check if precipitation is currently active at a ground station */
  isPrecipitationActive(groundStationId: string): boolean {
    return this.weatherEvents_.some(e =>
      e.groundStationId === groundStationId &&
      e.isActive &&
      ['snow', 'rain', 'hail', 'ice'].includes(e.type)
    );
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
