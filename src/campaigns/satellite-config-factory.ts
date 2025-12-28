import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import type { Satellite, Transponder } from '@app/equipment/satellite/satellite';
import { SignalOrigin } from '@app/signal-origin';
import type { dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from './rf-front-end-factory';

/**
 * Options for configuring ground station equipment for a satellite.
 */
export interface SatelliteConfigOptions {
  /** Transponder ID to use (default: 'TP-1') */
  transponderId?: string;

  /** TX modem signal parameters */
  txSignal?: {
    modulation?: ModulationType;
    fec?: FECType;
    power?: dBm;
  };

  /** RX modem signal parameters */
  rxSignal?: {
    modulation?: ModulationType;
    fec?: FECType;
  };

  /** Fixed LNB LO frequency in MHz (default: 5250 MHz for C-band) */
  lnbLoFrequency?: MHz;
}

/**
 * Result of satellite configuration calculation.
 * Contains all parameters needed to configure ground station equipment.
 */
export interface SatelliteConfigResult {
  /** Antenna configuration for tracking the satellite */
  antenna: {
    targetSatelliteId: number;
    targetAzimuth: Degrees;
    targetElevation: Degrees;
    targetPolarization: Degrees;
    beaconFrequencyHz: Hertz;
  };

  /** BUC LO frequency required for uplink (lower sideband: RF = LO - IF) */
  bucLoFrequency: MHz;

  /** LNB LO frequency for downlink (high-side injection: IF = LO - RF) */
  lnbLoFrequency: MHz;

  /** TX modem IF configuration */
  txModem: {
    frequency: IfFrequency;
    bandwidth: Hertz;
    modulation: ModulationType;
    fec: FECType;
    power: dBm;
    noradId: number;
  };

  /** RX modem IF configuration */
  rxModem: {
    frequency: MHz;
    bandwidth: MHz;
    modulation: ModulationType;
    fec: FECType;
  };

  /** Spectrum analyzer configuration for beacon observation */
  spectrumAnalyzer: {
    centerFrequency: Hertz;
  };

  /** Calculated frequencies for reference */
  calculated: {
    uplinkCenterFrequency: RfFrequency;
    downlinkCenterFrequency: RfFrequency;
    beaconFrequency: RfFrequency | null;
  };
}

/** Default configuration values */
const DEFAULTS = {
  transponderId: 'TP-1',
  lnbLoFrequency: 5250 as MHz,
  targetIfCenter: 1100, // MHz - center of target IF range
  txSignal: {
    modulation: 'QPSK' as ModulationType,
    fec: '3/4' as FECType,
    power: -7 as dBm,
  },
  rxSignal: {
    modulation: 'QPSK' as ModulationType,
    fec: '3/4' as FECType,
  },
};

/**
 * Find a transponder by ID from a satellite.
 * @throws Error if transponder not found
 */
function getTransponder(satellite: Satellite, transponderId: string): Transponder {
  const transponder = satellite.transponders.find(tp => tp.id === transponderId);
  if (!transponder) {
    const availableIds = satellite.transponders.map(tp => tp.id).join(', ');
    throw new Error(
      `Transponder '${transponderId}' not found on satellite ${satellite.name}. ` +
      `Available transponders: ${availableIds}`
    );
  }
  return transponder;
}

/**
 * Calculate BUC LO frequency to place IF in the target range.
 * BUC uses lower sideband: RF = LO - IF, so LO = RF + IF
 *
 * @param uplinkCenterHz - Uplink center frequency in Hz
 * @returns BUC LO frequency in MHz
 */
function calculateBucLo(uplinkCenterHz: number): MHz {
  const uplinkCenterMhz = uplinkCenterHz / 1e6;
  // Target IF around 1100 MHz (middle of 950-1500 MHz range)
  const bucLo = Math.round(uplinkCenterMhz + DEFAULTS.targetIfCenter);
  return bucLo as MHz;
}

/**
 * Calculate IF frequency from RF and LO.
 * Uses high-side injection: IF = LO - RF
 *
 * @param rfHz - RF frequency in Hz
 * @param loMhz - LO frequency in MHz
 * @returns IF frequency in MHz
 */
function calculateIfFrequency(rfHz: number, loMhz: MHz): number {
  const rfMhz = rfHz / 1e6;
  return loMhz - rfMhz;
}

/**
 * Configure ground station equipment for communication with a satellite transponder.
 *
 * Calculates all necessary frequencies and returns configuration parameters.
 * Does NOT mutate any existing state - returns a new configuration object.
 *
 * @param satellite - Target satellite instance
 * @param options - Configuration options
 * @returns Configuration result with all calculated parameters
 * @throws Error if transponder not found
 *
 * @example
 * const config = configureGroundStationForSatellite(tidemark2Satellite, {
 *   transponderId: 'TP-1',
 *   txSignal: { power: -7 as dBm }
 * });
 *
 * // Use with createRfFrontEnd for scenario setup
 * const rfFrontEnd = createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
 *   buc: { loFrequency: config.bucLoFrequency },
 * });
 */
export function configureGroundStationForSatellite(
  satellite: Satellite,
  options: SatelliteConfigOptions = {}
): SatelliteConfigResult {
  const transponderId = options.transponderId ?? DEFAULTS.transponderId;
  const lnbLo = options.lnbLoFrequency ?? DEFAULTS.lnbLoFrequency;

  // Get transponder configuration
  const transponder = getTransponder(satellite, transponderId);

  // Calculate BUC LO for uplink
  const bucLo = calculateBucLo(transponder.uplinkFrequency);

  // Calculate TX IF: IF = BUC_LO - uplink_center (lower sideband)
  const txIfMhz = calculateIfFrequency(transponder.uplinkFrequency, bucLo);
  const txIfHz = txIfMhz * 1e6;

  // Calculate RX IF: IF = LNB_LO - downlink_center (high-side injection)
  const rxIfMhz = calculateIfFrequency(transponder.downlinkFrequency, lnbLo);

  // Calculate beacon IF if beacon exists
  const beaconFrequency = transponder.beacon?.frequency ?? null;
  let beaconIfHz: Hertz | null = null;
  if (beaconFrequency) {
    const beaconIfMhz = calculateIfFrequency(beaconFrequency, lnbLo);
    beaconIfHz = (beaconIfMhz * 1e6) as Hertz;
  }

  // Merge signal options with defaults
  const txSignal = { ...DEFAULTS.txSignal, ...options.txSignal };
  const rxSignal = { ...DEFAULTS.rxSignal, ...options.rxSignal };

  // Convert bandwidth to MHz for receiver
  const bandwidthMhz = (transponder.bandwidth / 1e6) as MHz;

  return {
    antenna: {
      targetSatelliteId: satellite.noradId,
      targetAzimuth: satellite.az,
      targetElevation: satellite.el,
      targetPolarization: satellite.rotation,
      beaconFrequencyHz: (beaconFrequency ?? 0) as Hertz,
    },
    bucLoFrequency: bucLo,
    lnbLoFrequency: lnbLo,
    txModem: {
      frequency: txIfHz as IfFrequency,
      bandwidth: transponder.bandwidth,
      modulation: txSignal.modulation,
      fec: txSignal.fec,
      power: txSignal.power,
      noradId: satellite.noradId,
    },
    rxModem: {
      frequency: rxIfMhz as MHz,
      bandwidth: bandwidthMhz,
      modulation: rxSignal.modulation,
      fec: rxSignal.fec,
    },
    spectrumAnalyzer: {
      centerFrequency: beaconIfHz ?? (0 as Hertz),
    },
    calculated: {
      uplinkCenterFrequency: transponder.uplinkFrequency,
      downlinkCenterFrequency: transponder.downlinkFrequency,
      beaconFrequency: beaconFrequency as RfFrequency | null,
    },
  };
}

/**
 * Options for applying satellite configuration to a ground station.
 */
export interface ApplyConfigOptions {
  /** Index of the antenna to configure (default: 0) */
  antennaIndex?: number;
  /** Index of the RF front-end to configure (default: 0) */
  rfFrontEndIndex?: number;
  /** Whether to create transmitter modem if none exists (default: true) */
  createTransmitter?: boolean;
  /** Whether to create receiver modem if none exists (default: true) */
  createReceiver?: boolean;
}

/**
 * Apply satellite configuration to a ground station, returning a new config.
 *
 * This is a convenience function that applies all the calculated values
 * from `configureGroundStationForSatellite` to a ground station config.
 *
 * @param groundStation - Base ground station configuration
 * @param satConfig - Satellite configuration result
 * @param options - Options for applying the configuration
 * @returns New ground station configuration with satellite settings applied
 *
 * @example
 * const satConfig = configureGroundStationForSatellite(tidemark2Satellite);
 * const configuredStation = applyConfigToGroundStation(
 *   vermontGroundStation,
 *   satConfig
 * );
 */
export function applyConfigToGroundStation(
  groundStation: GroundStationConfig,
  satConfig: SatelliteConfigResult,
  options: ApplyConfigOptions = {}
): GroundStationConfig {
  const {
    antennaIndex = 0,
    rfFrontEndIndex = 0,
    createTransmitter = true,
    createReceiver = true,
  } = options;

  // Clone ground station to avoid mutation
  const result = { ...groundStation };

  // Update antenna state
  if (groundStation.antennasState?.[antennaIndex]) {
    result.antennasState = [...(groundStation.antennasState ?? [])];
    result.antennasState[antennaIndex] = {
      ...groundStation.antennasState[antennaIndex],
      targetSatelliteId: satConfig.antenna.targetSatelliteId,
      targetAzimuth: satConfig.antenna.targetAzimuth,
      targetElevation: satConfig.antenna.targetElevation,
      targetPolarization: satConfig.antenna.targetPolarization,
      azimuth: satConfig.antenna.targetAzimuth,
      elevation: satConfig.antenna.targetElevation,
      polarization: satConfig.antenna.targetPolarization,
      beaconFrequencyHz: satConfig.antenna.beaconFrequencyHz,
    };
  }

  // Update RF front-end (BUC LO)
  if (groundStation.rfFrontEnds?.[rfFrontEndIndex]) {
    result.rfFrontEnds = [...groundStation.rfFrontEnds];
    result.rfFrontEnds[rfFrontEndIndex] = createRfFrontEnd(
      groundStation.rfFrontEnds[rfFrontEndIndex],
      {
        buc: { loFrequency: satConfig.bucLoFrequency },
        lnb: { loFrequency: satConfig.lnbLoFrequency },
      }
    );
  }

  // Update spectrum analyzer
  if (groundStation.spectrumAnalyzers?.[0] && satConfig.spectrumAnalyzer.centerFrequency) {
    result.spectrumAnalyzers = [...groundStation.spectrumAnalyzers];
    result.spectrumAnalyzers[0] = {
      ...groundStation.spectrumAnalyzers[0],
      centerFrequency: satConfig.spectrumAnalyzer.centerFrequency,
    };
  }

  // Update or create transmitter
  if (createTransmitter) {
    const existingTx = groundStation.transmitters?.[0];
    const existingModem = existingTx?.modems?.[0];

    result.transmitters = [{
      activeModem: 1,
      modems: [{
        isPowered: true,
        antenna_id: 1,
        modem_number: 1,
        isFaulted: false,
        isTransmitting: existingModem?.isTransmitting ?? false,
        isTransmittingSwitchUp: existingModem?.isTransmittingSwitchUp ?? false,
        isFaultSwitchUp: false,
        id: 1,
        isLoopback: false,
        ifSignal: {
          signalId: `${satConfig.txModem.noradId}-Teleport`,
          serverId: 1,
          noradId: satConfig.txModem.noradId,
          polarization: 'V',
          feed: '',
          isDegraded: false,
          origin: SignalOrigin.TRANSMITTER,
          noiseFloor: null,
          gainInPath: 0 as dBi,
          frequency: satConfig.txModem.frequency,
          power: satConfig.txModem.power,
          bandwidth: satConfig.txModem.bandwidth,
          modulation: satConfig.txModem.modulation,
          fec: satConfig.txModem.fec,
        },
      }],
    }];
  }

  // Update or create receiver
  if (createReceiver) {
    result.receivers = [{
      activeModem: 1,
      modems: [{
        modemNumber: 1,
        isPowered: true,
        frequency: satConfig.rxModem.frequency,
        bandwidth: satConfig.rxModem.bandwidth,
        modulation: satConfig.rxModem.modulation,
        fec: satConfig.rxModem.fec,
        antenna_id: 1,
      }],
    }];
  }

  return result;
}
