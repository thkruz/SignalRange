/**
 * @file PhysicalPlantManager - Power, cabling and fault model for the C6 physical layer
 * @description Pure Core class (no DOM, no engine singletons). The host drives
 * it with `update(dtSeconds)` and reads a handful of neutral-by-default
 * outputs: pre/post-LNA loss, part power, link dropouts, SkyLink dish status.
 *
 * Model in one paragraph: the plant is a set of parts, cables and connectors.
 * Everything that can go wrong is a `PlantFault` (authored state is converted
 * to faults at construction, so there is one mechanism). A fault's effect
 * applies while its trigger holds; a few kinds are intermittent and drop the
 * link for a few seconds at a probability driven by the trigger strength,
 * drawn from the injected Rng stream `plant:<faultId>`. Power flows
 * generator -> battery -> consumer parts; voltage sags with load, a brownout
 * (below 80 percent) cuts the part, and a part that regains supply boots for a
 * while before it counts as powered. Operator verbs advance the sim through the
 * injected `skip`, log themselves, and open or close outdoor trips.
 *
 * Neutral contract: with no active fault, preLnaLossDb/postLnaLossDb are 0,
 * isPartPowered is true, isLinkDropped is false and skylinkStatus is 'online'.
 */

import { fillText, type GenericObsKey, hasObs, OBS_TABLE, type ObsState, type ObsTargetClass, type ObsTemplateVars, pickGeneric, pickObs } from './observation-text';
import {
  type CableState,
  type ConnectorState,
  DEFAULT_PLANT_SPARES,
  type PartModeConfig,
  type PartState,
  type PlantActionListener,
  type PlantCableConfig,
  type PlantConfig,
  type PlantConnectorConfig,
  type PlantDeps,
  type PlantEnvironment,
  type PlantFault,
  type PlantFaultKind,
  type PlantFaultSnapshot,
  type PlantLogEntry,
  type PlantPartConfig,
  type PlantReport,
  type PlantSpares,
  type PlantState,
  type PlantTrigger,
  type PlantVerb,
  type PlantWeather,
  type PowerForecast,
  type PowerReadings,
  type RouterWifi,
  type SkylinkStatus,
  type SleepSchedule,
  type SnowMeltMode,
  type TerminalSettings,
  type VerbResult,
} from './physical-plant-types';
import { DEFAULT_ENGINE_MAP, type EnginePowerRole } from './plant-bridge';
import { type PartClass, type RuleVerb, type TargetLocation, type TargetTraits, verbApplies } from './plant-verb-rules';
import { type ForecastBattery, type ForecastGenerator, type ForecastNode, projectPower } from './power-forecast';

/** Supply ratio below which a part browns out */
const BROWNOUT_RATIO = 0.8;
/** Seconds an intermittent fault drops the link once it fires */
const DROP_SECONDS = 3;
/** Loss added to the RF chain while a dropout is active */
const DROP_LOSS_DB = 40;
const DEFAULT_TRIP_LIMIT = 3;
const THERMAL_HEATING_C = 45;
const THERMAL_SHUTDOWN_C = 55;
/** Boot plus satellite acquisition of a terminal, seconds (D13; same range as `SKYLINK_SKIN.bootAcquisitionS`) */
export const TERMINAL_ACQUIRE_S = { minS: 120, maxS: 300 } as const;
const DEFAULT_BOOT_S: Record<string, number> = { terminal: 90, router: 30, modem: 45 };

/** Extra watts while the snow-melt heater runs (D17: snow melt defaults to automatic; `PlantConfig.snowMelt` overrides) */
const SNOW_MELT_W = 120;
/** Terminal draw while asleep on its power-save schedule */
const SLEEP_W = 5;
/** Heater run time before the snow outlasts it (seconds), by setting */
const MELT_WINDOW_S: Record<SnowMeltMode, number> = { automatic: 600, preheat: 1800, off: 0 };
/** Pre-heat turns the heater on at or below this ambient temperature */
const PREHEAT_BELOW_C = 2;
/** Heater run time (seconds, times fault severity) that melts snow off the dish when power holds */
const MELT_TIME_S = 240;
/** Below this supply voltage ratio the heater is starved: it cannot melt the snow */
const HEATER_MIN_RATIO = 0.9;
/** A starved heater still reads 'heating' this long before the dish reads 'obstructed' */
const STARVED_GRACE_S = 60;
const MELT_WINDOW_KEY = 'skylink-snow-melt';
const SECONDS_PER_DAY = 86400;
const DEFAULT_WIFI: RouterWifi = { ssid: 'SKYLINK-5G', password: 'changeme1' };

const INTERMITTENT_KINDS: ReadonlySet<PlantFaultKind> = new Set(['partial-seat', 'loose-nut', 'cable-pinch']);

/** Steady loss in dB while the fault is effective (times severity where it scales) */
const LOSS_DB: Partial<Record<PlantFaultKind, { db: number; scales: boolean }>> = {
  'partial-seat': { db: 2, scales: false },
  'loose-nut': { db: 2, scales: false },
  unseated: { db: DROP_LOSS_DB, scales: false },
  corrosion: { db: 6, scales: true },
  moisture: { db: 4, scales: true },
  'bent-pin': { db: 8, scales: false },
  'cable-nick': { db: 1.5, scales: true },
  'cable-pinch': { db: 2, scales: false },
  'cable-crush': { db: DROP_LOSS_DB, scales: false },
  'cable-water': { db: 6, scales: true },
};

/** Which fault kinds each fixing verb clears (swap is handled by target type) */
const FIXES: Partial<Record<PlantVerb, readonly PlantFaultKind[]>> = {
  reseat: ['partial-seat', 'unseated'],
  tighten: ['loose-nut'],
  seal: ['moisture'],
  powerCycle: ['generator-sag'],
  clearSnow: ['snow'],
  removeNet: ['net'],
  reroute: ['cable-pinch'],
};

/** Seconds each verb takes on the clock; swap varies by what is swapped */
const VERB_COST_S: Record<PlantVerb, number> = {
  reboot: 10,
  setSnowMelt: 5,
  setSleep: 5,
  inspect: 20,
  wiggle: 15,
  feel: 10,
  multimeter: 30,
  'cable-tester': 45,
  reseat: 60,
  tighten: 30,
  seal: 120,
  swap: 240,
  powerCycle: 20,
  clearSnow: 180,
  removeNet: 240,
  reroute: 300,
  returnInside: 60,
  goOutside: 30,
  refuel: 180,
  setMode: 20,
  spotted: 0,
};
const SWAP_COST_S = { connector: 180, cable: 420, part: 240 };
const FUEL_CAN_KEY = 'fuel-can';
/** Litres in one fuel can */
const FUEL_CAN_L = 5;
/** Below this the tank counts as empty for a refuel */
const REFUEL_NEEDED_BELOW_L = 0.5;
/** Default tank size (L) and the fill fraction above which a refuel is refused for free */
/** GNSS satellites a terminal with a clear view reports */
const GNSS_SATELLITES_NOMINAL = 12;
const DEFAULT_TANK_L = 7;
const TANK_FULL_FRACTION = 0.8;

/** The fact a fault kind exposes when an observation shows it */
const FACT_OF: Partial<Record<PlantFaultKind, string>> = {
  'partial-seat': 'seat',
  'loose-nut': 'seat',
  unseated: 'seat',
  corrosion: 'corrosion',
  moisture: 'moisture',
  'bent-pin': 'bent-pin',
  'cable-nick': 'damage',
  'cable-pinch': 'damage',
  'cable-crush': 'damage',
  'cable-water': 'damage',
  snow: 'snow',
  net: 'net',
};

/**
 * Power-station recharge: a running generator feeds the battery at
 * `CHARGE_FRACTION` of its max output (W). A `battery-depleted` fault clears by
 * itself once the charge reaches `BATTERY_RECOVER_FRACTION` of capacity.
 */
const CHARGE_FRACTION = 0.2;
const BATTERY_RECOVER_FRACTION = 0.1;
const UNKNOWN_COST_S = 0;
const MAX_CHAIN_DEPTH = 16;
/** Meter reading through a half-seated or loose contact, as a fraction of the supply */
const PARTIAL_SEAT_METER_RATIO = 0.93;

/** Verbs that unplug or move something, so what it powers goes down */
const DISRUPTIVE_VERBS: ReadonlySet<PlantVerb> = new Set(['reseat', 'swap', 'powerCycle', 'reroute']);

type TargetType = 'part' | 'cable' | 'connector';

interface Supply {
  /** Electrically supplied (ignores the part's own boot timer) */
  ok: boolean;
  /** Fraction of nominal voltage arriving; 0 when cut */
  ratio: number;
}

interface ActOutcome {
  /** Overrides the default (something was cleared) for the ineffective-action count */
  effective?: boolean;
  observation: string;
  revealed?: string[];
  cleared?: string[];
  /** Facts the observation showed, as `<target>|<fact>` */
  facts?: string[];
}

export class PhysicalPlantManager {
  private readonly config_: PlantConfig;
  private readonly deps_: PlantDeps;
  private readonly parts_ = new Map<string, PlantPartConfig>();
  private readonly cables_ = new Map<string, PlantCableConfig>();
  private readonly connectors_ = new Map<string, PlantConnectorConfig>();
  private readonly tripLimit_: number;
  /** Plant part behind each engine device's powered state (config `engineMap` over the defaults) */
  readonly engineMap: Readonly<Record<EnginePowerRole, string>>;

  private faults_: PlantFaultSnapshot[] = [];
  private sealed_ = new Set<string>();
  private clearedFaultIds_ = new Set<string>();
  private revealedFacts_ = new Set<string>();
  private spares_: PlantSpares = {};
  private trainerSpares_: PlantSpares | null = null;
  private rebootUntilS_ = new Map<string, number>();
  /** Terminal part id -> second its post-boot satellite search ends (D13); service is down until then */
  private searchUntilS_ = new Map<string, number>();
  private terminalSettings_: TerminalSettings;
  /** Generator id -> scenario second its startup ends (output absent until then) */
  private startingUntilS_ = new Map<string, number>();
  /** Part id -> current mode id, for non-generator parts with `modes` */
  private partModes_ = new Map<string, string>();
  /** Generator id -> running flag, seeded from the authored config and never written back to it */
  private running_ = new Map<string, boolean>();
  /** Condition windows (key -> scenario second the window opened); saved in checkpoints, cleared on reset */
  private windows_ = new Map<string, number>();
  private forecastCache_ = new Map<string, PowerForecast>();
  private forecastCacheSig_ = '';
  private supplied_ = new Map<string, boolean>();
  private socWh_ = new Map<string, number>();
  private fuelL_ = new Map<string, number>();
  private solved_ = new Map<string, Supply>();
  private outside_ = false;
  private trips_ = 0;
  private spotted_ = false;
  private sparesUsed_: string[] = [];
  private downtimeS_ = 0;
  /** E6 (D10): sim intervals [startS, endS] the SkyLink terminal was transmitting; never shown in the app */
  private transmit_: { intervals: Array<[number, number]>; baseS: number; lastS: number | null } = { intervals: [], baseS: 0, lastS: null };
  private startS_: number;
  private firstCorrectS_: number | null = null;
  private accS_ = 0;
  private log_: PlantLogEntry[] = [];
  /** Last line returned per target and verb, so the same line never repeats back to back */
  private obsLast_ = new Map<string, string>();
  private readonly actionListeners_: PlantActionListener[] = [];

  constructor(config: PlantConfig, deps: PlantDeps) {
    this.config_ = config;
    this.deps_ = deps;
    this.tripLimit_ = config.tripLimit ?? DEFAULT_TRIP_LIMIT;
    this.engineMap = { ...DEFAULT_ENGINE_MAP, ...config.engineMap };
    this.startS_ = deps.now();
    this.terminalSettings_ = this.defaultTerminalSettings_();
    this.buildFromConfig_();
  }

  /** D17: snow melt starts automatic, as on real terminals; a scenario sets `PlantConfig.snowMelt` to override */
  private defaultTerminalSettings_(): TerminalSettings {
    return { snowMelt: this.config_.snowMelt ?? 'automatic', sleep: null, wifi: { ...DEFAULT_WIFI } };
  }

  /** Trainer reset: back to the authored plant (faults, spares, trips, log, supplies) at the current time */
  reset(): void {
    this.faults_ = [];
    this.sealed_ = new Set();
    this.clearedFaultIds_ = new Set();
    this.revealedFacts_ = new Set();
    this.trainerSpares_ = null;
    this.rebootUntilS_ = new Map();
    this.searchUntilS_ = new Map();
    this.terminalSettings_ = this.defaultTerminalSettings_();
    this.startingUntilS_ = new Map();
    this.partModes_ = new Map();
    this.running_ = new Map();
    this.windows_ = new Map();
    this.forecastCache_ = new Map();
    this.supplied_ = new Map();
    this.socWh_ = new Map();
    this.fuelL_ = new Map();
    this.outside_ = false;
    this.trips_ = 0;
    this.spotted_ = false;
    this.sparesUsed_ = [];
    this.downtimeS_ = 0;
    this.transmit_ = { intervals: [], baseS: 0, lastS: null };
    this.startS_ = this.deps_.now();
    this.firstCorrectS_ = null;
    this.accS_ = 0;
    this.log_ = [];
    this.obsLast_ = new Map();
    this.buildFromConfig_();
  }

  private buildFromConfig_(): void {
    const config = this.config_;
    for (const part of config.parts) {
      this.parts_.set(part.id, part);
      if (part.kind === 'battery') {
        this.socWh_.set(part.id, part.socWh ?? part.capacityWh ?? 0);
      }
      if (part.kind === 'generator') {
        this.fuelL_.set(part.id, part.fuelL ?? 5);
        this.running_.set(part.id, part.running !== false && !(part.modes?.length && part.mode === 'off'));
      } else if (part.modes?.length) {
        this.partModes_.set(part.id, part.mode ?? part.modes[0].id);
      }
    }
    for (const cable of config.cables) {
      this.cables_.set(cable.id, cable);
      if (cable.damage) {
        this.addFault_({
          id: `${cable.id}:damage`,
          target: cable.id,
          kind: `cable-${cable.damage.kind}`,
          atMeters: cable.damage.atM,
        });
      }
    }
    for (const connector of config.connectors) {
      this.connectors_.set(connector.id, connector);
      this.applyAuthoredConnectorState_(connector);
    }
    for (const fault of config.faults ?? []) {
      this.addFault_(fault);
    }

    this.spares_ = config.spares ? { ...config.spares } : this.defaultSpares_();
    this.solve_();
  }

  // ---------------------------------------------------------------- outputs

  /** Loss ahead of the LNA (feed connector etc.) in dB for the station; 0 when healthy */
  preLnaLossDb(stationId: string): number {
    return this.signalLossDb_('pre-lna', stationId);
  }

  /** Loss after the LNA (IF cable and connectors) in dB for the station; 0 when healthy */
  postLnaLossDb(stationId: string): number {
    return this.signalLossDb_('post-lna', stationId);
  }

  /** False while a part has lost supply or is rebooting; true for unknown parts */
  isPartPowered(partId: string): boolean {
    const supply = this.solved_.get(partId);
    if (!supply) {
      return true;
    }

    return supply.ok && !this.isRebooting_(partId);
  }

  /** True while a cable or connector fault on the part's links is cutting the link */
  isLinkDropped(partId: string): boolean {
    for (const rt of this.faults_) {
      if (!this.isCutting_(rt) || !this.linkTouchesPart_(rt.fault.target, partId)) {
        continue;
      }

      return true;
    }

    return false;
  }

  /** The SkyLink dish status; 'online' when there is no terminal or nothing is wrong */
  skylinkStatus(): SkylinkStatus {
    const terminal = this.config_.parts.find((p) => p.kind === 'terminal');
    if (!terminal) {
      return 'online';
    }
    const supply = this.solved_.get(terminal.id);
    const env = this.deps_.env();

    if (supply && !supply.ok) {
      return 'no-power';
    }
    if (env.ambientC >= THERMAL_SHUTDOWN_C) {
      return 'thermal-shutdown';
    }
    if (this.isRebooting_(terminal.id)) {
      return 'booting';
    }
    // Hot ambient throttles the dish before it shuts down (was mislabelled 'heating', which is snow melt)
    if (env.ambientC >= THERMAL_HEATING_C) {
      return 'thermal-throttle';
    }
    if (this.isSleeping()) {
      return 'sleeping';
    }
    // E5 (interim for ootk #58): a denied GNSS fix leaves the dish without a location
    if (this.hasActiveFault_(terminal.id, ['gnss-denied'])) {
      return 'no-location';
    }
    if (this.isSnowMelting()) {
      return 'heating';
    }
    // D13: after the boot the dish searches for a satellite; no service until the search ends
    if (this.isSearching(terminal.id)) {
      return 'searching';
    }
    if (this.hasActiveFault_(terminal.id, ['snow', 'net'])) {
      return 'obstructed';
    }
    // A cut data or power link makes the dish re-acquire
    if (this.isLinkDropped(terminal.id)) {
      return 'booting';
    }

    return 'online';
  }

  /** GNSS state the terminal reports (E5). Denied: no valid location and no satellites. */
  getGnssState(): { locationValid: boolean; satellites: number } {
    const terminal = this.terminalPart_();
    if (terminal && this.hasActiveFault_(terminal.id, ['gnss-denied'])) {
      return { locationValid: false, satellites: 0 };
    }

    return { locationValid: true, satellites: GNSS_SATELLITES_NOMINAL };
  }

  /**
   * What blocks the dish's view of the sky now (E4 input): snow covers the whole sky (unless the heater
   * is melting it); each effective net fault is a partial block, a tree line, by fault id.
   */
  obstructionBlockage(): { wholeSky: boolean; partialIds: string[] } {
    const terminal = this.terminalPart_();
    if (!terminal) {
      return { wholeSky: false, partialIds: [] };
    }
    const partialIds = this.faults_.filter((rt) => rt.fault.target === terminal.id && rt.fault.kind === 'net' && this.isEffective_(rt)).map((rt) => rt.fault.id);

    return { wholeSky: this.hasActiveFault_(terminal.id, ['snow']) && !this.isSnowMelting(), partialIds };
  }

  /** The terminal part (first of kind 'terminal'), or null */
  private terminalPart_(): PlantPartConfig | null {
    return this.config_.parts.find((p) => p.kind === 'terminal') ?? null;
  }

  /** Sim time of day in seconds */
  private timeOfDayS_(): number {
    const tod = this.deps_.timeOfDayS ? this.deps_.timeOfDayS() : this.deps_.now();

    return ((tod % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  }

  /** The app settings of the terminal and router */
  getTerminalSettings(): TerminalSettings {
    const s = this.terminalSettings_;

    return { snowMelt: s.snowMelt, sleep: s.sleep ? { ...s.sleep } : null, wifi: { ...s.wifi } };
  }

  /** True while the power-save window is open (the terminal is asleep and carries no service) */
  isSleeping(): boolean {
    const sleep = this.terminalSettings_.sleep;
    if (!sleep || sleep.startS === sleep.endS || !this.terminalPart_()) {
      return false;
    }
    const tod = this.timeOfDayS_();

    return sleep.startS < sleep.endS ? tod >= sleep.startS && tod < sleep.endS : tod >= sleep.startS || tod < sleep.endS;
  }

  /** True while the dish shows 'heating': the heater is melting snow that is on the dish */
  isSnowMelting(): boolean {
    const terminal = this.terminalPart_();

    if (!terminal || !this.isHeaterOn_() || !this.hasActiveFault_(terminal.id, ['snow'])) {
      return false;
    }
    const since = this.windows_.get(MELT_WINDOW_KEY);

    return !this.isHeaterStarved_(terminal.id) || (since !== undefined && this.deps_.now() - since < STARVED_GRACE_S);
  }

  /** True when the power source cannot supply the heater draw (voltage sagging under it) */
  private isHeaterStarved_(terminalId: string): boolean {
    const supply = this.solved_.get(terminalId);

    return !!supply && supply.ok && supply.ratio < HEATER_MIN_RATIO;
  }

  /** Melts the snow once the heater has run long enough on adequate power (heavier snow takes longer, may outlast the window) */
  private meltSnow_(): void {
    const terminal = this.terminalPart_();
    const since = this.windows_.get(MELT_WINDOW_KEY);
    if (!terminal || since === undefined || !this.isHeaterOn_() || this.isHeaterStarved_(terminal.id)) {
      return;
    }
    const snow = this.faults_.filter((rt) => rt.fault.kind === 'snow' && rt.fault.target === terminal.id && this.exists_(rt));
    const needS = MELT_TIME_S * Math.max(0, ...snow.map((rt) => rt.fault.severity ?? 1));
    if (snow.length > 0 && this.deps_.now() - since >= needS) {
      this.removeFaults_((rt) => snow.includes(rt));
      this.holdWindow(MELT_WINDOW_KEY, false);
    }
  }

  /** True while the heater draws power: a snowed dish (or cold, when pre-heating) inside the heater window */
  private isHeaterOn_(): boolean {
    const terminal = this.terminalPart_();
    const mode = this.terminalSettings_.snowMelt;
    if (!terminal || mode === 'off' || this.isSleeping()) {
      return false;
    }
    const snowed = this.hasActiveFault_(terminal.id, ['snow']);
    const wantsHeat = snowed || (mode === 'preheat' && this.deps_.env().ambientC <= PREHEAT_BELOW_C);
    if (!wantsHeat) {
      return false;
    }
    if (!snowed) {
      return true;
    }
    const since = this.windows_.get(MELT_WINDOW_KEY);

    return since === undefined || this.deps_.now() - since < MELT_WINDOW_S[mode];
  }

  /** Watts added to (or taken from) the terminal's own draw by sleep and snow melt */
  private terminalDeltaW_(part: PlantPartConfig): number {
    if (part.kind !== 'terminal' || part.id !== this.terminalPart_()?.id) {
      return 0;
    }
    if (this.isSleeping()) {
      return SLEEP_W - (part.loadW ?? 0);
    }

    return this.isHeaterOn_() ? SNOW_MELT_W : 0;
  }

  /** Opens or closes the heater window while snow is on the dish; runs each second and after a settings change */
  private trackMeltWindow_(): void {
    const terminal = this.terminalPart_();
    const snowed = !!terminal && this.terminalSettings_.snowMelt !== 'off' && !this.isSleeping() && this.hasActiveFault_(terminal.id, ['snow']);
    this.holdWindow(MELT_WINDOW_KEY, snowed);
  }

  /** True while any generator is running */
  isGeneratorRunning(): boolean {
    for (const part of this.parts_.values()) {
      if (part.kind === 'generator' && this.generatorRunning_(part)) {
        return true;
      }
    }

    return false;
  }

  /** True while a noisy inverter generator is running (RFI flag for the engine) */
  isRfiPresent(): boolean {
    for (const part of this.parts_.values()) {
      if (part.kind !== 'generator' || !this.generatorRunning_(part)) {
        continue;
      }
      if (part.inverterNoise || this.hasActiveFault_(part.id, ['generator-noise'])) {
        return true;
      }
    }

    return false;
  }

  getPartState(partId: string): PartState | null {
    const part = this.parts_.get(partId);
    const supply = this.solved_.get(partId);
    if (!part || !supply) {
      return null;
    }

    return {
      id: part.id,
      kind: part.kind,
      powered: this.isPartPowered(partId),
      rebooting: this.isRebooting_(partId),
      volts: supply.ratio * this.nominalV_(partId),
      socWh: this.socWh_.get(partId),
      fuelL: this.fuelL_.get(partId),
      tankL: part.kind === 'generator' ? (part.tankL ?? DEFAULT_TANK_L) : undefined,
      socPct: this.socPercent_(partId),
      loadW: this.loadOf_(partId, 0),
      lit: this.isPartPowered(partId),
      ...(part.modes?.length ? { mode: this.getPartMode(partId), starting: this.isStarting(partId) } : {}),
    };
  }

  /** Current mode id of a part with `modes` ('off' or 'run' for a generator), else undefined */
  getPartMode(partId: string): string | undefined {
    const part = this.parts_.get(partId);
    if (!part?.modes?.length) {
      return undefined;
    }

    if (part.kind !== 'generator') {
      return this.partModes_.get(partId) ?? part.mode ?? part.modes[0].id;
    }

    return this.isRunning_(part.id) ? 'run' : 'off';
  }

  /** The mode a UI toggle would switch to: off/run for a generator, else the next authored mode */
  getNextMode(partId: string): string {
    const part = this.parts_.get(partId);
    const current = this.getPartMode(partId);
    if (!part?.modes?.length || current === undefined) {
      return 'off';
    }
    if (part.kind === 'generator') {
      return current === 'off' ? 'run' : 'off';
    }
    const index = part.modes.findIndex((m) => m.id === current);

    return part.modes[(index + 1) % part.modes.length].id;
  }

  /** The authored modes of a part (copies), empty when it has none; the power panel builds its selectors from these */
  getModeOptions(partId: string): PartModeConfig[] {
    return (this.parts_.get(partId)?.modes ?? []).map((m) => ({ ...m }));
  }

  /** True when the part has no modes, or its current mode serves traffic (service model, M04) */
  modeServesTraffic(partId: string): boolean {
    const part = this.parts_.get(partId);
    if (!part?.modes?.length) {
      return true;
    }
    const current = this.getPartMode(partId);

    return part.modes.find((m) => m.id === current)?.servesTraffic !== false;
  }

  /** True while a generator is cranking toward 'run' (its supply is absent until the startup ends) */
  isStarting(partId: string): boolean {
    const until = this.startingUntilS_.get(partId);

    return until !== undefined && this.deps_.now() < until;
  }

  /** Volts a healthy reading of this part may show (nominal +- `meter.normalBandPct`), or null without a meter config */
  getMeterBand(partId: string): { minV: number; maxV: number } | null {
    const meter = this.config_.meter;
    if (!meter || !this.parts_.has(partId)) {
      return null;
    }
    const nominal = this.nominalV_(partId);
    const band = (nominal * meter.normalBandPct) / 100;

    return { minV: nominal - band, maxV: nominal + band };
  }

  /** Loop resistance of a cable run in ohms (conductor plus return), from its length */
  getLoopResistanceOhm(cableId: string): number | null {
    const cable = this.cables_.get(cableId);

    return cable ? Math.round(cable.lengthM * (cable.cableType === 'coax' ? 0.04 : 0.036) * 10) / 10 : null;
  }

  getConnectorState(connectorId: string): ConnectorState | null {
    if (!this.connectors_.has(connectorId)) {
      return null;
    }
    const state: ConnectorState = {
      seated: 'full',
      corrosion: 0,
      moisture: 0,
      bentPin: false,
      sealed: this.sealed_.has(connectorId),
    };
    for (const rt of this.faults_) {
      if (rt.fault.target !== connectorId || !this.isEffective_(rt)) {
        continue;
      }
      const severity = rt.fault.severity ?? 1;
      switch (rt.fault.kind) {
        case 'unseated':
          state.seated = 'out';
          break;
        case 'partial-seat':
        case 'loose-nut':
          if (state.seated === 'full') {
            state.seated = 'partial';
          }
          break;
        case 'corrosion':
          state.corrosion = Math.max(state.corrosion, severity);
          break;
        case 'moisture':
          state.moisture = Math.max(state.moisture, severity);
          break;
        case 'bent-pin':
          state.bentPin = true;
          break;
        default:
          break;
      }
    }

    return state;
  }

  getCableState(cableId: string): CableState | null {
    const cable = this.cables_.get(cableId);
    if (!cable) {
      return null;
    }
    for (const rt of this.faults_) {
      if (rt.fault.target !== cableId || !rt.fault.kind.startsWith('cable-') || !this.isEffective_(rt)) {
        continue;
      }

      return {
        lengthM: cable.lengthM,
        damage: {
          kind: rt.fault.kind.slice('cable-'.length) as NonNullable<CableState['damage']>['kind'],
          atM: rt.fault.atMeters ?? cable.lengthM / 2,
        },
      };
    }

    return { lengthM: cable.lengthM };
  }

  getFaults(): PlantFault[] {
    return this.faults_.map((rt) => ({ ...rt.fault }));
  }

  // ------------------------------------------- condition queries (action log)

  /** The player looked at the part by hand (inspect, wiggle or feel) */
  hasInspected(target: string): boolean {
    return this.log_.some((entry) => entry.target === target && (entry.verb === 'inspect' || entry.verb === 'wiggle' || entry.verb === 'feel'));
  }

  /** The player has seen this fact about the target (seat, corrosion, moisture, bent-pin, damage, snow, net) */
  isFactRevealed(target: string, fact: string): boolean {
    return this.revealedFacts_.has(`${target}|${fact}`);
  }

  /** Every revealed `<target>|<fact>` key */
  getRevealedFacts(): string[] {
    return [...this.revealedFacts_];
  }

  /** The player measured the part, optionally with one tool */
  hasMeasured(target: string, tool?: 'multimeter' | 'cable-tester'): boolean {
    return this.log_.some((entry) => entry.target === target && (tool ? entry.verb === tool : entry.verb === 'multimeter' || entry.verb === 'cable-tester'));
  }

  /** The player fitted a spare to the target (a swap with no spare left does not count) */
  hasSwapped(target: string): boolean {
    // A swap with no spare is refused before it is logged, so every swap entry is a real swap
    return this.log_.some((entry) => entry.target === target && entry.verb === 'swap');
  }

  /** The fault existed in this run and is gone now, however it went (fix verb, recharge, trainer) */
  isFaultCleared(faultId: string): boolean {
    return this.clearedFaultIds_.has(faultId) && !this.faults_.some((rt) => rt.fault.id === faultId);
  }

  /** Fix actions that changed nothing so far */
  ineffectiveActionCount(): number {
    return this.log_.filter((entry) => entry.effective === false).length;
  }

  getSpares(): PlantSpares {
    return { ...this.spares_ };
  }

  getLog(): PlantLogEntry[] {
    return this.log_.map((entry) => ({ ...entry }));
  }

  isOutside(): boolean {
    return this.outside_;
  }

  /** 'camp' (tent, trip rule) or 'forward' (one outdoor view, no trips). Absent config = camp. */
  getSiteMode(): 'camp' | 'forward' {
    return this.config_.site?.mode ?? 'camp';
  }

  /** Scenario seconds now (the clock the log stamps use) */
  getTimeSeconds(): number {
    return this.deps_.now();
  }

  /** Outdoor trips allowed before the instructor notices */
  getTripLimit(): number {
    return this.tripLimit_;
  }

  /** Wind, rain and ambient temperature the plant is solving against right now */
  getEnvironment(): PlantEnvironment {
    return { ...this.deps_.env() };
  }

  /** What the painted site shows: snow wins; wet is any rain (no memory of recent rain is modelled) */
  getWeather(): PlantWeather {
    const env = this.deps_.env();
    if (env.snow) {
      return 'snow';
    }

    return env.rainMmH > 0 ? 'wet' : 'clear';
  }

  /** The fault of this kind exists on the target and its trigger holds right now */
  isFaultActive(target: string, kind: PlantFaultKind): boolean {
    return this.hasActiveFault_(target, [kind]);
  }

  /** Subscribe to logged actions (sounds); returns the unsubscribe function */
  onAction(listener: PlantActionListener): () => void {
    this.actionListeners_.push(listener);

    return () => {
      const i = this.actionListeners_.indexOf(listener);
      if (i >= 0) this.actionListeners_.splice(i, 1);
    };
  }

  private notifyAction_(entry: PlantLogEntry, wasOutside: boolean): void {
    for (const listener of [...this.actionListeners_]) listener(entry, wasOutside, this.outside_);
  }

  /** Ids of every part in the plant, in config order */
  getPartIds(): string[] {
    return [...this.parts_.keys()];
  }

  /** Steady draw of a part in watts (0 when unpowered or unknown) */
  getLoadW(partId: string): number {
    const part = this.parts_.get(partId);

    return part && this.isPartPowered(partId) ? this.drawOf_(part) : 0;
  }

  /** What a power-station display shows: stored energy, draws, charge, fuel and modes */
  getPowerReadings(): PowerReadings {
    const socWh: Record<string, number> = {};
    const capacityWh: Record<string, number> = {};
    const loadW: Record<string, number> = {};
    const fuelL: Record<string, number> = {};
    const modes: Record<string, string> = {};
    let chargeW = 0;
    let batteryDraw = 0;
    let generatorDraw = 0;
    for (const part of this.parts_.values()) {
      if (part.kind === 'battery') {
        socWh[part.id] = this.socWh_.get(part.id) ?? 0;
        capacityWh[part.id] = part.capacityWh ?? 0;
        loadW[part.id] = this.loadOf_(part.id, 0);
        batteryDraw += loadW[part.id];
        chargeW += this.chargeInto_(part);
      }
      if (part.kind === 'generator') {
        fuelL[part.id] = this.fuelL_.get(part.id) ?? 0;
        loadW[part.id] = this.loadOf_(part.id, 0);
        generatorDraw += loadW[part.id];
      }
      if (part.modes?.length) {
        modes[part.id] = this.getPartMode(part.id) as string;
      }
    }

    return {
      tS: this.deps_.now(),
      socWh,
      capacityWh,
      loadW,
      totalDrawW: Object.keys(capacityWh).length ? batteryDraw : generatorDraw,
      chargeW,
      fuelL,
      modes,
      reserveWh: this.config_.power?.reserveWh ?? null,
    };
  }

  /**
   * Preview the energy outlook with optional mode changes (part id -> mode id). Steps a copy of
   * the resource drain in pure math; no plant state, clock or random stream is touched.
   * Defaults: the configured planning horizon and basis (3600 s, battery-only without `power`).
   */
  forecast(modeOverrides: Record<string, string> = {}, horizonS?: number): PowerForecast {
    // The projection is 1 Hz math over the whole horizon, so callers that ask every frame get a
    // cached result until the plant second or anything the projection reads changes.
    const sig = this.forecastSignature_();
    if (sig !== this.forecastCacheSig_) {
      this.forecastCache_.clear();
      this.forecastCacheSig_ = sig;
    }
    const key = `${horizonS ?? ''}|${JSON.stringify(Object.entries(modeOverrides).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))}`;
    let result = this.forecastCache_.get(key);
    if (!result) {
      result = this.computeForecast_(modeOverrides, horizonS);
      this.forecastCache_.set(key, result);
    }

    // A copy, so a caller that sorts or edits the result cannot corrupt the cache
    return { ...result, servicesAvailable: [...result.servicesAvailable] };
  }

  /** Everything the projection reads: the plant second, modes, run flags, faults, supplies and start timers */
  private forecastSignature_(): string {
    return JSON.stringify([
      Math.floor(this.deps_.now()),
      [...this.partModes_],
      [...this.running_],
      [...this.startingUntilS_],
      [...this.socWh_],
      [...this.fuelL_],
      this.faults_.map((f) => `${f.fault.id}:${f.fault.kind}`),
      [...this.supplied_],
      this.terminalSettings_,
      this.isSleeping(),
      this.isSnowMelting(),
    ]);
  }

  private computeForecast_(modeOverrides: Record<string, string>, horizonS?: number): PowerForecast {
    const power = this.config_.power;
    const now = this.deps_.now();
    const nodes: ForecastNode[] = [];
    const batteries: ForecastBattery[] = [];
    const generators: ForecastGenerator[] = [];
    let startupCostS = 0;
    for (const part of this.parts_.values()) {
      const override = modeOverrides[part.id];
      const current = this.getPartMode(part.id);
      const known = override !== undefined && !!part.modes?.some((m) => m.id === override);
      const changed = known && override !== current;
      const mode = part.kind !== 'generator' ? part.modes?.find((m) => m.id === (changed ? override : current)) : undefined;
      const untilS = this.startingUntilS_.get(part.id);
      const pending = untilS !== undefined && untilS > now ? untilS - now : 0;
      const startS = changed ? (part.modes?.find((m) => m.id === override)?.startupS ?? 0) : pending;
      if (changed || pending > 0) {
        startupCostS = Math.max(startupCostS, startS + (changed ? VERB_COST_S.setMode : 0));
      }
      const steadyW = Math.max(0, (mode ? mode.loadW : (part.loadW ?? 0)) + this.terminalDeltaW_(part));
      nodes.push({
        id: part.id,
        parentId: part.poweredBy,
        steadyW,
        startupW: mode ? (mode.startupW ?? mode.loadW) : steadyW,
        startRemainingS: part.kind === 'generator' ? 0 : startS,
        ...(mode ? { servesTraffic: mode.servesTraffic !== false } : {}),
      });
      if (part.kind === 'battery') {
        batteries.push({
          id: part.id,
          socWh: this.socWh_.get(part.id) ?? 0,
          capacityWh: part.capacityWh ?? 0,
          chargeW: part.poweredBy ? CHARGE_FRACTION * (part.maxOutputW ?? 500) : 0,
          sourceId: this.generatorAbove_(part),
        });
      }
      if (part.kind === 'generator') {
        generators.push({
          id: part.id,
          running: (known ? override === 'run' : this.isRunning_(part.id)) && !this.hasActiveFault_(part.id, ['out-of-fuel']),
          startRemainingS: changed && override === 'run' ? startS : pending,
          fuelL: this.fuelL_.get(part.id) ?? 0,
          ratedW: part.ratedW ?? 1000,
          burnLPerHour: part.burnLPerHour ?? 1.5,
        });
      }
    }

    return projectPower({
      nodes,
      batteries,
      generators,
      basis: power?.basis ?? 'battery-only',
      horizonS: horizonS ?? power?.planningHorizonS ?? 3600,
      reserveWh: power?.reserveWh ?? null,
      startupCostS,
    });
  }

  /** Nearest generator in a part's supply chain, or null when it has none */
  private generatorAbove_(part: PlantPartConfig): string | null {
    let current = part.poweredBy ? this.parts_.get(part.poweredBy) : undefined;
    for (let depth = 0; current && depth < MAX_CHAIN_DEPTH; depth++) {
      if (current.kind === 'generator') {
        return current.id;
      }
      current = current.poweredBy ? this.parts_.get(current.poweredBy) : undefined;
    }

    return null;
  }

  /** Watts the battery is taking in right now (same rule as the resource drain) */
  private chargeInto_(part: PlantPartConfig): number {
    const upstream = part.poweredBy ? this.solved_.get(part.poweredBy) : undefined;

    return upstream?.ok && !this.feedCut_(part.id) ? CHARGE_FRACTION * (part.maxOutputW ?? 500) : 0;
  }

  getConnectorIds(): string[] {
    return [...this.connectors_.keys()];
  }

  getCableIds(): string[] {
    return [...this.cables_.keys()];
  }

  /** Display label of a part, connector or cable (falls back to the id) */
  getLabel(id: string): string {
    return this.parts_.get(id)?.label ?? this.connectors_.get(id)?.label ?? this.cables_.get(id)?.label ?? id;
  }

  /** The plant configuration this manager was built from (read-only; used to draw path diagrams) */
  getConfig(): PlantConfig {
    return this.config_;
  }

  /** What kind of target this is, for the verb table and the trip rule (null for an unknown id) */
  getTargetTraits(id: string): TargetTraits | null {
    const part = this.parts_.get(id);
    if (part) {
      return { type: 'part', location: this.partLocation_(part), partClass: this.partClass_(part) };
    }
    if (this.cables_.has(id)) {
      return { type: 'cable', location: 'either' };
    }
    const connector = this.connectors_.get(id);
    if (connector) {
      const owner = connector.partId ? this.parts_.get(connector.partId) : undefined;
      const cable = connector.cableId ? this.cables_.get(connector.cableId) : undefined;
      const suppliesPart = [...this.parts_.values()].some((p) => p.viaCable !== undefined && p.viaCable === connector.cableId);

      return {
        type: 'connector',
        location: owner ? this.partLocation_(owner) : 'either',
        feed: connector.feeds !== undefined,
        carriesPower: connector.feeds !== undefined || (cable ? cable.carries.includes('power') || suppliesPart : false),
        threaded: connector.threaded ?? (connector.feeds !== undefined ? false : cable ? cable.cableType === 'coax' : true),
      };
    }

    return null;
  }

  /** Spares left for a swap of this target (0 when unknown) */
  getSwapSpares(id: string): number {
    const type = this.targetType_(id);

    return type ? (this.spares_[this.spareKeyFor_(id, type)] ?? 0) : 0;
  }

  /** True when the verb applies to the target (unknown targets: false) */
  verbApplies(verb: PlantVerb, id: string): boolean {
    const traits = this.getTargetTraits(id);
    if (verb === 'setMode' && !this.parts_.get(id)?.modes?.length) {
      return false;
    }

    return traits !== null && verbApplies(verb, traits);
  }

  private partLocation_(part: PlantPartConfig): TargetLocation {
    if (part.outdoor !== undefined) {
      return part.outdoor ? 'outdoor' : 'indoor';
    }

    return part.kind === 'generator' || part.kind === 'dish' || part.kind === 'terminal' ? 'outdoor' : 'indoor';
  }

  private partClass_(part: PlantPartConfig): PartClass {
    switch (part.kind) {
      case 'strip':
        return 'strip';
      case 'battery':
        return 'power-station';
      case 'generator':
        return 'generator';
      case 'router':
        return 'router';
      case 'modem':
        return 'modem';
      case 'client':
        return 'laptop';
      case 'terminal':
        return 'panel';
      default:
        // A dish fed through a cable (power or DC on the coax) is the LNB; a bare dish is the reflector
        return part.viaCable ? 'lnb' : 'reflector';
    }
  }

  /**
   * E6 (D10): seconds the SkyLink terminal was transmitting inside [fromS, toS] (absolute sim seconds,
   * default: the whole run). Transmitting = powered, booted, not sleeping, not in thermal shutdown, and
   * its status is online, searching, obstructed, heating or thermal-throttle (it has service or is
   * looking for it). Not transmitting: no-power, thermal-shutdown, booting, sleeping, no-location.
   * Time between plant steps (clock skips) is credited to the status seen at the next step.
   */
  getTransmitSeconds(fromS = Number.NEGATIVE_INFINITY, toS = Number.POSITIVE_INFINITY): number {
    let total = fromS === Number.NEGATIVE_INFINITY && toS === Number.POSITIVE_INFINITY ? this.transmit_.baseS : 0;
    for (const [a, b] of this.transmit_.intervals) {
      total += Math.max(0, Math.min(b, toS) - Math.max(a, fromS));
    }

    return total;
  }

  /** True while the terminal is transmitting now (E6 definition above) */
  isTransmitting(): boolean {
    const status = this.skylinkStatus();

    return status === 'online' || status === 'searching' || status === 'obstructed' || status === 'heating' || status === 'thermal-throttle';
  }

  private accrueTransmit_(now: number): void {
    const t = this.transmit_;
    const last = t.lastS ?? now - 1;
    t.lastS = now;
    if (now <= last || !this.config_.parts.some((p) => p.kind === 'terminal') || !this.isTransmitting()) {
      return;
    }
    const tail = t.intervals[t.intervals.length - 1];
    if (tail && tail[1] >= last) {
      tail[1] = now;
    } else {
      t.intervals.push([last, now]);
    }
    if (t.intervals.length > 2000) {
      const [a, b] = t.intervals.shift() as [number, number];
      t.baseS += b - a;
    }
  }

  getReport(): PlantReport {
    return {
      firstCorrectActionS: this.firstCorrectS_ === null ? null : this.firstCorrectS_ - this.startS_,
      trips: this.trips_,
      spotted: this.spotted_,
      sparesUsed: [...this.sparesUsed_],
      downtimeS: this.downtimeS_,
      ineffectiveActions: this.log_.filter((entry) => entry.effective === false).length,
    };
  }

  // ----------------------------------------------------------------- update

  /** Advance the model. Solved at 1 Hz: sub-second deltas accumulate. */
  update(dtSeconds: number): void {
    this.accS_ += dtSeconds;
    while (this.accS_ >= 1) {
      this.accS_ -= 1;
      this.step_();
    }
  }

  // ----------------------------------------------------------------- verbs

  inspect(target: string): VerbResult {
    return this.observe_('inspect', target);
  }

  wiggle(target: string): VerbResult {
    return this.observe_('wiggle', target);
  }

  feel(target: string): VerbResult {
    return this.observe_('feel', target);
  }

  measure(tool: 'multimeter' | 'cable-tester', target: string): VerbResult {
    return this.observe_(tool, target);
  }

  reseat(connectorId: string): VerbResult {
    return this.fix_('reseat', connectorId);
  }

  tighten(connectorId: string): VerbResult {
    return this.fix_('tighten', connectorId);
  }

  seal(connectorId: string): VerbResult {
    return this.fix_('seal', connectorId);
  }

  powerCycle(partId: string): VerbResult {
    return this.fix_('powerCycle', partId);
  }

  clearSnow(partId: string): VerbResult {
    return this.fix_('clearSnow', partId);
  }

  removeNet(partId: string): VerbResult {
    return this.fix_('removeNet', partId);
  }

  reroute(cableId: string): VerbResult {
    return this.fix_('reroute', cableId);
  }

  /** Pour a fuel can into a generator: consumes a `fuel-can` spare and clears `out-of-fuel` */
  refuel(partId: string): VerbResult {
    const part = this.parts_.get(partId);
    if (!part) {
      return this.unknown_();
    }
    if (!this.verbApplies('refuel', partId)) {
      return this.notApplicable_();
    }
    const fuel = this.fuelL_.get(partId) ?? 0;
    const tank = part.tankL ?? DEFAULT_TANK_L;
    const faulted = this.hasActiveFault_(partId, ['out-of-fuel']);
    const empty = fuel < REFUEL_NEEDED_BELOW_L || faulted;
    if (!faulted && fuel >= tank * TANK_FULL_FRACTION) {
      // Visibly full: explain at no cost, nothing is logged or counted
      return { observation: this.line_(partId, 'refuel', 'full'), costSeconds: 0 };
    }
    if (!empty) {
      return this.act_('refuel', partId, VERB_COST_S.refuel, false, () => ({ observation: this.line_(partId, 'refuel', 'not-needed') }), true);
    }
    if ((this.spares_[FUEL_CAN_KEY] ?? 0) <= 0) {
      return this.noSpare_();
    }

    return this.act_(
      'refuel',
      partId,
      VERB_COST_S.refuel,
      false,
      () => {
        this.spares_[FUEL_CAN_KEY] = (this.spares_[FUEL_CAN_KEY] ?? 0) - 1;
        this.sparesUsed_.push(FUEL_CAN_KEY);
        this.fuelL_.set(partId, Math.min(tank, (this.fuelL_.get(partId) ?? 0) + FUEL_CAN_L));
        const cleared = this.removeFaults_((rt) => rt.fault.target === partId && rt.fault.kind === 'out-of-fuel');
        // A restart is a deliberate act: the generator runs again even if it was shut down
        this.running_.set(partId, true);

        return { observation: this.line_(partId, 'refuel', 'cleared'), cleared, effective: true };
      },
      true
    );
  }

  /**
   * Switch a generator with authored modes between 'off' and 'run'. Starting takes the verb's
   * cost plus the mode's `startupS` before any output; with no fuel it does not catch.
   * Parts without `modes` refuse at no cost.
   */
  setPartMode(partId: string, modeId: string): VerbResult {
    const part = this.parts_.get(partId);
    if (!part) {
      return this.unknown_();
    }
    if (!this.verbApplies('setMode', partId)) {
      return this.notApplicable_();
    }
    const mode = part.modes?.find((m) => m.id === modeId);
    if (!mode) {
      return this.notApplicable_();
    }
    if (part.kind !== 'generator') {
      return this.setSimpleMode_(part, mode);
    }
    const stopping = modeId === 'off';
    const noFuel = (this.fuelL_.get(partId) ?? 0) <= 0 || this.hasActiveFault_(partId, ['out-of-fuel']);
    const running = this.isRunning_(partId) && !noFuel;
    if (stopping && !this.isRunning_(partId)) {
      return { observation: this.line_(partId, 'setMode', 'full'), costSeconds: 0 };
    }
    if (!stopping && running) {
      return { observation: this.line_(partId, 'setMode', this.isStarting(partId) ? 'booting' : 'not-needed'), costSeconds: 0 };
    }

    return this.act_(
      'setMode',
      partId,
      VERB_COST_S.setMode,
      false,
      () => {
        if (stopping) {
          this.running_.set(partId, false);
          this.startingUntilS_.delete(partId);

          return { observation: this.line_(partId, 'setMode', 'unpowered') };
        }
        if (noFuel) {
          return { observation: this.line_(partId, 'setMode', 'out-of-fuel') };
        }
        this.running_.set(partId, true);
        this.startingUntilS_.set(partId, this.deps_.now() + VERB_COST_S.setMode + (mode.startupS ?? 0));

        return { observation: this.line_(partId, 'setMode', 'cleared') };
      },
      false
    );
  }

  private setSimpleMode_(part: PlantPartConfig, mode: PartModeConfig): VerbResult {
    if (this.getPartMode(part.id) === mode.id) {
      return { observation: `${part.label ?? part.id} is already in ${mode.label}.`, costSeconds: 0 };
    }

    return this.act_(
      'setMode',
      part.id,
      VERB_COST_S.setMode,
      false,
      () => {
        this.partModes_.set(part.id, mode.id);
        if ((mode.startupS ?? 0) > 0) {
          this.startingUntilS_.set(part.id, this.deps_.now() + VERB_COST_S.setMode + (mode.startupS ?? 0));
        } else {
          this.startingUntilS_.delete(part.id);
        }

        return { observation: `You set ${part.label ?? part.id} to ${mode.label}.` };
      },
      false
    );
  }

  /** Fit a spare: consumes stock, clears every fault the old item had, fails when the stock is gone */
  swap(target: string): VerbResult {
    const type = this.targetType_(target);
    if (!type) {
      return this.unknown_();
    }
    if (!this.verbApplies('swap', target)) {
      return this.notApplicable_();
    }
    const key = this.spareKeyFor_(target, type);
    if ((this.spares_[key] ?? 0) <= 0) {
      return this.noSpare_();
    }

    return this.act_(
      'swap',
      target,
      SWAP_COST_S[type],
      true,
      () => {
        this.spares_[key] = (this.spares_[key] ?? 0) - 1;
        this.sparesUsed_.push(key);
        if (type === 'connector') {
          this.sealed_.delete(target);
        }
        const cleared = this.removeFaults_((rt) => rt.fault.target === target && (type !== 'part' || rt.fault.kind === 'brick-dead'));

        return { observation: this.line_(target, 'swap', cleared.length > 0 ? 'cleared' : 'no-effect'), cleared };
      },
      true
    );
  }

  /** Step out of the building: opens a trip (no-op if already outside) */
  goOutside(): VerbResult {
    return this.act_('goOutside', undefined, VERB_COST_S.goOutside, false, () => ({
      observation: this.generic_('go-outside'),
    }));
  }

  /** Go back to the building: closes the open trip */
  returnInside(): VerbResult {
    return this.act_('returnInside', undefined, VERB_COST_S.returnInside, false, () => ({
      observation: this.generic_('return-inside'),
    }));
  }

  // ---------------------------------------------------------------- trainer

  /** Add (or replace by id) a fault; its effect starts at once */
  injectFault(fault: PlantFault): void {
    this.faults_ = this.faults_.filter((rt) => rt.fault.id !== fault.id);
    this.addFault_(fault);
    this.solve_();
  }

  /** Time a measurement takes: advances the clock without a verb (no log entry, no downtime) */
  spendTime(seconds: number): void {
    if (seconds > 0) {
      this.deps_.skip(seconds);
      this.solve_();
    }
  }

  /**
   * App verb: reboot the SkyLink terminal. The press costs sim time; the boot then runs in sim time
   * through `rebootUntilS`, so the outage shows in the status and the app's history.
   */
  reboot(): VerbResult {
    const terminal = this.terminalPart_();
    if (!terminal) {
      return this.notApplicable_();
    }

    return this.act_('reboot', terminal.id, VERB_COST_S.reboot, true, () => ({ observation: 'The terminal is restarting.' }));
  }

  /** App verb: set the snow melt mode. Costs a few seconds. */
  setSnowMelt(mode: SnowMeltMode): VerbResult {
    const terminal = this.terminalPart_();
    if (!terminal || !(mode in MELT_WINDOW_S)) {
      return this.notApplicable_();
    }

    return this.act_('setSnowMelt', terminal.id, VERB_COST_S.setSnowMelt, false, () => {
      this.terminalSettings_.snowMelt = mode;
      this.holdWindow(MELT_WINDOW_KEY, false);
      this.trackMeltWindow_();

      return { observation: `Snow melt is set to ${mode}.` };
    });
  }

  /** App verb: set (or clear, with null) the power-save sleep window, as sim time of day in seconds */
  setSleep(schedule: SleepSchedule | null): VerbResult {
    const terminal = this.terminalPart_();
    const valid = (s: number): boolean => Number.isFinite(s) && s >= 0 && s < SECONDS_PER_DAY;
    if (!terminal || (schedule && (!valid(schedule.startS) || !valid(schedule.endS)))) {
      return this.notApplicable_();
    }

    return this.act_('setSleep', terminal.id, VERB_COST_S.setSleep, false, () => {
      this.terminalSettings_.sleep = schedule ? { startS: schedule.startS, endS: schedule.endS } : null;
      this.trackMeltWindow_();

      return { observation: schedule ? 'The sleep schedule is saved.' : 'The sleep schedule is off.' };
    });
  }

  /** App verb: set the router Wi-Fi name and password. Cosmetic (no wired versus wireless laptop in the plant). */
  setRouterWifi(wifi: RouterWifi): VerbResult {
    if (!this.config_.parts.some((p) => p.kind === 'router')) {
      return this.notApplicable_();
    }
    this.terminalSettings_.wifi = { ssid: wifi.ssid, password: wifi.password };

    return { observation: 'The Wi-Fi settings are saved.', costSeconds: 0 };
  }

  /** Starts a normal boot of a part now (an authored event; no verb, no cost, no downtime booked) */
  startBoot(partId: string): void {
    const boot = this.bootSeconds_(partId);
    if (boot > 0 && this.parts_.has(partId)) {
      // Authored scenario boot: timed by the scenario, so no post-boot search is added
      this.rebootUntilS_.set(partId, this.deps_.now() + boot);
      this.searchUntilS_.delete(partId);
    }
  }

  clearFault(faultId: string): boolean {
    const removed = this.removeFaults_((rt) => rt.fault.id === faultId);
    this.solve_();

    return removed.length > 0;
  }

  /**
   * Trainer spare override. Precedence is trainer override, then scenario
   * `spares`, then the defaults: listed keys replace the stock, the rest keep
   * the scenario (or default) value.
   */
  setSpares(spares: PlantSpares): void {
    this.trainerSpares_ = { ...spares };
    this.spares_ = { ...(this.config_.spares ?? this.defaultSpares_()), ...spares };
  }

  setWeather(weather: Partial<PlantEnvironment>): void {
    this.deps_.setWeather?.(weather);
    this.solve_();
  }

  // ------------------------------------------------------------- checkpoint

  getState(): PlantState {
    return JSON.parse(
      JSON.stringify({
        terminalSettings: this.terminalSettings_,
        faults: this.faults_,
        sealed: [...this.sealed_],
        clearedFaultIds: [...this.clearedFaultIds_],
        revealedFacts: [...this.revealedFacts_],
        spares: this.spares_,
        trainerSpares: this.trainerSpares_,
        rebootUntilS: Object.fromEntries(this.rebootUntilS_),
        searchUntilS: Object.fromEntries(this.searchUntilS_),
        startingUntilS: Object.fromEntries(this.startingUntilS_),
        partModes: Object.fromEntries(this.partModes_),
        windows: Object.fromEntries(this.windows_),
        generatorRunning: Object.fromEntries([...this.parts_.values()].filter((part) => part.kind === 'generator').map((part) => [part.id, this.isRunning_(part.id)])),
        supplied: Object.fromEntries(this.supplied_),
        socWh: Object.fromEntries(this.socWh_),
        fuelL: Object.fromEntries(this.fuelL_),
        outside: this.outside_,
        trips: this.trips_,
        spotted: this.spotted_,
        sparesUsed: this.sparesUsed_,
        downtimeS: this.downtimeS_,
        transmit: this.transmit_,
        startS: this.startS_,
        firstCorrectS: this.firstCorrectS_,
        accS: this.accS_,
        log: this.log_,
      } satisfies PlantState)
    ) as PlantState;
  }

  restoreState(state: PlantState): void {
    const copy = JSON.parse(JSON.stringify(state)) as PlantState;
    this.faults_ = copy.faults;
    this.sealed_ = new Set(copy.sealed);
    this.clearedFaultIds_ = new Set(copy.clearedFaultIds ?? []);
    this.revealedFacts_ = new Set(copy.revealedFacts ?? []);
    this.spares_ = copy.spares;
    this.trainerSpares_ = copy.trainerSpares;
    this.rebootUntilS_ = new Map(Object.entries(copy.rebootUntilS));
    this.searchUntilS_ = new Map(Object.entries(copy.searchUntilS ?? {}));
    this.terminalSettings_ = copy.terminalSettings
      ? { snowMelt: copy.terminalSettings.snowMelt, sleep: copy.terminalSettings.sleep, wifi: copy.terminalSettings.wifi }
      : this.defaultTerminalSettings_();
    this.startingUntilS_ = new Map(Object.entries(copy.startingUntilS ?? {}));
    for (const [id, modeId] of Object.entries(copy.partModes ?? {})) {
      if (this.parts_.get(id)?.modes?.some((m) => m.id === modeId)) {
        this.partModes_.set(id, modeId);
      }
    }
    for (const [id, running] of Object.entries(copy.generatorRunning ?? {})) {
      if (this.parts_.has(id)) {
        this.running_.set(id, running);
      }
    }
    this.windows_ = new Map(Object.entries(copy.windows ?? {}));
    this.supplied_ = new Map(Object.entries(copy.supplied));
    this.socWh_ = new Map(Object.entries(copy.socWh));
    this.fuelL_ = new Map(Object.entries(copy.fuelL));
    this.outside_ = copy.outside;
    this.trips_ = copy.trips;
    this.spotted_ = copy.spotted;
    this.sparesUsed_ = copy.sparesUsed;
    this.downtimeS_ = copy.downtimeS;
    this.transmit_ = copy.transmit ? { intervals: copy.transmit.intervals, baseS: copy.transmit.baseS, lastS: copy.transmit.lastS } : { intervals: [], baseS: 0, lastS: null };
    this.startS_ = copy.startS;
    this.firstCorrectS_ = copy.firstCorrectS;
    this.accS_ = copy.accS;
    this.log_ = copy.log;
    this.obsLast_ = new Map();
    this.solve_();
  }

  // ------------------------------------------------------------ verb plumbing

  /** Zero-cost refusal for a verb that does not apply: no log, no trip, not an ineffective action */
  private notApplicable_(): VerbResult {
    return { observation: this.generic_('not-applicable'), costSeconds: 0 };
  }

  private generic_(key: GenericObsKey): string {
    return pickGeneric(key, this.deps_.rng('plant:obs'), this.obsLast_);
  }

  /** Table class of a target (null for an unknown id) */
  getObsClass(id: string): ObsTargetClass | null {
    const part = this.parts_.get(id);
    if (part) {
      const byClass: Record<PartClass, ObsTargetClass> = {
        'power-station': 'power-station',
        generator: 'generator',
        router: 'router',
        modem: 'modem',
        laptop: 'laptop',
        panel: 'panel',
        reflector: 'reflector',
        lnb: 'lnb',
        strip: 'power-strip',
      };

      return byClass[this.partClass_(part)];
    }
    const cable = this.cables_.get(id);
    if (cable) {
      return cable.cableType === 'coax' ? 'cable-coax' : 'cable-pd';
    }
    const connector = this.connectors_.get(id);
    if (connector) {
      if (connector.feeds !== undefined) {
        return 'conn-power';
      }
      if (!connector.cableId) {
        return 'conn-feed';
      }

      return this.cables_.get(connector.cableId)?.cableType === 'coax' ? 'conn-coax' : 'conn-pd';
    }

    return null;
  }

  /** One observation line for a target, verb and state, with the live values filled in */
  private line_(target: string, verb: RuleVerb, state: ObsState, extra: ObsTemplateVars = {}): string {
    const cls = this.getObsClass(target);
    if (!cls) {
      return this.generic_('unknown-target');
    }

    return pickObs(OBS_TABLE, { target: cls, verb, state, id: target }, this.deps_.rng('plant:obs'), { ...this.obsVars_(target), ...extra }, this.obsLast_);
  }

  private hasLine_(target: string, verb: RuleVerb, state: ObsState): boolean {
    const cls = this.getObsClass(target);

    return cls !== null && hasObs(OBS_TABLE, { target: cls, verb, state });
  }

  private socPercent_(partId: string): number | undefined {
    const part = this.parts_.get(partId);
    const soc = this.socWh_.get(partId);
    if (!part || soc === undefined || !part.capacityWh) {
      return undefined;
    }

    return Math.round(Math.min(100, Math.max(0, (soc / part.capacityWh) * 100)));
  }

  /** Live values the text can interpolate for a target */
  private obsVars_(target: string): ObsTemplateVars {
    const vars: ObsTemplateVars = {};
    const part = this.parts_.get(target);
    if (part) {
      const supply = this.solved_.get(target);
      vars.v = ((supply?.ratio ?? 0) * this.nominalV_(target)).toFixed(1);
      vars.nom = this.nominalV_(target);
      vars.boot = this.bootSeconds_(target);
      vars.fuel = (this.fuelL_.get(target) ?? 0).toFixed(1);
      vars.tank = part.tankL ?? DEFAULT_TANK_L;
      vars.pct = this.socPercent_(target) ?? 0;
      vars.wh = Math.round(this.socWh_.get(target) ?? 0);
      const load = Math.round(this.loadOf_(target, 0));
      vars.w = load;
      vars.a = (Number(vars.v) > 0 ? load / Number(vars.v) : 0).toFixed(1);
    }
    const cableId = this.cables_.has(target) ? target : this.connectors_.get(target)?.cableId;
    const cable = cableId ? this.cables_.get(cableId) : undefined;
    if (cable) {
      vars.len = cable.lengthM;
      vars.r = (this.getLoopResistanceOhm(cable.id) ?? 0).toFixed(1);
      vars.end = this.endName_(cable.from);
    }

    return vars;
  }

  /** "router end", "modem end": the named end a distance along a cable is measured from */
  private endName_(partId: string): string {
    const part = this.parts_.get(partId);
    const word = part?.kind === 'router' ? 'router' : part?.kind === 'modem' ? 'modem' : (part?.label ?? partId).toLowerCase();

    return `${word} end`;
  }

  /** No stock for the item: explained at no cost, not logged, not an ineffective action */
  private noSpare_(): VerbResult {
    return { observation: this.generic_('no-spare'), costSeconds: 0 };
  }

  private unknown_(): VerbResult {
    return { observation: this.generic_('unknown-target'), costSeconds: UNKNOWN_COST_S };
  }

  private observe_(verb: 'inspect' | 'wiggle' | 'feel' | 'multimeter' | 'cable-tester', target: string): VerbResult {
    const type = this.targetType_(target);
    if (!type) {
      return this.unknown_();
    }
    if (!this.verbApplies(verb, target)) {
      return this.notApplicable_();
    }

    return this.act_(verb, target, VERB_COST_S[verb], false, () => {
      if (verb === 'multimeter') {
        return this.readMultimeter_(target, type);
      }
      if (verb === 'cable-tester') {
        return this.readCableTester_(target, type);
      }

      return this.readByHand_(verb, target);
    });
  }

  private fix_(verb: RuleVerb, target: string): VerbResult {
    const type = this.targetType_(target);
    if (!type) {
      return this.unknown_();
    }
    if (!this.verbApplies(verb, target)) {
      return this.notApplicable_();
    }
    const kinds = FIXES[verb] ?? [];

    return this.act_(
      verb,
      target,
      VERB_COST_S[verb],
      DISRUPTIVE_VERBS.has(verb),
      () => {
        if (verb === 'seal' && type === 'connector') {
          this.sealed_.add(target);
        }
        const cleared = this.removeFaults_((rt) => rt.fault.target === target && kinds.includes(rt.fault.kind));
        const state: ObsState = cleared.length > 0 ? 'cleared' : this.unfixedState_(verb, target);

        return { observation: this.line_(target, verb, state), cleared };
      },
      true
    );
  }

  /**
   * Run one verb: trip bookkeeping, effect, reboot of dependants, clock skip,
   * re-solve and log. `isFix` verbs are checked for ineffective actions.
   */
  private act_(verb: PlantVerb, target: string | undefined, costSeconds: number, disruptive: boolean, apply: () => ActOutcome, isFix = false): VerbResult {
    // A verb's location is its target's location; the doors have their own
    const location = this.verbLocation_(verb, target);
    const wasOutside = this.outside_;
    this.updateTrip_(location, target);
    const outdoor = location === 'outdoor' || (location === 'either' && this.outside_);

    const outcome = apply();
    for (const fact of outcome.facts ?? []) {
      this.revealedFacts_.add(fact);
    }
    const revealed = outcome.revealed ?? [];
    const cleared = outcome.cleared ?? [];
    let downtimeSeconds = 0;

    if (disruptive && target) {
      const dependants = this.dependants_(target);
      // A dependant behind another restarting part only starts its own boot once that part is back
      const readyS = new Map<string, number>();
      const readyAt = (id: string): number => {
        const known = readyS.get(id);
        if (known !== undefined) {
          return known;
        }
        const upstream = this.parts_.get(id)?.poweredBy;
        const gate = upstream && dependants.includes(upstream) && upstream !== id ? readyAt(upstream) : this.deps_.now() + costSeconds;
        const end = gate + this.bootSeconds_(id);
        readyS.set(id, end);

        return end;
      };
      let longestBoot = 0;
      for (const id of dependants) {
        const end = readyAt(id);
        longestBoot = Math.max(longestBoot, end - (this.deps_.now() + costSeconds));
        this.setBootEnd_(id, end);
        this.armedUntilS_.set(id, Math.max(end, this.searchUntilS_.get(id) ?? 0));
      }
      downtimeSeconds = costSeconds + longestBoot;
      // D13: the outage runs on through the post-boot satellite search
      for (const id of dependants) {
        const searchEndS = this.searchUntilS_.get(id);
        if (searchEndS !== undefined) {
          downtimeSeconds = Math.max(downtimeSeconds, searchEndS - this.deps_.now());
        }
      }
    }

    const startS = this.deps_.now();
    this.deps_.skip(costSeconds);
    this.solve_();
    if (disruptive && target) {
      // The stated downtime must match the real restart: read it back from the final boot and search ends
      for (const id of this.dependants_(target)) {
        const endS = Math.max(this.rebootUntilS_.get(id) ?? 0, this.searchUntilS_.get(id) ?? 0);
        downtimeSeconds = Math.max(downtimeSeconds, endS - startS);
      }
    }
    this.downtimeS_ += downtimeSeconds;

    if (isFix && cleared.length > 0 && this.firstCorrectS_ === null) {
      this.firstCorrectS_ = this.deps_.now();
    }
    const entry: PlantLogEntry = {
      tSeconds: this.deps_.now(),
      verb,
      target,
      outdoor,
      costSeconds,
      downtimeSeconds,
      revealed,
      cleared,
      observation: outcome.observation,
    };
    if (isFix) {
      entry.effective = outcome.effective ?? cleared.length > 0;
    }
    this.log_.push(entry);
    this.notifyAction_(entry, wasOutside);

    const result: VerbResult = { observation: outcome.observation, costSeconds };
    if (downtimeSeconds > 0) {
      result.downtimeSeconds = downtimeSeconds;
    }
    if (revealed.length > 0) {
      result.revealed = revealed;
    }
    if (cleared.length > 0) {
      result.cleared = cleared;
    }

    return result;
  }

  private verbLocation_(verb: PlantVerb, target: string | undefined): TargetLocation {
    if (verb === 'goOutside') {
      return 'outdoor';
    }
    if (verb === 'returnInside') {
      return 'indoor';
    }

    return (target && this.getTargetTraits(target)?.location) || 'either';
  }

  private updateTrip_(location: TargetLocation, target: string | undefined): void {
    // Forward site: one outdoor view, so there is no trip to count and nobody to spot it
    if (this.config_.site?.mode === 'forward') {
      return;
    }
    if (location === 'either') {
      return;
    }
    if (location === 'indoor') {
      this.outside_ = false;

      return;
    }
    if (this.outside_) {
      return;
    }
    this.outside_ = true;
    this.trips_++;
    if (this.trips_ > this.tripLimit_) {
      this.spotted_ = true;
      const spottedEntry: PlantLogEntry = {
        tSeconds: this.deps_.now(),
        verb: 'spotted',
        target,
        outdoor: true,
        costSeconds: 0,
        downtimeSeconds: 0,
        revealed: [],
        cleared: [],
        observation: this.generic_('spotted'),
      };
      this.log_.push(spottedEntry);
      this.notifyAction_(spottedEntry, false);
    }
  }

  // ------------------------------------------------------------ observations

  /** Derived state of a part for a hand check: booting, unpowered or healthy */
  private derivedState_(target: string, verb: RuleVerb): ObsState {
    const part = this.parts_.get(target);
    if (!part) {
      return 'healthy';
    }
    const supply = this.solved_.get(target);
    const supplied = part.kind === 'generator' ? this.generatorRunning_(part) : (supply?.ok ?? true);
    let state: ObsState = 'healthy';
    if (part.kind === 'generator' && this.isStarting(target)) {
      state = 'booting';
    } else if (!supplied) {
      state = 'unpowered';
    } else if (this.isRebooting_(target)) {
      state = 'booting';
    }
    if (state !== 'healthy' && !this.hasLine_(target, verb, state)) {
      // No dedicated line: an unpowered part reads like a booting one only where authored
      return state === 'booting' ? 'healthy' : this.hasLine_(target, verb, 'unpowered') ? 'unpowered' : 'healthy';
    }

    return state;
  }

  /** What a fix verb that cleared nothing reports: a fault the verb shows, an unpowered part, or no effect */
  private unfixedState_(verb: RuleVerb, target: string): ObsState {
    for (const rt of this.faults_) {
      if (rt.fault.target === target && this.exists_(rt) && this.hasLine_(target, verb, rt.fault.kind)) {
        return rt.fault.kind;
      }
    }
    if (this.derivedState_(target, verb) === 'unpowered' && this.hasLine_(target, verb, 'unpowered')) {
      return 'unpowered';
    }

    return 'no-effect';
  }

  private readByHand_(verb: 'inspect' | 'wiggle' | 'feel', target: string): ActOutcome {
    const lines: string[] = [];
    const revealed: string[] = [];
    const facts: string[] = [];
    const now = this.deps_.now();

    for (const rt of this.faults_) {
      if (rt.fault.target !== target || !this.exists_(rt) || !this.hasLine_(target, verb, rt.fault.kind)) {
        continue;
      }
      if (verb === 'wiggle' && INTERMITTENT_KINDS.has(rt.fault.kind)) {
        // Moving it reproduces the drop on demand, whatever the weather
        rt.dropUntilS = now + DROP_SECONDS;
      }
      lines.push(this.line_(target, verb, rt.fault.kind, this.faultVars_(rt.fault)));
      if (verb === 'inspect' && rt.fault.kind === 'partial-seat') {
        // The eye sees a gap but cannot call it a fault: only a wiggle or a meter confirms it
        continue;
      }
      revealed.push(rt.fault.id);
      this.pushFact_(facts, rt.fault, verb);
    }
    if (lines.length > 0) {
      return { observation: lines.join(' '), revealed, facts };
    }

    return { observation: this.line_(target, verb, this.derivedState_(target, verb)) };
  }

  private readCableTester_(target: string, type: TargetType): ActOutcome {
    if (type === 'part') {
      return { observation: this.generic_('not-applicable') };
    }
    const lines: string[] = [];
    const revealed: string[] = [];
    const facts: string[] = [];
    for (const rt of this.faults_) {
      if (rt.fault.target !== target || !this.exists_(rt) || !this.hasLine_(target, 'cable-tester', rt.fault.kind)) {
        continue;
      }
      lines.push(this.line_(target, 'cable-tester', rt.fault.kind, this.faultVars_(rt.fault)));
      revealed.push(rt.fault.id);
      this.pushFact_(facts, rt.fault, 'cable-tester');
    }
    if (lines.length > 0) {
      return { observation: lines.join(' '), revealed, facts };
    }

    return { observation: this.line_(target, 'cable-tester', 'healthy') };
  }

  private readMultimeter_(target: string, type: TargetType): ActOutcome {
    const partId = this.powerPartFor_(target, type);
    const supply = partId ? this.solved_.get(partId) : undefined;
    if (!partId || !supply) {
      return { observation: this.generic_('no-supply') };
    }
    const nominal = this.nominalV_(partId);
    let volts = supply.ratio * nominal;
    if (
      type === 'connector' &&
      this.faults_.some((rt) => rt.fault.target === target && this.isEffective_(rt) && (rt.fault.kind === 'partial-seat' || rt.fault.kind === 'loose-nut'))
    ) {
      // A half-seated contact adds resistance: the probe reads a little low even between dropouts
      volts *= PARTIAL_SEAT_METER_RATIO;
    }
    const meter = this.config_.meter;
    if (meter && volts > 0) {
      // Display jitter only; conditions read the model, never this value
      volts *= 1 + ((this.deps_.rng('plant:meter').next() * 2 - 1) * meter.jitterPct) / 100;
    }
    const low = !supply.ok || supply.ratio < 0.95;
    const own: string[] = [];
    const lines: string[] = [];
    const vars: ObsTemplateVars = { v: volts.toFixed(1), nom: nominal };
    for (const rt of this.faults_) {
      if (rt.fault.target === target && this.exists_(rt) && this.hasLine_(target, 'multimeter', rt.fault.kind)) {
        lines.push(this.line_(target, 'multimeter', rt.fault.kind, vars));
        own.push(rt.fault.id);
      }
    }
    if (lines.length === 0) {
      const state: ObsState = volts <= 0 ? 'supply-absent' : low ? 'supply-low' : 'healthy';
      lines.push(this.line_(target, 'multimeter', state, vars));
      if (state === 'supply-absent') {
        const hint = this.supplyHint_(partId);
        if (hint) {
          lines.push(hint);
        }
      }
    }
    const revealed = [...new Set([...own, ...(low ? this.powerFaultsUpstream_(partId) : [])])];

    return { observation: lines.join(' '), revealed };
  }

  /** Extra line after a 0 V reading, per config `supplyHint` ('off' adds nothing) */
  private supplyHint_(partId: string): string | null {
    const mode = this.config_.supplyHint ?? 'off';
    if (mode === 'off') {
      return null;
    }
    const feederId = this.parts_.get(partId)?.poweredBy;
    const feeder = feederId ? this.parts_.get(feederId) : undefined;
    if (!feeder) {
      return pickGeneric('hint-source', this.deps_.rng('plant:obs'), this.obsLast_);
    }
    if (mode === 'generic') {
      return pickGeneric('hint-generic', this.deps_.rng('plant:obs'), this.obsLast_);
    }

    return fillText(pickGeneric('hint-feeder', this.deps_.rng('plant:obs'), this.obsLast_), { feeder: (feeder.label ?? feeder.id).toLowerCase() });
  }

  private faultVars_(fault: PlantFault): ObsTemplateVars {
    const cable = this.cables_.get(fault.target);
    const len = cable?.lengthM ?? 0;

    return { atM: fault.atMeters ?? len / 2, len };
  }

  /**
   * Record the fact an observation supports. A hand look at a water-filled cable
   * shows a sound sheath, so it supports nothing; the tester's distance does.
   */
  private pushFact_(facts: string[], fault: PlantFault, verb: string): void {
    const fact = FACT_OF[fault.kind];
    if (!fact || (fault.kind === 'cable-water' && verb !== 'cable-tester')) {
      return;
    }
    facts.push(`${fault.target}|${fact}`);
  }

  /** Part whose supply a multimeter on this target reads */
  private powerPartFor_(target: string, type: TargetType): string | null {
    if (type === 'part') {
      return target;
    }
    const cableId = type === 'cable' ? target : this.connectors_.get(target)?.cableId;
    if (cableId) {
      for (const part of this.parts_.values()) {
        if (part.viaCable === cableId) {
          return part.id;
        }
      }
    }

    const connector = this.connectors_.get(target);

    return connector?.feeds ?? connector?.partId ?? null;
  }

  private powerFaultsUpstream_(partId: string): string[] {
    const ids = new Set<string>();
    let current = this.parts_.get(partId);
    for (let depth = 0; current && depth < 16; depth++) {
      ids.add(current.id);
      if (current.viaCable) {
        ids.add(current.viaCable);
        for (const c of this.connectors_.values()) {
          if (c.cableId === current.viaCable) {
            ids.add(c.id);
          }
        }
      }
      for (const c of this.connectors_.values()) {
        if (c.feeds === current.id) {
          ids.add(c.id);
        }
      }
      current = current.poweredBy ? this.parts_.get(current.poweredBy) : undefined;
    }

    return this.faults_.filter((rt) => ids.has(rt.fault.target) && this.isEffective_(rt)).map((rt) => rt.fault.id);
  }

  // ------------------------------------------------------------------ faults

  private addFault_(fault: PlantFault): void {
    this.faults_.push({ fault: { ...fault }, dropUntilS: 0 });
  }

  private applyAuthoredConnectorState_(connector: PlantConnectorConfig): void {
    const state = connector.state;
    if (!state) {
      return;
    }
    const id = connector.id;
    if (state.seated === 'partial') {
      this.addFault_({ id: `${id}:seat`, target: id, kind: 'partial-seat' });
    } else if (state.seated === 'out') {
      this.addFault_({ id: `${id}:seat`, target: id, kind: 'unseated' });
    }
    if (state.corrosion) {
      this.addFault_({ id: `${id}:corrosion`, target: id, kind: 'corrosion', severity: state.corrosion });
    }
    if (state.moisture) {
      this.addFault_({ id: `${id}:moisture`, target: id, kind: 'moisture', severity: state.moisture });
    }
    if (state.bentPin) {
      this.addFault_({ id: `${id}:pin`, target: id, kind: 'bent-pin' });
    }
    if (state.sealed) {
      this.sealed_.add(id);
    }
  }

  private removeFaults_(match: (rt: PlantFaultSnapshot) => boolean): string[] {
    const removed = this.faults_.filter(match).map((rt) => rt.fault.id);
    if (removed.length > 0) {
      this.faults_ = this.faults_.filter((rt) => !removed.includes(rt.fault.id));
      for (const id of removed) {
        this.clearedFaultIds_.add(id);
      }
    }

    return removed;
  }

  /** A fault whose start time has come (or that has none) and is not blocked by a seal */
  private exists_(rt: PlantFaultSnapshot): boolean {
    const trigger = rt.fault.trigger;
    if (trigger && 'atSeconds' in trigger && this.deps_.now() < trigger.atSeconds) {
      return false;
    }

    return !(rt.fault.kind === 'moisture' && this.sealed_.has(rt.fault.target));
  }

  /** Exists and its trigger currently holds */
  private isEffective_(rt: PlantFaultSnapshot): boolean {
    return this.exists_(rt) && this.triggerHolds_(rt.fault.trigger, rt.fault.target) !== 0;
  }

  /** Strength 0 when the trigger does not hold; otherwise how far over the threshold (1 = at it) */
  private triggerHolds_(trigger: PlantTrigger | undefined, target: string): number {
    if (!trigger || 'always' in trigger || 'atSeconds' in trigger) {
      return 1;
    }
    const env = this.deps_.env();
    const [reading, threshold] = this.readTrigger_(trigger, env, target);

    return reading > threshold ? Math.max(reading / Math.max(threshold, 0.001), 1) : 0;
  }

  private readTrigger_(trigger: PlantTrigger, env: PlantEnvironment, target: string): [number, number] {
    if ('windMps' in trigger) {
      return [env.windMps, parseThreshold(trigger.windMps)];
    }
    if ('rainMmH' in trigger) {
      return [env.rainMmH, parseThreshold(trigger.rainMmH)];
    }
    if ('loadW' in trigger) {
      return [this.loadOf_(target, 0), parseThreshold(trigger.loadW)];
    }

    return [0, 0];
  }

  /** The fault is cutting the link right now (open circuit or a dropout window) */
  private isCutting_(rt: PlantFaultSnapshot): boolean {
    if (rt.dropUntilS > this.deps_.now() && this.exists_(rt)) {
      return true;
    }

    return (rt.fault.kind === 'unseated' || rt.fault.kind === 'cable-crush') && this.isEffective_(rt);
  }

  private hasActiveFault_(target: string, kinds: PlantFaultKind[]): boolean {
    return this.faults_.some((rt) => rt.fault.target === target && kinds.includes(rt.fault.kind) && this.isEffective_(rt));
  }

  private activeSeverity_(target: string, kind: PlantFaultKind): number {
    let severity = 0;
    for (const rt of this.faults_) {
      if (rt.fault.target === target && rt.fault.kind === kind && this.isEffective_(rt)) {
        severity = Math.max(severity, rt.fault.severity ?? 1);
      }
    }

    return severity;
  }

  /** The fault target is a cable or connector whose link reaches the part */
  private linkTouchesPart_(faultTarget: string, partId: string): boolean {
    const cable = this.cables_.get(faultTarget);
    if (cable) {
      return cable.from === partId || cable.to === partId;
    }
    const connector = this.connectors_.get(faultTarget);
    if (!connector) {
      return false;
    }
    if (connector.partId === partId) {
      return true;
    }
    const owner = connector.cableId ? this.cables_.get(connector.cableId) : undefined;

    return owner ? owner.from === partId || owner.to === partId : false;
  }

  // ------------------------------------------------------------------ signal

  private signalLossDb_(role: 'pre-lna' | 'post-lna', stationId: string): number {
    let total = 0;
    for (const connector of this.connectors_.values()) {
      if (connector.role === role && this.stationMatches_(connector.stationId, stationId)) {
        total += this.itemLossDb_(connector.id);
      }
    }
    for (const cable of this.cables_.values()) {
      if (cable.role === role && this.stationMatches_(cable.stationId, stationId)) {
        total += this.itemLossDb_(cable.id);
      }
    }

    return total;
  }

  private stationMatches_(itemStation: string | undefined, stationId: string): boolean {
    return (itemStation ?? this.config_.stationId ?? stationId) === stationId;
  }

  private itemLossDb_(id: string): number {
    let loss = 0;
    for (const rt of this.faults_) {
      if (rt.fault.target !== id || !this.isEffective_(rt)) {
        continue;
      }
      const entry = LOSS_DB[rt.fault.kind];
      if (entry) {
        loss += entry.scales ? entry.db * (rt.fault.severity ?? 1) : entry.db;
      }
      if (INTERMITTENT_KINDS.has(rt.fault.kind) && rt.dropUntilS > this.deps_.now()) {
        loss += DROP_LOSS_DB;
      }
    }

    return loss;
  }

  // ------------------------------------------------------------------- power

  /** End of a boot (and search) a verb already armed; a part regaining supply before then does not draw a second acquire time */
  private readonly armedUntilS_ = new Map<string, number>();

  private isRebooting_(partId: string): boolean {
    return this.deps_.now() < (this.rebootUntilS_.get(partId) ?? 0);
  }

  /** True while the terminal is in its post-boot satellite search (booted, powered, no service yet) */
  isSearching(partId: string): boolean {
    return !this.isRebooting_(partId) && this.deps_.now() < (this.searchUntilS_.get(partId) ?? 0);
  }

  /**
   * Record the end of a boot. A terminal then searches for a satellite until the total of boot plus
   * acquisition reaches a seeded draw inside `TERMINAL_ACQUIRE_S` (D13; mirrors `SKYLINK_SKIN.bootAcquisitionS`).
   */
  private setBootEnd_(partId: string, untilS: number): void {
    this.rebootUntilS_.set(partId, untilS);
    if (this.parts_.get(partId)?.kind !== 'terminal') {
      return;
    }
    const { minS, maxS } = TERMINAL_ACQUIRE_S;
    const totalS = minS + this.deps_.rng('plant:acquire').next() * (maxS - minS);
    const searchS = Math.max(0, totalS - this.bootSeconds_(partId));
    if (searchS > 0) {
      this.searchUntilS_.set(partId, untilS + searchS);
    } else {
      this.searchUntilS_.delete(partId);
    }
  }

  private bootSeconds_(partId: string): number {
    const part = this.parts_.get(partId);

    return part ? (part.bootS ?? DEFAULT_BOOT_S[part.kind] ?? 0) : 0;
  }

  private nominalV_(partId: string): number {
    let current = this.parts_.get(partId);
    for (let depth = 0; current && depth < 16; depth++) {
      if (current.nominalV !== undefined) {
        return current.nominalV;
      }
      current = current.poweredBy ? this.parts_.get(current.poweredBy) : undefined;
    }

    return 12;
  }

  private isRunning_(partId: string): boolean {
    return this.running_.get(partId) ?? true;
  }

  /**
   * A timed-condition window. While open the window start is kept (set on the first open call);
   * closing it forgets the start. Returns the start second or null. The start rides in checkpoints.
   */
  holdWindow(key: string, open: boolean): number | null {
    if (!open) {
      this.windows_.delete(key);

      return null;
    }
    if (!this.windows_.has(key)) {
      this.windows_.set(key, this.deps_.now());
    }

    return this.windows_.get(key) as number;
  }

  /** Own draw of a part: its current mode's load (startup load while starting), else `loadW` */
  private drawOf_(part: PlantPartConfig): number {
    const mode = this.activeMode_(part);
    const delta = this.terminalDeltaW_(part);
    if (!mode) {
      return Math.max(0, (part.loadW ?? 0) + delta);
    }

    return Math.max(0, (this.isStarting(part.id) ? (mode.startupW ?? mode.loadW) : mode.loadW) + delta);
  }

  /** Current mode config of a non-generator part with modes */
  private activeMode_(part: PlantPartConfig): PartModeConfig | undefined {
    if (part.kind === 'generator' || !part.modes?.length) {
      return undefined;
    }
    const id = this.getPartMode(part.id);

    return part.modes.find((m) => m.id === id);
  }

  /** Watts drawn from this part by everything it feeds (recursively) */
  private loadOf_(partId: string, depth: number): number {
    if (depth > 16) {
      return 0;
    }
    let total = 0;
    for (const child of this.parts_.values()) {
      if (child.poweredBy === partId) {
        total += this.drawOf_(child) + this.loadOf_(child.id, depth + 1);
      }
    }

    return total;
  }

  private generatorRunning_(part: PlantPartConfig): boolean {
    return this.isRunning_(part.id) && !this.isStarting(part.id) && (this.fuelL_.get(part.id) ?? 0) > 0 && !this.hasActiveFault_(part.id, ['out-of-fuel']);
  }

  private effectiveMaxOutputW_(part: PlantPartConfig): number {
    const cold = part.coldDerate ?? 0.3;
    const ambient = this.deps_.env().ambientC;
    const derate = ambient < 0 ? cold * Math.min(1, -ambient / 10) : 0;

    return (part.maxOutputW ?? 500) * (1 - derate);
  }

  private supplyOf_(partId: string, memo: Map<string, Supply>, depth = 0): Supply {
    const cached = memo.get(partId);
    if (cached) {
      return cached;
    }
    const part = this.parts_.get(partId);
    let supply: Supply = { ok: true, ratio: 1 };
    if (!part || depth > 16) {
      memo.set(partId, supply);

      return supply;
    }
    if (part.kind === 'generator') {
      supply = this.generatorSupply_(part);
    } else if (part.kind === 'battery') {
      supply = this.batterySupply_(part, memo, depth);
    } else if (part.poweredBy) {
      supply = this.consumerSupply_(part, memo, depth);
    }
    if (this.hasActiveFault_(partId, ['brick-dead'])) {
      supply = { ok: false, ratio: 0 };
    }
    memo.set(partId, supply);

    return supply;
  }

  private generatorSupply_(part: PlantPartConfig): Supply {
    if (!this.generatorRunning_(part)) {
      return { ok: false, ratio: 0 };
    }
    const rated = part.ratedW ?? 1000;
    const load = this.loadOf_(part.id, 0);
    let ratio = 1 - 0.02 * Math.min(1, load / rated);
    if (load > rated) {
      ratio -= (load / rated - 1) * 0.5;
    }
    ratio -= 0.35 * this.activeSeverity_(part.id, 'generator-sag');

    return { ok: true, ratio: Math.max(0, ratio) };
  }

  private batterySupply_(part: PlantPartConfig, memo: Map<string, Supply>, depth: number): Supply {
    const charged = (this.socWh_.get(part.id) ?? 0) > 0 && !this.hasActiveFault_(part.id, ['battery-depleted']);
    if (charged) {
      const load = this.loadOf_(part.id, 0);
      const max = this.effectiveMaxOutputW_(part);

      return { ok: true, ratio: load <= max ? 1 : max / load };
    }
    // Flat battery: the generator, if any, feeds straight through
    if (part.poweredBy) {
      const upstream = this.supplyOf_(part.poweredBy, memo, depth + 1);
      if (this.feedCut_(part.id)) {
        return { ok: false, ratio: 0 };
      }

      return { ok: upstream.ok, ratio: Math.max(0, upstream.ratio - this.feedDrop_(part.id)) };
    }

    return { ok: false, ratio: 0 };
  }

  private consumerSupply_(part: PlantPartConfig, memo: Map<string, Supply>, depth: number): Supply {
    const upstreamId = part.poweredBy as string;
    const upstream = this.supplyOf_(upstreamId, memo, depth + 1);
    const upstreamUp = upstream.ok && !this.isRebooting_(upstreamId);
    if (!upstreamUp || (part.viaCable && this.cableOpen_(part.viaCable)) || this.feedCut_(part.id)) {
      return { ok: false, ratio: 0 };
    }
    let ratio = upstream.ratio;
    if (part.viaCable) {
      ratio -= this.cableConnectorDrop_(part.viaCable);
    }
    ratio = Math.max(0, ratio - this.feedDrop_(part.id));

    return { ok: ratio >= BROWNOUT_RATIO, ratio };
  }

  /** A plug or socket on the way into this part is out or dropping out */
  private feedCut_(partId: string): boolean {
    return this.faults_.some((rt) => this.isCutting_(rt) && this.connectors_.get(rt.fault.target)?.feeds === partId);
  }

  /** Ratio lost across corroded or wet plugs and sockets on the way into this part */
  private feedDrop_(partId: string): number {
    let drop = 0;
    for (const connector of this.connectors_.values()) {
      if (connector.feeds === partId) {
        drop += 0.12 * this.activeSeverity_(connector.id, 'corrosion') + 0.08 * this.activeSeverity_(connector.id, 'moisture');
      }
    }

    return drop;
  }

  private cableOpen_(cableId: string): boolean {
    return this.faults_.some((rt) => this.isCutting_(rt) && this.faultOnCable_(rt.fault.target, cableId));
  }

  private faultOnCable_(target: string, cableId: string): boolean {
    return target === cableId || this.connectors_.get(target)?.cableId === cableId;
  }

  /** Ratio lost across corroded or wet connectors on a power cable */
  private cableConnectorDrop_(cableId: string): number {
    let drop = 0;
    for (const connector of this.connectors_.values()) {
      if (connector.cableId === cableId) {
        drop += 0.12 * this.activeSeverity_(connector.id, 'corrosion') + 0.08 * this.activeSeverity_(connector.id, 'moisture');
      }
    }

    return drop;
  }

  /** Re-solve the power graph; a part regaining supply starts its boot timer */
  private solve_(): void {
    for (let pass = 0; pass < 2; pass++) {
      const memo = new Map<string, Supply>();
      for (const id of this.parts_.keys()) {
        this.supplyOf_(id, memo);
      }
      this.solved_ = memo;
      let started = false;
      for (const id of this.parts_.keys()) {
        const ok = memo.get(id)?.ok ?? true;
        const was = this.supplied_.get(id) ?? true;
        this.supplied_.set(id, ok);
        const boot = this.bootSeconds_(id);
        if (!was && ok && boot > 0 && this.deps_.now() >= (this.armedUntilS_.get(id) ?? 0)) {
          this.setBootEnd_(id, this.deps_.now() + boot);
          started = true;
        }
      }
      if (!started) {
        break;
      }
    }
  }

  /** One second: roll intermittent faults, burn fuel and charge, re-solve */
  private step_(): void {
    const now = this.deps_.now();
    this.accrueTransmit_(now);
    for (const rt of this.faults_) {
      if (!INTERMITTENT_KINDS.has(rt.fault.kind) || rt.dropUntilS > now || !this.exists_(rt)) {
        continue;
      }
      const strength = this.triggerHolds_(rt.fault.trigger, rt.fault.target);
      if (strength === 0) {
        continue;
      }
      const chance = Math.min(0.9, 0.12 * strength * (rt.fault.severity ?? 1));
      if (this.deps_.rng(`plant:${rt.fault.id}`).next() < chance) {
        rt.dropUntilS = now + DROP_SECONDS;
      }
    }
    this.trackMeltWindow_();
    this.meltSnow_();
    this.drainResources_();
    this.solve_();
  }

  private drainResources_(): void {
    for (const part of this.parts_.values()) {
      if (part.kind === 'generator' && this.generatorRunning_(part)) {
        const load = Math.min(1, this.loadOf_(part.id, 0) / (part.ratedW ?? 1000));
        const burn = ((part.burnLPerHour ?? 1.5) * (0.3 + 0.7 * load)) / 3600;
        this.fuelL_.set(part.id, Math.max(0, (this.fuelL_.get(part.id) ?? 0) - burn));
      }
      if (part.kind === 'battery') {
        const charging = this.chargeInto_(part);
        const delta = (charging - this.loadOf_(part.id, 0)) / 3600;
        const soc = (this.socWh_.get(part.id) ?? 0) + delta;
        const next = Math.min(part.capacityWh ?? soc, Math.max(0, soc));
        this.socWh_.set(part.id, next);
        if (charging > 0 && next >= BATTERY_RECOVER_FRACTION * (part.capacityWh ?? 0)) {
          this.removeFaults_((rt) => rt.fault.target === part.id && rt.fault.kind === 'battery-depleted');
        }
      }
    }
  }

  // ------------------------------------------------------------------- misc

  private targetType_(id: string): TargetType | null {
    if (this.parts_.has(id)) {
      return 'part';
    }
    if (this.cables_.has(id)) {
      return 'cable';
    }
    if (this.connectors_.has(id)) {
      return 'connector';
    }

    return null;
  }

  private spareKeyFor_(target: string, type: TargetType): string {
    if (type === 'connector') {
      return 'connector-kit';
    }
    if (type === 'cable') {
      return `cable:${this.cables_.get(target)?.cableType ?? 'unknown'}`;
    }

    return this.parts_.get(target)?.spareKey ?? 'power-brick';
  }

  /** Parts that go down when this target is unplugged, moved or swapped */
  private dependants_(target: string): string[] {
    const roots: string[] = [];
    const type = this.targetType_(target);
    let cableId: string | undefined;
    if (type === 'cable') {
      cableId = target;
    } else if (type === 'connector') {
      cableId = this.connectors_.get(target)?.cableId;
    }
    if (type === 'part') {
      roots.push(target);
    } else if (cableId) {
      for (const part of this.parts_.values()) {
        if (part.viaCable === cableId) {
          roots.push(part.id);
        }
      }
    } else if (type === 'connector') {
      const connector = this.connectors_.get(target);
      const partId = connector?.feeds ?? connector?.partId;
      if (partId) {
        roots.push(partId);
      }
    }
    const result = new Set<string>(roots);
    for (let grew = true; grew; ) {
      grew = false;
      for (const part of this.parts_.values()) {
        if (part.poweredBy && result.has(part.poweredBy) && !result.has(part.id)) {
          result.add(part.id);
          grew = true;
        }
      }
    }

    return [...result];
  }

  private defaultSpares_(): PlantSpares {
    const spares: PlantSpares = { ...DEFAULT_PLANT_SPARES };
    for (const cable of this.cables_.values()) {
      const key = `cable:${cable.cableType}`;
      spares[key] = spares[key] ?? 1;
    }

    return spares;
  }
}

/** '>8' to 8 */
function parseThreshold(threshold: string): number {
  return Number.parseFloat(threshold.replace(/^>/u, ''));
}
