/**
 * Represents a distinct type.
 *
 * This type is used to create new types based on existing ones, but with a
 * unique identifier. This can be useful for creating types that are
 * semantically different but structurally the same.
 * @template T The base type from which the distinct type is created.
 * @template DistinctName A unique identifier for the distinct type.
 * __TYPE__ A property that holds the unique identifier for the
 * distinct type.
 */
type Distinct<T, DistinctName> = T & { __TYPE__: DistinctName };

/** Frequency in Hz */
export type Hertz = Distinct<number, 'Hertz'>;
/** Frequency in Mhz */
export type MHz = Distinct<number, 'MHz'>;
/** Radio Frequency in Hz */
export type RfFrequency = Distinct<Hertz, 'RfFrequency'>;
/** Intermediate Frequency in Hz */
export type IfFrequency = Distinct<Hertz, 'IfFrequency'>;

export interface RfSignal {
  /** Signal ID */
  id: string;
  /** Server ID */
  serverId: number;
  /** Target satellite ID */
  noradId: number;
  /** RF frequency */
  frequency: RfFrequency;
  /** Signal polarization */
  polarization: 'H' | 'V' | 'LHCP' | 'RHCP';
  /** Signal power in dBm */
  power: number;
  /** Bandwidth in Hz */
  bandwidth: Hertz;
  /** Modulation type */
  modulation: ModulationType;
  /** Forward Error Correction type */
  fec: FECType;
  /** url of the video feed */
  feed: string;
  /** whether the signal is an image instead of a video */
  isImage?: boolean;
  /** whether the signal is from an external source */
  isExternal?: boolean;
  /** whether the signal is degraded */
  isDegraded: boolean;
}

export interface IfSignal {
  /** Signal ID */
  id: string;
  /** Server ID */
  serverId: number;
  /** Target satellite ID */
  noradId: number;
  /** RF frequency */
  frequency: IfFrequency;
  /** Signal power in dBm */
  power: number;
  /** Bandwidth in Hz */
  bandwidth: Hertz;
  /** Modulation type */
  modulation: ModulationType;
  /** Forward Error Correction type */
  fec: FECType;
  /** url of the video feed */
  feed: string;
  /** whether the signal is degraded */
  isDegraded: boolean;
  /** whether the signal is an image instead of a video */
  isImage?: boolean;
  /** whether the signal is from an external source */
  isExternal?: boolean;
}

export interface Satellite {
  /** NORAD Satellite Catalog Id */
  noradId: number;
  /** Satellite  Name */
  name: string;
  /** Frequency offset */
  offset: number; // Hz
}

export interface Team {
  id: number;
  name: string;
}

export interface Server {
  id: number;
  name: string;
}

export type ModulationType = 'BPSK' | 'QPSK' | '8QAM' | '16QAM' | 'null';
export type FECType = '1/2' | '2/3' | '3/4' | '5/6' | '7/8' | 'null';

export interface User {
  id: number;
  team_id: number;
  server_id: number;
  username?: string;
}