/**
 * @file physical-plant-service - Scenario-lifetime owner of the physical plant
 * @description Same lifecycle shape as HardwareFaultManager: base-page creates it
 * when `settings.physicalPlant` is set, the page teardown destroys it, and UI
 * reads the manager through `getInstance().plant`. It wires the Core manager to
 * the app: scenario time (SimClock) for `now`/`skip`, seeded `Rng` streams,
 * wind and rain from the WeatherManager events (plus a trainer weather
 * override), and the engine bridge. Time is driven from the scenario clock, so
 * a verb's skip and an operator time skip both advance the plant exactly once.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { ScenarioManager } from '@app/scenario-manager';
import { Rng } from '@app/simulation/rng';
import { SimClock } from '@app/simulation/sim-clock';
import { WeatherManager } from '@app/weather/weather-manager';
import { PhysicalPlantManager } from './physical-plant-manager';
import type { PlantEnvironment, PlantState } from './physical-plant-types';
import { setActivePlant } from './plant-bridge';
import { PlantSoundController } from './plant-sound-controller';

const DEFAULT_AMBIENT_C = 15;

export class PhysicalPlantService {
  private static instance_: PhysicalPlantService | null = null;

  readonly plant: PhysicalPlantManager;
  private weatherOverride_: Partial<PlantEnvironment> = {};
  private lastSyncS_: number;
  private readonly boundUpdateHandler_: () => void;
  private readonly sounds_: PlantSoundController;

  private constructor() {
    const config = ScenarioManager.getInstance().settings.physicalPlant;
    if (!config) {
      throw new Error('PhysicalPlantService needs settings.physicalPlant');
    }
    this.lastSyncS_ = SimClock.scenarioElapsedMs() / 1000;
    this.plant = new PhysicalPlantManager(config, {
      now: () => SimClock.scenarioElapsedMs() / 1000,
      skip: (seconds) => {
        SimClock.skip(seconds * 1000);
        this.sync_();
      },
      env: () => this.environment_(config.stationId),
      rng: (name) => Rng.stream(name),
      setWeather: (weather) => {
        this.weatherOverride_ = { ...this.weatherOverride_, ...weather };
      },
    });
    setActivePlant(this.plant);
    this.sounds_ = new PlantSoundController(this.plant);
    this.boundUpdateHandler_ = this.sync_.bind(this);
    EventBus.getInstance().on(Events.UPDATE, this.boundUpdateHandler_);
  }

  static getInstance(): PhysicalPlantService {
    this.instance_ ??= new PhysicalPlantService();

    return this.instance_;
  }

  /** The Site tab tells the sandbox whether it is on screen (the tent bed plays only then) */
  static setSiteTabShown(shown: boolean): void {
    this.instance_?.sounds_.setSiteTabShown(shown);
  }

  static isInitialized(): boolean {
    return this.instance_ !== null;
  }

  /** The manager, or null when this scenario has no plant (never creates one) */
  static plantOrNull(): PhysicalPlantManager | null {
    return this.instance_?.plant ?? null;
  }

  static destroy(): void {
    if (this.instance_) {
      EventBus.getInstance().off(Events.UPDATE, this.instance_.boundUpdateHandler_);
      this.instance_.sounds_.dispose();
      setActivePlant(null);
      this.instance_ = null;
    }
  }

  getState(): PlantState & { weather: Partial<PlantEnvironment> } {
    return { ...this.plant.getState(), weather: { ...this.weatherOverride_ } };
  }

  restoreState(state: (PlantState & { weather?: Partial<PlantEnvironment> }) | undefined): void {
    if (!state) {
      return;
    }
    this.weatherOverride_ = { ...state.weather };
    this.plant.restoreState(state);
    this.lastSyncS_ = SimClock.scenarioElapsedMs() / 1000;
  }

  /** Feed the plant the scenario seconds that passed since the last sync (ticks, verb skips and operator skips alike) */
  private sync_(): void {
    const nowS = SimClock.scenarioElapsedMs() / 1000;
    const dt = nowS - this.lastSyncS_;
    this.lastSyncS_ = nowS;
    if (dt > 0) {
      this.plant.update(dt);
    }
    this.sounds_.refresh();
  }

  private environment_(stationId: string | undefined): PlantEnvironment {
    let windMps = 0;
    let rainMmH = 0;
    if (stationId && WeatherManager.hasInstance()) {
      const weather = WeatherManager.getInstance();
      const elapsedS = weather.getElapsedMissionTime();
      for (const event of weather.getActiveWeatherEvents(stationId)) {
        windMps = Math.max(windMps, WeatherManager.windSpeedAt(event, elapsedS));
        rainMmH = Math.max(rainMmH, WeatherManager.rainRateAt(event, elapsedS));
      }
    }

    return {
      windMps: this.weatherOverride_.windMps ?? windMps,
      rainMmH: this.weatherOverride_.rainMmH ?? rainMmH,
      ambientC: this.weatherOverride_.ambientC ?? DEFAULT_AMBIENT_C,
      snow: this.weatherOverride_.snow ?? false,
    };
  }
}
