/**
 * @file physical-plant-types - Data types for the C6 physical-layer plant
 * @description Config (authored in a scenario's `settings.physicalPlant`), the
 * fault model, verb results and the checkpoint state. No DOM and no engine
 * imports, so the Core class runs in plain unit tests.
 */

/** What a part is. Drives defaults (boot time, power role). */
export type PlantPartKind = 'strip' | 'terminal' | 'router' | 'battery' | 'generator' | 'dish' | 'modem' | 'client';

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
 * - part: generator-sag, generator-noise, out-of-fuel, brick-dead, battery-depleted, snow, net
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
  | 'net';

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

export interface PlantConfig {
  /** Station whose RF chain the plant degrades when a connector/cable has no stationId */
  stationId?: string;
  parts: PlantPartConfig[];
  connectors: PlantConnectorConfig[];
  cables: PlantCableConfig[];
  /** Scenario spares; when set they win over the trainer override and the defaults */
  spares?: PlantSpares;
  faults?: PlantFault[];
  /**
   * Which plant part feeds each engine device's powered state. Defaults:
   * antenna 'vsat-dish', lnb 'vsat-dish', modem 'vsat-modem'. Model the LNB as
   * its own part (poweredBy the modem, viaCable the IFL) when the antenna drive
   * must keep power with the IFL cut.
   */
  engineMap?: Partial<Record<'antenna' | 'lnb' | 'modem', string>>;
  /** Outdoor trips allowed before the instructor notices (default 3) */
  tripLimit?: number;
}

export type SpaceyStatus = 'booting' | 'online' | 'obstructed' | 'heating' | 'thermal-shutdown' | 'no-power';

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

/** JSON-safe checkpoint of the manager (times are absolute scenario seconds) */
export interface PlantState {
  faults: PlantFaultSnapshot[];
  sealed: string[];
  /** Fault ids that existed and were removed (fix, recharge or trainer) */
  clearedFaultIds: string[];
  /** Facts the player has observed, as `<target>|<fact>` (optional in older checkpoints) */
  revealedFacts?: string[];
  spares: PlantSpares;
  trainerSpares: PlantSpares | null;
  rebootUntilS: Record<string, number>;
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
}
