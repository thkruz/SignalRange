import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import type { AntennaState } from '@app/equipment/antenna';
import { type AntennaConfigId, AntennaRegistry } from '@app/equipment/antenna/antenna-registry';
import type { ScenarioData } from '@app/ScenarioData';
import type { SimulationSettings } from '@app/scenario-manager';
import type { Degrees } from 'ootk';

/** What the operator chose for one ground station (by index in settings.groundStations). */
export interface StationLoadout {
  antenna?: AntennaConfigId;
}

/** A loadout for one sandbox scenario, keyed by station index. */
export interface SandboxLoadout {
  stations: Record<number, StationLoadout>;
}

/**
 * Remembers which equipment a sandbox scenario should start with.
 *
 * Scenarios carry hard-coded equipment; sandboxes (missionType 'Sandbox') may
 * override it. The choice lives in localStorage per scenario, a `?antenna=`
 * query parameter overrides it for one launch (e2e specs and the plugin dev
 * harness use this), and `applyToScenario()` produces the settings the pages
 * actually build from. Non-sandbox scenarios pass through untouched.
 */
export class SandboxLoadoutService {
  static readonly STORAGE_PREFIX = 'sandbox-loadout:';
  static readonly URL_PARAM = 'antenna';
  private static instance_: SandboxLoadoutService | null = null;

  private constructor() {}

  static getInstance(): SandboxLoadoutService {
    SandboxLoadoutService.instance_ ??= new SandboxLoadoutService();

    return SandboxLoadoutService.instance_;
  }

  /** Test seam. */
  static destroy(): void {
    SandboxLoadoutService.instance_ = null;
  }

  static isSandboxScenario(scenario: Pick<ScenarioData, 'missionType'>): boolean {
    return scenario.missionType === 'Sandbox';
  }

  private static storageKey_(scenarioId: string): string {
    return `${SandboxLoadoutService.STORAGE_PREFIX}${scenarioId}`;
  }

  /** The stored loadout for a scenario, or null. */
  get(scenarioId: string): SandboxLoadout | null {
    try {
      const raw = globalThis.localStorage?.getItem(SandboxLoadoutService.storageKey_(scenarioId));

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<SandboxLoadout>;

      return parsed && typeof parsed === 'object' && parsed.stations && typeof parsed.stations === 'object' ? { stations: parsed.stations } : null;
    } catch {
      return null;
    }
  }

  set(scenarioId: string, loadout: SandboxLoadout): void {
    try {
      globalThis.localStorage?.setItem(SandboxLoadoutService.storageKey_(scenarioId), JSON.stringify(loadout));
    } catch {
      // Storage unavailable; the choice still applies for this navigation via resolve().
    }
  }

  clear(scenarioId: string): void {
    try {
      globalThis.localStorage?.removeItem(SandboxLoadoutService.storageKey_(scenarioId));
    } catch {
      // Nothing to clear.
    }
  }

  /**
   * `?antenna=<id>` targets station 0; `?antenna.2=<id>` targets station 2.
   * Ids are validated against the registry so a typo cannot reach the ctor.
   */
  readUrlOverride(search: string = globalThis.location?.search ?? ''): SandboxLoadout | null {
    if (!search) {
      return null;
    }

    const params = new URLSearchParams(search);
    const stations: Record<number, StationLoadout> = {};

    for (const [key, value] of params) {
      const match = /^antenna(?:\.(\d+))?$/u.exec(key);

      if (!match || !value) {
        continue;
      }

      if (!AntennaRegistry.getInstance().has(value)) {
        console.warn(`[loadout] ignoring ?${key}=${value}: unknown antenna config`);
        continue;
      }

      const index = match[1] ? Number.parseInt(match[1], 10) : 0;

      stations[index] = { ...stations[index], antenna: value };
    }

    return Object.keys(stations).length > 0 ? { stations } : null;
  }

  /** Stored loadout merged with the URL override (URL wins per station). */
  resolve(scenarioId: string): SandboxLoadout | null {
    const stored = this.get(scenarioId);
    const fromUrl = this.readUrlOverride();

    if (!stored && !fromUrl) {
      return null;
    }

    const stations: Record<number, StationLoadout> = { ...stored?.stations };

    for (const [index, station] of Object.entries(fromUrl?.stations ?? {})) {
      const i = Number.parseInt(index, 10);

      stations[i] = { ...stations[i], ...station };
    }

    return { stations };
  }

  /**
   * Settings the page should build from. Returns the scenario's own settings
   * object (same identity) unless this is a sandbox with an effective loadout,
   * in which case the affected ground stations are cloned and overridden.
   */
  applyToScenario(scenario: ScenarioData): SimulationSettings {
    if (!SandboxLoadoutService.isSandboxScenario(scenario)) {
      return scenario.settings;
    }

    const loadout = this.resolve(scenario.id);

    if (!loadout) {
      return scenario.settings;
    }

    return SandboxLoadoutService.applyToSettings(scenario.settings, loadout);
  }

  static applyToSettings(settings: SimulationSettings, loadout: SandboxLoadout): SimulationSettings {
    const registry = AntennaRegistry.getInstance();
    let changed = false;

    const groundStations = settings.groundStations.map((station, index) => {
      const choice = loadout.stations[index];

      if (!choice?.antenna || !registry.has(choice.antenna)) {
        return station;
      }

      const currentId = station.antennaConfigKey ?? station.antennas[0];

      if (currentId === choice.antenna) {
        return station;
      }

      changed = true;

      return SandboxLoadoutService.applyAntenna_(station, choice.antenna);
    });

    return changed ? { ...settings, groundStations } : settings;
  }

  private static applyAntenna_(station: GroundStationConfig, antennaId: AntennaConfigId): GroundStationConfig {
    const config = AntennaRegistry.getInstance().get(antennaId);
    const antennas = [...station.antennas];

    antennas[0] = antennaId;

    const antennasState = [...(station.antennasState ?? [])];
    const [minEl, maxEl] = config.elRange_deg ?? [0, 90];
    const [minAz, maxAz] = config.azContinuous ? [-Infinity, Infinity] : (config.azRange_deg ?? [-180, 540]);
    const original = antennasState[0] ?? {};
    const clamp = (value: number | undefined, lo: number, hi: number, fallback: number): number => {
      const v = value ?? fallback;

      return Math.min(hi, Math.max(lo, v));
    };
    const next: Partial<AntennaState> = {
      ...original,
      // A different reflector may not reach the old pointing; clamp rather
      // than boot into an alarm.
      azimuth: clamp(original.azimuth, minAz, maxAz, 180) as Degrees,
      elevation: clamp(original.elevation, minEl, maxEl, Math.max(minEl, 30)) as Degrees,
      // Any lock the scenario authored was against the old antenna.
      isLocked: false,
      isBeaconLocked: false,
      isSlewing: false,
    };

    antennasState[0] = next;

    return { ...station, antennas, antennaConfigKey: antennaId, antennasState };
  }
}
