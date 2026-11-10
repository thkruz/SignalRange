/**
 * @file physical-plant-types - Data types for the C6 physical-layer plant
 * @description Config (authored in a scenario's `settings.physicalPlant`), the
 * fault model, verb results and the checkpoint state. No DOM and no engine
 * imports, so the Core class runs in plain unit tests.
 */

import type { EquipmentConfig } from './equipment-records';
import type { HypothesisSpec } from './evidence-predicates';
import type { HandoverFormConfig } from './field-records';
import type { AccountState, EndpointState, ProviderState, ServiceModelConfig } from './service-types';
import type { WorkloadConfig } from './workload-types';

/** What a part is. Drives defaults (boot time, power role). */
export type PlantPartKind = 'strip' | 'terminal' | 'router' | 'battery' | 'generator' | 'dish' | 'modem' | 'client';

/** One operating mode of a part (generator 'off' / 'run'; any other part: standby, low-power, active ...) */
export interface PartModeConfig {
  id: string;
  label: string;
  /** Steady draw in this mode (a generator is a source, so 0) */
  loadW: number;
  /** Seconds to reach the mode (generator crank and warm-up); output is absent until done */
  startupS?: number;
  /** Draw while starting; defaults to `loadW` */
  startupW?: number;
  /** False for standby/off */
  servesTraffic?: boolean;
}

/** Planning numbers for the power forecast */
export interface PlantPowerConfig {
  reserveWh: number;
  planningHorizonS: number;
  basis: 'battery-only' | 'with-generator';
}

export interface PlantPartConfig {
  id: string;
  kind: PlantPartKind;
  label?: string;
  /** Part that supplies this one (power chain: generator -> battery -> router -> terminal) */
  poweredBy?: string;
  /** Where the part is worked on; default by kind (generator, dish and terminal outdoors, the rest indoors) */
  outdoor?: boolean;
  /** Cable that carries the supply to this part; damage on it can cut the supply */
  viaCable?: string;
  /** Steady draw in watts (counts against the supplying source) */
  loadW?: number;
  /** Nominal supply volts this part provides (sources) or expects (shown by the multimeter) */
  nominalV?: number;
  /** Seconds to boot after a power loss (default by kind: terminal 90, router 30, modem 45, else 0) */
  bootS?: number;
  /** Spare key a swap consumes (default 'power-brick') */
  spareKey?: string;
  /** Operating modes (generator 'off'/'run', or any part with its own draw per mode); absent = today's behavior */
  modes?: PartModeConfig[];
  /** Starting mode id (default: first mode; generator: 'off' is the same as `running: false`) */
  mode?: string;
  /** Generator */
  ratedW?: number;
  running?: boolean;
  fuelL?: number;
  /** Tank capacity in litres (default 7); a refuel above 80 percent is refused at no cost */
  tankL?: number;
  /** Litres per hour at rated load (default 1.5) */
  burnLPerHour?: number;
  /** Generator with an inverter that radiates noise (RFI flag) */
  inverterNoise?: boolean;
  /** Battery */
  capacityWh?: number;
  socWh?: number;
  maxOutputW?: number;
  /** Fraction of output lost at -10 degC and below (linear from 0 degC, default 0.3) */
  coldDerate?: number;
}

export type ConnectorSeat = 'full' | 'partial' | 'out';

export interface ConnectorState {
  seated: ConnectorSeat;
  /** 0..1 */
  corrosion: number;
  /** 0..1 */
  moisture: number;
  bentPin: boolean;
  sealed: boolean;
}

/** Where a connector or cable sits in the RF chain (neutral when unset) */
export type PlantSignalRole = 'pre-lna' | 'post-lna';

export interface PlantConnectorConfig {
  id: string;
  /** Player-facing name (hypothesis picker, logs); falls back to the id */
  label?: string;
  /** Cable this connector terminates (its carried signal and power) */
  cableId?: string;
  /** Part this connector plugs into (needed when there is no cable, e.g. an antenna feed) */
  partId?: string;
  role?: PlantSignalRole;
  stationId?: string;
  /** Part whose supply passes through this connector (a plug, socket or DC input on the power path) */
  feeds?: string;
  /** Threaded nut? Default: coax cable ends and cable-less feeds are threaded, `feeds` connectors are not */
  threaded?: boolean;
  /** Authored starting condition; non-default values become faults at construction */
  state?: Partial<ConnectorState>;
}

export type CableDamageKind = 'nick' | 'pinch' | 'crush' | 'water';

export interface CableState {
  lengthM: number;
  damage?: { kind: CableDamageKind; atM: number };
}

export interface PlantCableConfig {
  id: string;
  /** Player-facing name (hypothesis picker, logs); falls back to the id */
  label?: string;
  lengthM: number;
  /** Spare family, e.g. 'power-data' or 'coax' (spare key is `cable:<cableType>`) */
  cableType: string;
  carries: Array<'power' | 'data' | 'rf'>;
  from: string;
  to: string;
  role?: PlantSignalRole;
  stationId?: string;
  damage?: CableState['damage'];
}

/** Spare stock by key: 'cable:<cableType>', 'power-brick', 'connector-kit', 'fuel-can' */
export type PlantSpares = Record<string, number>;

export const DEFAULT_PLANT_SPARES: Readonly<PlantSpares> = Object.freeze({
  'cable:power-data': 1,
  'cable:coax': 1,
  'power-brick': 1,
  'connector-kit': 1,
  'fuel-can': 1,
});

/**
 * Fault kinds. Each applies to one target type:
 * - connector: partial-seat, loose-nut, unseated, corrosion, moisture, bent-pin
 * - cable: cable-nick, cable-pinch, cable-crush, cable-water (atMeters = where)
 * - part: generator-sag, generator-noise, out-of-fuel, brick-dead, battery-depleted, snow, net, gnss-denied (terminal only; interim for ootk #58)
 */
export type PlantFaultKind =
  | 'partial-seat'
  | 'loose-nut'
  | 'unseated'
  | 'corrosion'
  | 'moisture'
  | 'bent-pin'
  | 'cable-nick'
  | 'cable-pinch'
  | 'cable-crush'
  | 'cable-water'
  | 'generator-sag'
  | 'generator-noise'
  | 'out-of-fuel'
  | 'brick-dead'
  | 'battery-depleted'
  | 'snow'
  | 'net'
  | 'gnss-denied';

/** A comparison like '>8': the trigger holds while the reading is above the number */
export type PlantThreshold = `>${number}`;

export type PlantTrigger = { always: true } | { windMps: PlantThreshold } | { rainMmH: PlantThreshold } | { loadW: PlantThreshold } | { atSeconds: number };

export interface PlantFault {
  id: string;
  /** Part, connector or cable id */
  target: string;
  kind: PlantFaultKind;
  /** Default: always */
  trigger?: PlantTrigger;
  /** Cable faults: distance from the `from` end */
  atMeters?: number;
  /** 0..1, default 1 (scales loss, sag and intermittent probability) */
  severity?: number;
}

/** M02/M15: what an anchored plant event does. */
export type PlantEventAction =
  | { kind: 'inject-fault'; fault: PlantFault }
  | { kind: 'clear-fault'; faultId: string }
  | { kind: 'set-weather'; weather: Partial<PlantEnvironment> }
  | { kind: 'set-account'; patch: Partial<AccountState> & { id: string } }
  | { kind: 'set-provider'; patch: Partial<ProviderState> & { id: string } }
  | { kind: 'set-endpoint'; patch: Partial<EndpointState> & { id: string } }
  | { kind: 'deliver-notice'; noticeId: string; version?: number }
  | { kind: 'respond-request'; requestId: string; status: 'approved' | 'rejected' }
  | { kind: 'reboot-part'; partId: string }
  | { kind: 'set-flag'; key: string; value: string | number | boolean };

export interface PlantEventConfig {
  id: string;
  /** Objective that must be live (active or complete) before the event is due */
  startAfterObjectiveId: string;
  /** Seconds after the anchor, default 0 (fires on activation) */
  offsetS?: number;
  /** Event ids that must have fired first */
  requiresFired?: string[];
  actions: PlantEventAction[];
  /** Ops-log line, optional */
  logLine?: string;
}

export interface PlantConfig {
  /** Station whose RF chain the plant degrades when a connector/cable has no stationId */
  stationId?: string;
  parts: PlantPartConfig[];
  connectors: PlantConnectorConfig[];
  cables: PlantCableConfig[];
  /** Scenario spares; when set they win over the trainer override and the defaults */
  spares?: PlantSpares;
  faults?: PlantFault[];
  /** Terminal snow melt mode at start and after a reset (default 'automatic'); `off` for scenarios that need snow to obstruct */
  snowMelt?: SnowMeltMode;
  /**
   * Which plant part feeds each engine device's powered state. Defaults:
   * antenna 'vsat-dish', lnb 'vsat-dish', modem 'vsat-modem'. Model the LNB as
   * its own part (poweredBy the modem, viaCable the IFL) when the antenna drive
   * must keep power with the IFL cut.
   */
  engineMap?: Partial<Record<'antenna' | 'lnb' | 'modem', string>>;
  /** Outdoor trips allowed before the instructor notices (default 3) */
  tripLimit?: number;
  /**
   * Multimeter display. Each supply reading gets a uniform jitter of +-`jitterPct` percent
   * (stream `plant:meter`, display only) and `normalBandPct` is the percent of nominal volts
   * a healthy reading may sit inside. A reading of 0 V stays exactly 0.0. Absent = exact values.
   */
  meter?: { jitterPct: number; normalBandPct: number };
  /**
   * What a multimeter reading of 0 V adds. 'feeder' names the part that feeds the target,
   * 'generic' only says the loss is upstream, 'off' (default) adds nothing.
   */
  supplyHint?: 'feeder' | 'generic' | 'off';
  /** Power planning (Campaign 6): the reserve the forecast is judged against. Absent = no reserve. */
  power?: PlantPowerConfig;
  /** Objective-anchored events (Campaign 6). Absent = no events. */
  events?: PlantEventConfig[];
  /** Layered link services (Campaign 6, M04). Absent = no service model. */
  service?: ServiceModelConfig;
  /** Requirement cards and workload runs (Campaign 6, M10). Needs `service`. Absent = no runner. */
  workloads?: WorkloadConfig;
  /** Path-diagram options (M24). `highlightShared: false` hides the shared-dependency highlight so the player finds them. */
  diagram?: { highlightShared?: boolean };
  /** Terminal app actions that count as acting on a wrong cause (phase 40 D7). Absent = none. */
  wrongCauseActions?: AppWrongCauseRule[];
  /** Authored hypothesis causes (M21). When set the notebook cause is a select of these ids; free text is never graded. Absent = free text. */
  causeOptions?: Array<{ id: string; label: string }>;
  /** What a hypothesis must show to hold up, per cause. The notebook tells the player when a saved hypothesis does not (never blocks it). Absent = no feedback. */
  hypothesisSpecs?: HypothesisSpec[];
  /** Handover forms the player can submit (Campaign 6, M13). Absent = no records. */
  handovers?: HandoverFormConfig[];
  /** Equipment records, correction requests and provider notices (Campaign 6, M15). Absent = none. */
  equipment?: EquipmentConfig;
  /**
   * Site mode (Campaign 6, M07). 'camp' = the tent with the inside/outside trip rule (today's
   * behaviour). 'forward' = one wide outdoor view: no trips are counted and nobody is spotted.
   * `inventory` lists the part ids present on this site; `applySiteInventory` prunes the rest.
   * Absent = camp, everything present.
   */
  site?: PlantSiteConfig;
}

export interface PlantSiteConfig {
  mode: 'camp' | 'forward';
  /** Part ids on site. Cables, connectors, faults and service paths that need an absent part are dropped. */
  inventory?: string[];
}

/**
 * What the SkyLink dish reports.  is internal (GNSS denial, WP6) and displays as Searching.
 * No stow state: SkyLink is a fixed phased array (plan D12).
 */
export type SkylinkStatus = 'booting' | 'online' | 'searching' | 'obstructed' | 'heating' | 'thermal-throttle' | 'thermal-shutdown' | 'sleeping' | 'no-location' | 'no-power';

export interface PlantEnvironment {
  windMps: number;
  rainMmH: number;
  ambientC: number;
  /** Snow on the ground (trainer option); art only, no RF effect */
  snow?: boolean;
}

/** What the painted site shows: snow wins over wet, wet is rain above zero */
export type PlantWeather = 'clear' | 'wet' | 'snow';

/** Everything the manager needs from outside, so tests run without the app */
export interface PlantDeps {
  /** Scenario seconds now (monotonic, advanced by the clock) */
  now: () => number;
  /** Advance the sim by this many seconds (SimClock skip); the host calls update() as time passes */
  skip: (seconds: number) => void;
  env: () => PlantEnvironment;
  /** Named random stream; must return the same stream for the same name within a run */
  rng: (name: string) => { next(): number };
  /** Optional pass-through for the trainer's weather controls */
  setWeather?: (weather: Partial<PlantEnvironment>) => void;
  /** Sim time of day in seconds (0 to 86399) for the terminal sleep schedule; defaults to `now()` modulo a day */
  timeOfDayS?: () => number;
}

/** Terminal snow melt setting: heater runs on snow only, also pre-heats in the cold, or never */
export type SnowMeltMode = 'automatic' | 'preheat' | 'off';

/** Power-save sleep window as sim time of day in seconds; the window may cross midnight */
export interface SleepSchedule {
  startS: number;
  endS: number;
}

/** Router Wi-Fi details. Cosmetic: the plant does not model wired versus wireless laptops. */
export interface RouterWifi {
  ssid: string;
  password: string;
}

/** App-controlled terminal and router settings (checkpointed) */
export interface TerminalSettings {
  snowMelt: SnowMeltMode;
  sleep: SleepSchedule | null;
  wifi: RouterWifi;
}

export type PlantVerb =
  | 'inspect'
  | 'wiggle'
  | 'feel'
  | 'multimeter'
  | 'cable-tester'
  | 'reseat'
  | 'tighten'
  | 'seal'
  | 'swap'
  | 'powerCycle'
  | 'clearSnow'
  | 'removeNet'
  | 'reroute'
  | 'returnInside'
  | 'goOutside'
  | 'refuel'
  | 'setMode'
  | 'reboot'
  | 'setSnowMelt'
  | 'setSleep'
  | 'spotted';

/** Called after every logged plant action; `wasOutside` is the state before the action */
export type PlantActionListener = (entry: PlantLogEntry, wasOutside: boolean, nowOutside: boolean) => void;

export interface VerbResult {
  observation: string;
  costSeconds: number;
  /** Seconds the affected link or devices are down because of this action */
  downtimeSeconds?: number;
  /** Fault ids this observation exposed */
  revealed?: string[];
  /** Fault ids this action cleared */
  cleared?: string[];
}

export interface PlantLogEntry {
  tSeconds: number;
  verb: PlantVerb;
  target?: string;
  /** Fix verbs only: false when no fault changed */
  effective?: boolean;
  outdoor: boolean;
  costSeconds: number;
  downtimeSeconds: number;
  revealed: string[];
  cleared: string[];
  observation: string;
}

export interface PlantReport {
  /** Seconds from plant start to the first fix that cleared a fault, or null */
  firstCorrectActionS: number | null;
  trips: number;
  spotted: boolean;
  sparesUsed: string[];
  downtimeS: number;
  ineffectiveActions: number;
}

export interface PlantFaultSnapshot {
  fault: PlantFault;
  dropUntilS: number;
}

/**
 * A scenario's declaration that an app action is acting on a wrong cause (phase 40 D7).
 * It matches an action evidence entry when its verb is in 'verbs' (plant verbs 'reboot', 'setSnowMelt',
 * 'setSleep', or app verbs 'app-speed-test', 'app-obstruction-check', 'app-obstruction-stop',
 * 'app-obstruction-reset', 'app-wifi') and any of 'faultKinds' was an injected plant fault at that time.
 */
export interface AppWrongCauseRule {
  id: string;
  verbs: string[];
  faultKinds: PlantFaultKind[];
  /** Debrief wording, e.g. 'Rebooting does not bring back a GNSS fix' */
  note: string;
}

/** JSON-safe checkpoint of the manager (times are absolute scenario seconds) */
export interface PlantState {
  /** App settings of the terminal and router (optional in older checkpoints) */
  terminalSettings?: TerminalSettings;
  /** Transmit-time intervals [startS, endS] and the last accrual time (E6; optional in older checkpoints) */
  transmit?: { intervals: Array<[number, number]>; baseS: number; lastS: number | null };
  faults: PlantFaultSnapshot[];
  sealed: string[];
  /** Fault ids that existed and were removed (fix, recharge or trainer) */
  clearedFaultIds: string[];
  /** Facts the player has observed, as `<target>|<fact>` (optional in older checkpoints) */
  revealedFacts?: string[];
  spares: PlantSpares;
  trainerSpares: PlantSpares | null;
  rebootUntilS: Record<string, number>;
  /** Terminal id -> scenario second its post-boot satellite search ends (optional in older checkpoints) */
  searchUntilS?: Record<string, number>;
  /** Generator id -> scenario second its startup ends (optional in older checkpoints) */
  startingUntilS?: Record<string, number>;
  /** Condition window key -> scenario second it opened (optional in older checkpoints) */
  windows?: Record<string, number>;
  /** Generator id -> running flag (optional in older checkpoints) */
  generatorRunning?: Record<string, boolean>;
  /** Part id -> current mode id for non-generator parts with `modes` (optional in older checkpoints) */
  partModes?: Record<string, string>;
  supplied: Record<string, boolean>;
  socWh: Record<string, number>;
  fuelL: Record<string, number>;
  outside: boolean;
  trips: number;
  spotted: boolean;
  sparesUsed: string[];
  downtimeS: number;
  startS: number;
  firstCorrectS: number | null;
  accS: number;
  log: PlantLogEntry[];
}

/** Read-only view of one part for UIs and the multimeter */
export interface PartState {
  id: string;
  kind: PlantPartKind;
  /** Supplied and not rebooting */
  powered: boolean;
  rebooting: boolean;
  /** Supply volts at the part (0 when cut) */
  volts: number;
  socWh?: number;
  fuelL?: number;
  tankL?: number;
  /** Battery charge, 0..100 */
  socPct?: number;
  /** Watts drawn from this part by everything it feeds */
  loadW?: number;
  /** Painted-LED state for a later art pass: powered and booted */
  lit: boolean;
  /** Parts with `modes` only: current mode id ('off' or 'run' for a generator) */
  mode?: string;
  /** Parts with `modes` only: true while the part is starting up (supply absent) */
  starting?: boolean;
}

/** What a power-station display shows (M03) */
export interface PowerReadings {
  tS: number;
  socWh: Record<string, number>;
  capacityWh: Record<string, number>;
  /** Watts drawn from each battery and generator by everything it feeds */
  loadW: Record<string, number>;
  totalDrawW: number;
  /** Watts flowing into the batteries now */
  chargeW: number;
  fuelL: Record<string, number>;
  /** Current mode of every part with `modes` */
  modes: Record<string, string>;
  reserveWh: number | null;
}

/** Result of a forecast preview (never changes plant state) */
export interface PowerForecast {
  horizonS: number;
  basis: 'battery-only' | 'with-generator';
  projectedSocWh: number;
  meetsReserve: boolean;
  /** First second the stored energy drops below the reserve, or null if it never does within the horizon */
  secondsToReserve: number | null;
  fuelUsedL: number;
  /** Longest time any changed or starting part needs to reach its mode (verb cost included) */
  startupCostS: number;
  /** Extra energy the startups draw above their steady loads */
  startupWh: number;
  /** Parts with modes whose mode at the end of the horizon serves traffic */
  servicesAvailable: string[];
}
