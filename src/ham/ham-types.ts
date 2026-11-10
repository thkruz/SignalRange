/**
 * @file ham-types - Shared contract of the Campaign 3 amateur-radio layer (Phase 42)
 * @description Every ham sub-model (DC, RF path, reception, operations) speaks
 * these types so the HamStationManager can compose them. All state here is plain
 * JSON: it is what a checkpoint stores. Nothing in this folder touches the DOM.
 *
 * Units: frequencies in Hz unless a name says MHz/kHz, power in W or dBm as
 * named, time in scenario seconds (paused while a C3 quiz is open).
 */

/** Emission/receive modes the ham layer models (bounded, not DSP) */
export type HamMode = 'FM' | 'AM' | 'USB' | 'LSB' | 'CW' | 'DMR' | 'PKT' | 'FT8';

/** Physical connector families. A plug mates with its jack of the same family. */
export type ConnectorFamily =
  | 'SMA' // handheld antenna port, SDR input
  | 'BNC'
  | 'UHF' // PL-259 plug / SO-239 jack
  | 'N'
  | 'USB-A'
  | 'USB-C'
  | 'POWERPOLE' // Anderson 30 A, genderless
  | 'BATTERY-CONTACTS' // handheld pack contacts, only mates with its own pack
  | 'MINI-DIN-6' // radio data port
  | 'TRS-3.5' // headphone / audio
  | 'BANANA' // meter probes and board test points
  | 'BINDING-POST'; // supply terminals

export type ConnectorGender = 'plug' | 'jack' | 'genderless';

export type PortRole = 'rf' | 'dc-in' | 'dc-out' | 'usb-host' | 'usb-device' | 'audio' | 'data' | 'probe' | 'test-point';

export interface PortDef {
  id: string;
  label: string;
  family: ConnectorFamily;
  gender: ConnectorGender;
  role: PortRole;
}

/** A frequency range in MHz, inclusive */
export type MHzRange = readonly [number, number];

/**
 * What a piece of hardware can do. Receive coverage, hardware transmit ability
 * and the operator's legal privileges are three separate questions: this type
 * answers only the first two. Privileges live in ham-privileges.ts.
 */
export interface HamCapabilityProfile {
  id: string;
  label: string;
  /** Reference family the generic profile is informed by (not an emulation) */
  referenceFamily: string;
  kind: HamDeviceKind;
  rxRangesMHz: readonly MHzRange[];
  rxModes: readonly HamMode[];
  /** Empty = receive-only hardware. Never derived from rxRanges. */
  txRangesMHz: readonly MHzRange[];
  txModes: readonly HamMode[];
  /** Selectable RF output steps, W (empty for receive-only) */
  txPowerStepsW: readonly number[];
  /** half = cannot hear while transmitting; none = no transmitter */
  duplex: 'none' | 'half' | 'full';
  ports: readonly PortDef[];
  power: HamPowerSpec;
  features: HamFeatureSet;
}

export type HamDeviceKind =
  | 'sdr'
  | 'handheld'
  | 'mobile'
  | 'dmr-handheld'
  | 'hf-rig'
  | 'laptop'
  | 'power-supply'
  | 'battery'
  | 'charger'
  | 'multimeter'
  | 'swr-meter'
  | 'dummy-load'
  | 'cal-load'
  | 'analyzer'
  | 'antenna'
  | 'coax'
  | 'dc-lead'
  | 'adapter'
  | 'audio-interface'
  | 'circuit-board'
  | 'noise-source'
  | 'duplexer'
  | 'headphones';

/**
 * How a device is powered. `passive` devices (antennas, coax, loads) never need
 * electrical power: an antenna does not go dead because its radio is off.
 */
export interface HamPowerSpec {
  source: 'passive' | 'internal-battery' | 'external-dc' | 'usb-bus' | 'mains';
  nominalV?: number;
  /** Lowest supply voltage at which the device keeps running (brownout threshold) */
  minOperatingV?: number;
  /** Highest safe input voltage */
  maxInputV?: number;
  /** Operating-point currents, A (authored training fixtures, not specs) */
  rxCurrentA?: number;
  txCurrentA?: number;
  /** For battery-powered handhelds: pack energy, Wh */
  packWh?: number;
  /** Average draw while receiving / transmitting, W (handheld energy accounting) */
  rxW?: number;
  txW?: number;
}

export interface HamFeatureSet {
  ctcss?: boolean;
  dcs?: boolean;
  memories?: number;
  dmr?: boolean;
  rit?: boolean;
  scan?: boolean;
  keyLock?: boolean;
  dataPort?: boolean;
  /** Waterfall/wideband display (SDR software) */
  waterfall?: boolean;
  directSampling?: boolean;
}

/** Repeater offset direction as radios label it */
export type OffsetDirection = 'simplex' | 'plus' | 'minus';

export interface MemoryChannel {
  slot: number;
  name: string;
  rxMHz: number;
  offset: OffsetDirection;
  offsetKHz: number;
  txToneHz: number | null;
  rxToneHz: number | null;
  mode: HamMode;
}

export interface DmrChannel {
  name: string;
  rxMHz: number;
  txMHz: number;
  colorCode: number;
  timeSlot: 1 | 2;
  talkgroup: number;
}

/** Operator-adjustable radio settings (union over radio kinds; unused fields stay default) */
export interface RadioSettings {
  vfoMHz: number;
  mode: HamMode;
  /** Demodulator (IF) filter bandwidth, Hz. Distinct from the SDR display span. */
  filterHz: number;
  /** SDR display span, Hz */
  spanHz: number;
  /** 0 = open, 10 = tightest. Threshold maps to dBm in the reception model. */
  squelch: number;
  /** 0..10 */
  volume: number;
  rfGainDb: number;
  txPowerW: number;
  offset: OffsetDirection;
  offsetKHz: number;
  txToneHz: number | null;
  rxToneHz: number | null;
  memories: MemoryChannel[];
  /** null = VFO mode */
  activeMemory: number | null;
  monitor: boolean;
  keyLock: boolean;
  ritHz: number;
  ritOn: boolean;
  /** Microphone/audio drive, 0..10; 5 = clean nominal */
  micGain: number;
  codeplug: DmrChannel[];
  activeDmrChannel: number | null;
  /** SDR frequency correction, ppm */
  ppm: number;
}

/** Where a device sits. Scenarios choose which locations exist. */
export type HamLocationId = 'bench' | 'yard' | 'club';

export interface HamLocationDef {
  id: HamLocationId;
  label: string;
  description: string;
}

/** A fault seeded on a device, port, cable or connection */
export interface HamFault {
  id: string;
  target: string;
  kind:
    | 'loose-connector'
    | 'high-resistance-lead'
    | 'crushed-coax'
    | 'wet-connector'
    | 'open-switch-contact'
    | 'blown-fuse'
    | 'battery-unseated'
    | 'battery-depleted'
    | 'reversed-led'
    | 'usb-unplugged'
    | 'noisy-supply'
    | 'long-elements'
    | 'wrong-tone'
    | 'wrong-input-device'
    | 'overdriven-mic'
    | 'rf-feedback'
    | 'supply-current-limit';
  /** Fault-specific magnitude (ohms, dB, Hz...) */
  value?: number;
  cleared: boolean;
  clearedAtS?: number;
}

/** One physical cable or direct mating between two ports */
export interface HamConnection {
  id: string;
  a: { deviceId: string; portId: string };
  b: { deviceId: string; portId: string };
  /** A partly seated connector still "connects" but adds loss/resistance */
  seated: boolean;
}

/** Local planar position relative to the home station, km east/north, antenna height m */
export interface LocalPosition {
  xKm: number;
  yKm: number;
  heightM: number;
}

/** Content an emission carries, as the reception model reveals it */
export interface EmissionPayload {
  kind: 'voice' | 'packet' | 'cw' | 'ft8' | 'carrier' | 'noise' | 'dmr-voice';
  /** Transcript / decoded text */
  text?: string;
  /** Speaker call sign, when the transmission identifies */
  callsign?: string;
  /** Packet frame (AX.25-like) */
  frame?: PacketFrame;
}

export interface PacketFrame {
  src: string;
  dst: string;
  path: string[];
  /** 'I' info frame, 'RR' receive-ready ack, 'REJ' reject, 'UI' unconnected (APRS) */
  type: 'I' | 'RR' | 'REJ' | 'UI' | 'SABM' | 'UA' | 'DISC';
  ns?: number;
  nr?: number;
  info?: string;
  /** False when the frame check sequence fails at the receiver */
  fcsOk: boolean;
}

/** Something radiating right now, in the shared on-air model */
export interface OnAirEmission {
  id: string;
  /** Device id (player) or remote-station id */
  sourceId: string;
  isPlayer: boolean;
  freqHz: number;
  mode: HamMode;
  /** Occupied bandwidth, Hz */
  bandwidthHz: number;
  /** Effective radiated power, dBm (after feed loss, mismatch and antenna gain) */
  erpDbm: number;
  polarization: 'V' | 'H' | 'RHCP' | 'LHCP';
  /** Terrestrial source position; satellites use `viaSatellite` */
  position?: LocalPosition;
  viaSatellite?: string;
  /** Sub-audible access tone the emission carries, Hz */
  ctcssHz?: number | null;
  dmr?: { colorCode: number; timeSlot: 1 | 2; talkgroup: number };
  /** Audio drive 0..10 (affects clarity/deviation), 5 nominal */
  audioDrive?: number;
  payload: EmissionPayload;
  startS: number;
  endS: number | null;
}

/** One received-signal assessment the reception model returns */
export interface ReceptionResult {
  emissionId: string;
  rssiDbm: number;
  snrDb: number;
  /** Tuning error between receiver and emission, Hz */
  offsetHz: number;
  /** Squelch open for this signal (or monitor pressed) */
  squelchOpen: boolean;
  /** 0..1 how much of the content is understandable */
  intelligibility: number;
  /** Why intelligibility is reduced, most important first */
  impairments: ReceptionImpairment[];
  /** True when audio is actually reaching the operator's ears */
  audible: boolean;
}

export type ReceptionImpairment =
  | 'weak-signal'
  | 'mode-mismatch'
  | 'filter-too-narrow'
  | 'filter-too-wide'
  | 'off-frequency'
  | 'squelch-closed'
  | 'volume-zero'
  | 'tone-squelch-closed'
  | 'overload'
  | 'interference'
  | 'collision'
  | 'transmitting'
  | 'no-power'
  | 'no-antenna'
  | 'usb-disconnected'
  | 'fading'
  | 'desense';

/** A typed instrument reading. Stored with the configuration it was taken under. */
export interface HamMeasurement {
  id: string;
  tS: number;
  instrument: 'multimeter' | 'swr-meter' | 'analyzer' | 'receiver' | 'battery-monitor';
  /** e.g. 'DCV', 'DCA', 'OHM', 'CONT', 'FWD', 'REF', 'SWR', 'SWEEP', 'RSSI' */
  quantity: string;
  value: number;
  unit: 'V' | 'A' | 'Ω' | 'W' | 'ratio' | 'dBm' | 'dB' | 'MHz' | 'Wh';
  /** Probe/connection placement: e.g. { red: 'radio+', black: 'radio-' } or { at: 'radio-out' } */
  placement: Record<string, string>;
  /** Transmitting while measured (load condition) */
  underLoad: boolean;
  /** Station configuration revision the reading belongs to */
  revision: number;
  /** Extra context: frequency, termination, etc. */
  context?: Record<string, string | number | boolean>;
  note?: string;
}

/** A verified two-way contact, or an attempt at one */
export interface HamContactRecord {
  id: string;
  remoteId: string;
  remoteCallsign: string;
  path: 'simplex' | 'repeater' | 'dmr' | 'packet' | 'hf' | 'satellite' | 'net';
  freqMHz: number;
  mode: HamMode;
  startedS: number;
  /** Remote station actually decoded the player's call */
  remoteHeardPlayer: boolean;
  /** Player actually heard (intelligibly) the remote's reply */
  playerHeardRemote: boolean;
  /** Exchange items both sides completed: 'report', 'name', 'grid', 'message', 'ack' ... */
  exchanged: string[];
  /** Player identified with their call sign during the contact / at its end */
  identified: boolean;
  closed: boolean;
  completedS?: number;
  revision: number;
}

/** What the player does when keying: the content choice behind a transmission */
export type TxIntent =
  | { kind: 'cq' }
  | { kind: 'call'; target: string }
  | { kind: 'reply'; item: string }
  | { kind: 'identify' }
  | { kind: 'net-checkin' }
  | { kind: 'message'; text: string }
  | { kind: 'carrier' }
  | { kind: 'test' };

/** Result of trying to key a transmitter */
export interface TxAttempt {
  ok: boolean;
  /** Why the transmitter did not key, as operator-facing text */
  refusal?: string;
  refusalCode?:
    | 'hardware-band'
    | 'hardware-mode'
    | 'no-license'
    | 'privilege'
    | 'band-edge'
    | 'power-limit'
    | 'no-power'
    | 'no-antenna'
    | 'unsafe-termination'
    | 'locked'
    | 'receive-only';
}
