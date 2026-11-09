import type { GroundStation } from '@app/assets/ground-station/ground-station';

/**
 * Lifecycle of a Mission Control antenna page. Same contract ACUControlTab
 * satisfies: `activate` shows it, `deactivate` hides it, `dispose` tears down
 * listeners and DOM. `dom` is the root element (null until rendered); the
 * canvas uses it to detect that its content was replaced and rebuild the page.
 */
export interface AntennaPage {
  /** Tab label shown in the Mission Control tab strip. */
  readonly tabLabel: string;
  readonly dom: HTMLElement | null;
  activate(): void;
  deactivate(): void;
  dispose(): void;
}

/** Builds the page for one antenna of one ground station. Renders into `containerId`. */
export type AntennaPageFactory = (groundStation: GroundStation, containerId: string, antennaIndex: number) => AntennaPage;

export interface RegisterAntennaPageOptions {
  /**
   * Tab label used when the tab strip is drawn, before any page exists.
   * Defaults to 'Antenna'. Pages report the same label via `tabLabel`.
   */
  tabLabel?: string;
}

/** Builds a station-level tab page (not tied to one antenna). Renders into `containerId`. */
export type StationTabFactory = (groundStation: GroundStation, containerId: string) => AntennaPage;

export interface StationTabRegistration {
  /** Unique id; the tab strip id is `station-<id>`. */
  id: string;
  /** Tab label shown in the tab strip. */
  label: string;
  /** Station classes (`GroundStationConfig.stationClass`, e.g. 'field') that show this tab. */
  stationClasses: string[];
  factory: StationTabFactory;
  /** Open this tab first when the station is selected. */
  isDefault?: boolean;
}

/** Tab strip id of a registered station tab. */
export const STATION_TAB_PREFIX = 'station-';

interface AntennaPageEntry {
  kind: string;
  factory: AntennaPageFactory;
  tabLabel: string;
}

/** Antenna kind used when `AntennaConfig.kind` is omitted. Served by ACUControlTab. */
export const DEFAULT_ANTENNA_KIND = 'reflector';

/**
 * Registry of custom Mission Control antenna pages, keyed by `AntennaConfig.kind`.
 * A kind with no entry (every built-in, 'reflector') falls back to ACU Control.
 */
export class AntennaPageRegistry {
  private static instance_: AntennaPageRegistry | null = null;
  private readonly entries_ = new Map<string, AntennaPageEntry>();
  private readonly stationTabs_ = new Map<string, StationTabRegistration>();

  static getInstance(): AntennaPageRegistry {
    AntennaPageRegistry.instance_ ??= new AntennaPageRegistry();

    return AntennaPageRegistry.instance_;
  }

  /** Test seam: drop every registration. */
  static destroy(): void {
    AntennaPageRegistry.instance_ = null;
  }

  /** Register (or replace, for hot reload) the page for an antenna kind. */
  register(kind: string, factory: AntennaPageFactory, options: RegisterAntennaPageOptions = {}): void {
    if (!kind || kind === DEFAULT_ANTENNA_KIND) {
      throw new Error(`Antenna page kind "${kind}" is reserved or empty`);
    }
    this.entries_.set(kind, { kind, factory, tabLabel: options.tabLabel ?? 'Antenna' });
  }

  unregister(kind: string): boolean {
    return this.entries_.delete(kind);
  }

  has(kind: string | undefined): boolean {
    return kind !== undefined && this.entries_.has(kind);
  }

  /** Register (or replace, for hot reload) a station-level tab for the listed station classes. */
  registerStationTab(registration: StationTabRegistration): void {
    if (!registration.id || !registration.label || registration.stationClasses.length === 0) {
      throw new Error(`Station tab "${registration.id}" needs an id, a label and at least one station class`);
    }
    this.stationTabs_.set(registration.id, { ...registration, stationClasses: [...registration.stationClasses] });
  }

  unregisterStationTab(id: string): boolean {
    return this.stationTabs_.delete(id);
  }

  /** Station tabs registered for a station class, in registration order. */
  stationTabsFor(stationClass: string | undefined): StationTabRegistration[] {
    if (stationClass === undefined) {
      return [];
    }

    return [...this.stationTabs_.values()].filter((tab) => tab.stationClasses.includes(stationClass));
  }

  /** A station tab by its tab-strip id (`station-<id>`), or undefined. */
  stationTabByTabId(tabId: string): StationTabRegistration | undefined {
    return tabId.startsWith(STATION_TAB_PREFIX) ? this.stationTabs_.get(tabId.slice(STATION_TAB_PREFIX.length)) : undefined;
  }

  /** Factory for a kind, or undefined (use ACU Control). */
  get(kind: string | undefined): AntennaPageFactory | undefined {
    return kind === undefined ? undefined : this.entries_.get(kind)?.factory;
  }

  /** Tab label for a kind, or undefined (use the ACU label). */
  tabLabel(kind: string | undefined): string | undefined {
    return kind === undefined ? undefined : this.entries_.get(kind)?.tabLabel;
  }
}

/** The slice of the registry exposed to plugins as `api.missionControl`. */
export interface MissionControlApi {
  /**
   * Replace ACU Control with a custom page for every antenna whose config has
   * this `kind`. 'reflector' (the default kind) is reserved.
   */
  registerAntennaPage(kind: string, factory: AntennaPageFactory, options?: RegisterAntennaPageOptions): void;
  unregisterAntennaPage(kind: string): boolean;
  /**
   * Add a tab to every station of the listed classes (e.g. 'field' for
   * Campaign 6 stations, where the professional tabs are hidden).
   */
  registerStationTab(registration: StationTabRegistration): void;
  unregisterStationTab(id: string): boolean;
}

export function createMissionControlApi(registry: AntennaPageRegistry = AntennaPageRegistry.getInstance()): MissionControlApi {
  return {
    registerAntennaPage: (kind, factory, options) => registry.register(kind, factory, options),
    unregisterAntennaPage: (kind) => registry.unregister(kind),
    registerStationTab: (registration) => registry.registerStationTab(registration),
    unregisterStationTab: (id) => registry.unregisterStationTab(id),
  };
}
