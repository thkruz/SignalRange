/**
 * TypeScript Type Definitions
 */

export interface AntennaConfig {
  band: string;
  upconvert: number; // Hz
  downconvert: number; // Hz
}

export interface Satellite {
  id: number;
  name: string;
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

export interface AntennaState {
  id: number;
  unit: number;
  team_id: number;
  server_id: number;
  target_id: number;
  band: number; // 0 = C, 1 = Ku
  offset: number; // MHz
  hpa: boolean; // High Powered Amplifier
  loopback: boolean;
  locked: boolean;
  track: boolean;
  operational: boolean;
}

export interface TransmitterState {
  id: number;
  unit: number; // Case number 1-4
  modem_number: number; // Modem within case 1-4
  team_id: number;
  server_id: number;
  antenna_id: number;
  frequency: number; // MHz
  bandwidth: number; // MHz
  power: number; // dBm
  transmitting: boolean;
}

export interface ReceiverState {
  id: number;
  unit: number; // Case number 1-4
  modem_number: number; // Modem within case 1-4
  team_id: number;
  server_id: number;
  antenna_id: number;
  frequency: number; // MHz
  bandwidth: number; // MHz
  modulation: ModulationType;
  fec: FECType;
  found: boolean;
  degraded: boolean;
  denied: boolean;
}

export interface SignalState {
  id: number;
  team_id: number;
  target_id: number;
  frequency: number; // MHz
  bandwidth: number; // MHz
  power: number; // dBm
  modulation: ModulationType;
  fec: FECType;
  feed: string; // video feed filename
  transmitting: boolean;
}

export type ModulationType = 'BPSK' | 'QPSK' | '8QAM' | '16QAM';
export type FECType = '1/2' | '2/3' | '3/4' | '5/6' | '7/8';

export interface User {
  id: number;
  team_id: number;
  server_id: number;
  username?: string;
}