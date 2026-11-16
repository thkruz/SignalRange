import type { AntennaState } from '@app/equipment/antenna';
import type { AntennaConfigId } from '@app/equipment/antenna/antenna-registry';
import type { RealTimeSpectrumAnalyzerState } from '@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer';
import type { ReceiverState } from '@app/equipment/receiver/receiver';
import type { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';
import type { TransmitterState } from '@app/equipment/transmitter/transmitter';

/**
 * Ground station location information
 */
export interface GroundStationLocation {
  latitude: number; // degrees
  longitude: number; // degrees
  elevation: number; // meters above sea level
}

/**
 * Ground station equipment collection state
 */
export interface GroundStationEquipmentState {
  antennas: AntennaState[];
  rfFrontEnds: RFFrontEndState[];
  spectrumAnalyzers: RealTimeSpectrumAnalyzerState[];
  transmitters: TransmitterState[];
  receivers: ReceiverState[];
}

/**
 * Complete ground station state
 */
export interface GroundStationState {
  uuid: string;
  id: string; // "MIA-01"
  name: string; // "Miami Ground Station"
  location: GroundStationLocation;
  isOperational: boolean;
  equipment: Partial<GroundStationEquipmentState>;
  /** Station class (see GroundStationConfig.stationClass); undefined = professional */
  stationClass?: 'professional' | 'backyard' | 'field';
}

/**
 * Configuration for creating a ground station
 */
export interface GroundStationConfig {
  id: string;
  name: string;
  isOperational?: boolean;
  location: GroundStationLocation;
  antennas: string[]; // Antenna config IDs
  /**
   * Antenna hardware config actually instantiated by mission control.
   * Opt-in: when omitted the factory default is used, preserving legacy
   * campaign behavior (the `antennas` array above is not applied there).
   */
  antennaConfigKey?: AntennaConfigId;
  antennasState?: Partial<AntennaState>[]; // Initial antenna states (parallel to antennas array)
  rfFrontEnds: Partial<RFFrontEndState>[]; // RF front-end configs
  spectrumAnalyzers?: Partial<RealTimeSpectrumAnalyzerState>[]; // Spectrum analyzer configs (optional)
  transmitters?: Partial<TransmitterState>[]; // Initial transmitter states (optional, parallel to transmitters)
  receivers?: Partial<ReceiverState>[]; // Initial receiver states (optional, parallel to receivers)
  teamId?: number;
  serverId?: number;
  /**
   * Station class. Opt-in: 'backyard' (Campaign 3+) enables the hobbyist SDR
   * Console tab and hides the TX chain; 'field' (Campaign 6) shows only the Site
   * tab plus plugin station tabs, with the engineering tabs behind a trainer unlock; when omitted the station renders as a
   * professional site exactly as before.
   */
  stationClass?: 'professional' | 'backyard' | 'field';
  /**
   * The station's ACU tag (phase 27, r2-s11-F2). Omitted: derived from the
   * station number in `id` ('ME-02' -> 'ACU-02'), so two sites never both
   * read ACU-01. An antenna state's own `acuSerialNumber` wins.
   */
  acuSerialNumber?: string;
}
