/**
 * @file ham-station-config - Authored station configuration for Campaign 3 (ham-sdr)
 * @description `settings.hamStation` on a scenario. Everything a C3 station needs: operator,
 * locations, devices, initial wiring, baseline faults, authored emitters, optional operating
 * blocks fed to the ops models, worksheets and reference cards. Fictional call signs only.
 */

import type { DcFault, DcSystemOptions } from './dc/dc-power-system';
import type { ConnectorFamily, ConnectorGender, HamConnection, HamDeviceKind, HamFault, HamLocationDef, HamLocationId, HamMode, LocalPosition, RadioSettings } from './ham-types';
import type { DmrRepeaterConfig } from './ops/dmr';
import type { HfConfig } from './ops/hf-propagation';
import type { NetControlConfig } from './ops/net-control';
import type { PacketAudioConfig, PacketNodeConfig, PacketStationConfig } from './ops/packet';
import type { BusyWindow, RemoteStationConfig } from './ops/qso-machine';
import type { RepeaterConfig } from './ops/repeater';
import type { SatLinkConfig } from './ops/satellite-link';
import type { AntennaKind, AntennaState } from './rf/antenna-model';
import type { CoaxFault, CoaxTypeId } from './rf/feedline';

export const HAM_STATION_SCHEMA = 'c3-tech-v1';

export type ConnectorEnd = { family: ConnectorFamily; gender: ConnectorGender };

export interface HamDeviceConfig {
  id: string;
  kind: HamDeviceKind;
  label: string;
  location: HamLocationId;
  /** Capability profile id from HAM_PROFILES (radios and SDRs) */
  profileId?: string;
  powered?: boolean;
  radio?: Partial<RadioSettings>;
  antenna?: { kind: AntennaKind; overrides?: Partial<AntennaState> };
  coax?: { type: CoaxTypeId; length: number; unit?: 'ft' | 'm'; fault?: CoaxFault | null; endA?: ConnectorEnd; endB?: ConnectorEnd };
  /** Adapter sides (kind 'adapter') */
  adapter?: { a: ConnectorEnd; b: ConnectorEnd };
  /** Terminal connector for antennas, loads and analyzers (default UHF jack; SMA plug for rubber ducks) */
  connector?: ConnectorEnd;
  /** Overrides the location's default position */
  position?: LocalPosition;
  /** A DC system (power-supply or battery device) and the mobile radio it feeds */
  dcSystem?: DcSystemOptions & { radioId: string; faults?: DcFault[] };
  /** This device is the practice circuit board */
  board?: true;
  /** Packet sound-card interface defaults */
  audioInterface?: Partial<PacketAudioConfig>;
  /** Noise source (kind 'noise-source', or any device that radiates RFI while powered) */
  noise?: { psdDbmHzAt1m: number; supplyId?: string; conductedBoostDb?: number; reflection?: { bearingOffsetDeg: number; extraLossDb: number } };
  dummyLoad?: { ratedW: number; ratedSeconds: number };
  calLoad?: { ratedW: number };
  /** Duplexer-kind devices: isolation between its ports, dB (default 60; a passive splitter is about 6) */
  isolationDb?: number;
  /** Spare fuse rating, A (spares only) */
  fuseRatingA?: number;
  /** Text shown by `inspect` when no fault clue applies */
  inspectNote?: string;
  /** Spares sit on the shelf until `install` */
  spare?: boolean;
}

/** How a baseline fault clears. Auto kinds clear when the simulation sees the fix. */
export type FaultClearing = { action: 'repair' } | { action: 'install'; spareKind?: HamDeviceKind } | { action: 'seat' } | { action: 'auto' };

export interface HamFaultConfig extends Omit<HamFault, 'cleared' | 'clearedAtS'> {
  inspectClue: string;
  clearedBy: FaultClearing;
  /** Repairs refused while the target is energized */
  deenergizeToRepair?: boolean;
}

export interface EmitterSchedule {
  periodS: number;
  onS: number;
  offsetS: number;
}

export interface AuthoredEmitter {
  id: string;
  label: string;
  freqMHz: number;
  mode: HamMode;
  erpDbm: number;
  position: LocalPosition;
  polarization: 'V' | 'H' | 'RHCP' | 'LHCP';
  bandwidthHz?: number;
  ctcssHz?: number | null;
  /** Absent = continuous */
  schedule?: EmitterSchedule;
  /** First on-air time, scenario seconds (default 0) */
  startS?: number;
  payload: { kind: 'voice' | 'cw' | 'ft8' | 'carrier' | 'noise' | 'packet'; text?: string; callsign?: string };
}

export interface WorksheetField {
  id: string;
  label: string;
  kind: 'choice' | 'number' | 'match';
  options?: string[];
  /** choice: option text; number: value; match: record of left -> right */
  answer: string | number | Record<string, string>;
  tolerance?: number;
}

export interface Worksheet {
  id: string;
  title: string;
  prompt: string;
  figureUrl?: string;
  fields: WorksheetField[];
  explanation: string;
  /** Per-field feedback when that field is wrong */
  wrongFeedback?: Record<string, string>;
}

export interface ReferenceCard {
  id: string;
  title: string;
  body: string;
  imageUrl?: string;
}

type Wired<T> = Omit<T, 'hears' | 'playerCallsign' | 'revision'>;

export interface PacketBlock {
  radioId: string;
  node: PacketNodeConfig;
  audio?: Partial<PacketAudioConfig>;
  station?: Partial<PacketStationConfig>;
  t1S?: number;
  n2?: number;
  workingPtt?: PacketAudioConfig['ptt'][];
}

export interface SatelliteBlock extends Wired<SatLinkConfig> {
  /** Satellite whose geometry drives the pass (SimulationManager in the app, scripted in tests) */
  satelliteNoradId: number;
  /** Uplink/downlink isolation, dB (ISOLATION_DB values) */
  isolationDb?: number;
  /** When set, isolation is derived from the live wiring of these two radios each time the uplink keys */
  wiring?: { txRadioId: string; rxRadioId: string };
}

export interface EnergyPlan {
  /** DC device whose battery is budgeted */
  dcDeviceId: string;
  reserveWh: number;
  /** Card values for the worksheet (display only) */
  card?: Record<string, number | string>;
}

export interface HamStationConfig {
  schema: typeof HAM_STATION_SCHEMA;
  pauseOnQuiz: boolean;
  seed: number;
  operator: { license: 'none' | 'technician'; callsign: string; name: string };
  locations: (HamLocationDef & { position?: LocalPosition })[];
  startLocation: HamLocationId;
  /** Default position of the station when a location has none */
  stationPosition: LocalPosition;
  devices: HamDeviceConfig[];
  connections: HamConnection[];
  faults: HamFaultConfig[];
  emitters: AuthoredEmitter[];
  remoteStations?: { stations: RemoteStationConfig[]; busy?: BusyWindow[]; audioCheck?: boolean };
  repeater?: Wired<RepeaterConfig>;
  dmr?: Omit<DmrRepeaterConfig, 'hears'>;
  packet?: PacketBlock;
  hf?: Wired<HfConfig>;
  satellite?: SatelliteBlock;
  net?: Omit<NetControlConfig, 'hears' | 'playerCallsign'>;
  energyPlan?: EnergyPlan;
  worksheets: Worksheet[];
  cards: ReferenceCard[];
  /**
   * Optional hint text per objective id, shown by the Station tab's "Ask Riley" button.
   * An array gives staged hints (subsystem, measurement, interpretation): each request reveals the next.
   */
  hints?: Record<string, string | string[]>;
  /** Seat refused while a powered radio/receiver is on that connection */
  seatRequiresPowerOff?: boolean;
}
