import type { AntennaState } from "@app/equipment/antenna";
import type { RealTimeSpectrumAnalyzerState } from "@app/equipment/real-time-spectrum-analyzer/real-time-spectrum-analyzer";
import type { ReceiverState } from "@app/equipment/receiver/receiver";
import type { RFFrontEndState } from "@app/equipment/rf-front-end/rf-front-end-core";
import type { TransmitterState } from "@app/equipment/transmitter/transmitter";

/**
 * Ground station location information
 */
export interface GroundStationLocation {
  latitude: number;   // degrees
  longitude: number;  // degrees
  elevation: number;  // meters above sea level
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
  id: string;                    // "MIA-01"
  name: string;                  // "Miami Ground Station"
  location: GroundStationLocation;
  isOperational: boolean;
  equipment: Partial<GroundStationEquipmentState>;
}

/**
 * Configuration for creating a ground station
 */
export interface GroundStationConfig {
  id: string;
  name: string;
  location: GroundStationLocation;
  antennas: string[];           // Antenna config IDs
  rfFrontEnds: any[];           // RF front-end configs
  spectrumAnalyzers?: any[];    // Spectrum analyzer configs (optional)
  transmitters?: number;        // Number of transmitters (default: 4)
  receivers?: number;           // Number of receivers (default: 4)
  teamId?: number;
  serverId?: number;
}
