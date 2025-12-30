import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { FrequencyBand } from '@app/constants';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { type CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from "@app/equipment/rf-front-end/coupler-module/tap-points";
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import type { Degrees } from 'ootk';

export const vermontGroundStation = {
  id: 'VT-01',
  name: 'Vermont Ground Station',
  location: {
    latitude: 44.5588,
    longitude: -72.5778,
    elevation: 2,
  },
  antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
  antennasState: [
    {
      // Antenna already tracking TIDEMARK-1 in program-track mode
      isPowered: true,
      azimuth: 161.8 as Degrees, // Locked on TIDEMARK-1
      elevation: 34.2 as Degrees,
      polarization: 14 as Degrees,
      trackingMode: 'program-track',
      isBeaconLocked: true,
      targetSatelliteId: 61525,
      targetAzimuth: 161.8 as Degrees,
      targetElevation: 34.2 as Degrees,
      targetPolarization: 14 as Degrees,
      slewing: false,
      beaconCN: 10.5 as dB,
      beaconFrequencyHz: 3902.5e6 as Hertz,
      isLocked: true,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [{
    omt: {
      isPowered: true,
      txPolarization: 'H',
      rxPolarization: 'V',
      effectiveTxPol: 'H',
      effectiveRxPol: 'V',
      crossPolIsolation: 28.5 as dB,
      isFaulted: false,
      insertionLoss: 0.5 as dB,
    },
    buc: {
      isPowered: true,
      isMuted: false,
      isLoopback: false,
      temperature: 25,
      currentDraw: 0,
      loFrequency: 6425 as MHz,
      filterHighHz: FrequencyBand.c.upHigh,
      filterLowHz: FrequencyBand.c.upLow,
      filterRejectionDb: 40 as dB,
      isExtRefLocked: true,
      frequencyError: 0,
      phaseLockRange: 10000,
      gain: 23 as dB,
      outputPower: -10 as dBm,
      saturationPower: 15 as dBm,
      gainFlatness: 0.5 as dB,
      groupDelay: 3,
      phaseNoise: -100,
      spuriousOutputs: [],
      noiseFloor: -140,
    },
    hpa: {
      isPowered: true,
      backOff: 10,
      outputPower: 50 as dBm,
      isOverdriven: false,
      imdLevel: -30,
      temperature: 45,
      isHpaEnabled: true,
      isHpaSwitchEnabled: true,
      noiseFloor: -140,
      gain: 44 as dB,
    },
    filter: {
      isPowered: true,
      bandwidthIndex: 13,
      bandwidth: 40 as MHz, // Only the index matters here
      insertionLoss: 2.0, // Only the index matters here
      noiseFloor: -101, // Only the index matters here
    },
    lnb: {
      isPowered: true,
      loFrequency: 5250 as MHz,
      gain: 60 as dB,
      lnaNoiseFigure: 0.6, // dB
      mixerNoiseFigure: 16.0, // dB
      noiseTemperature: 43, // K - stable
      noiseTemperatureStabilizationTime: 0, // Already stabilized
      isExtRefLocked: true, // Locked to GPSDO 10 MHz
      noiseFloor: -140, // dBm/Hz
      frequencyError: 0, // Hz
      temperature: 28, // °C - stable
      thermalStabilizationTime: 0, // Already stabilized
    },
    agc: {
      isPowered: true,
      isBypassed: false,
      targetLevel: -30 as dBm,
      currentGain: 10 as dB,
      inputPower: -80 as dBm,
      outputPower: -30 as dBm,
      attackTime: 10,
      releaseTime: 100,
      maxGain: 10 as dB,
      minGain: -60 as dB,
    },
    coupler: {
      isPowered: true,
      tapPointA: TapPoint.TX_IF,
      tapPointB: TapPoint.RX_IF,
      availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
      availableTapPointsB: [TapPoint.RX_IF],
      couplingFactorA: -40, // dB
      couplingFactorB: -39, // dB
      isActiveA: true,
      isActiveB: true,
    } as CouplerState,
    gpsdo: {
      isPowered: true,
      isLocked: true,
      warmupTimeRemaining: 0,
      temperature: 70, // °C - stable operating temp
      gnssSignalPresent: true,
      isGnssSwitchUp: true,
      isGnssAcquiringLock: false,
      satelliteCount: 8,
      utcAccuracy: 50, // ns
      constellation: 'GPS',
      lockDuration: 7200, // 2 hours locked
      frequencyAccuracy: 2e-11, // Excellent stability
      allanDeviation: 1e-11,
      phaseNoise: -110, // dBc/Hz
      isInHoldover: false,
      holdoverDuration: 0,
      holdoverError: 0,
      active10MHzOutputs: 3,
      max10MHzOutputs: 5,
      output10MHzLevel: 7, // dBm
      ppsOutputsEnabled: true,
      operatingHours: 8760, // 1 year of operation
      selfTestPassed: true,
      agingRate: 1e-10,
    },
  }],
  spectrumAnalyzers: [
    {
      referenceLevel: -91 as dBm, // Set for beacon observation
      centerFrequency: 1074.5e6 as Hertz, // IF frequency for beacon
      span: 2e3 as Hertz, // 2 kHz span for CW beacon
      rbw: 1e3 as Hertz, // 1 kHz RBW for CW beacon
      minAmplitude: -95 as dBm,
      maxAmplitude: -75 as dBm,
      scaleDbPerDiv: 10 as dB,
      screenMode: 'both',
      inputUnit: 'MHz',
      inputValue: '',

      // Multi-trace support
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 1
        { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 2
        { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 3
      ],
      selectedTrace: 1,
    }
  ],
  transmitters: [{
    activeModem: 1,
    modems: [{
      isPowered: true,
      antenna_id: 1,
      modem_number: 1,
      isFaulted: false,
      isTransmitting: true,
      isTransmittingSwitchUp: true,
      isFaultSwitchUp: false,
      id: 1,
      isLoopback: false,
      ifSignal: {
        signalId: 'TIDEMARK-1-Teleport',
        serverId: 1,
        noradId: 61525, polarization: 'V',
        feed: '',
        isDegraded: false,
        origin: SignalOrigin.TRANSMITTER,
        noiseFloor: null,
        gainInPath: 0 as dBi,
        frequency: 1094e6 as IfFrequency,
        power: -7 as dBm,
        bandwidth: 36e6 as Hertz, // Match payload bandwidth
        modulation: 'QPSK' as ModulationType,
        fec: '3/4' as FECType,
      },
    }],
  }],
  receivers: [{
    activeModem: 1,
    modems: [{
      modemNumber: 1,
      isPowered: true,
      frequency: 1532 as MHz, // IF frequency for 3718 MHz RF with 5150 MHz LO
      bandwidth: 36 as MHz, // Match payload bandwidth
      modulation: 'QPSK',
      fec: '3/4',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;

export const maineGroundStation = {
  id: 'ME-02',
  isOperational: false,
  name: 'Maine Ground Station',
  location: {
    latitude: 45.215214,
    longitude: -68.785507,
    elevation: 48,
  },
  antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
  rfFrontEnds: [{
    omt: {
      isPowered: true,
      txPolarization: 'H',
      rxPolarization: 'V',
      effectiveTxPol: 'H',
      effectiveRxPol: 'V',
      crossPolIsolation: 28.5 as dB,
      isFaulted: false,
      insertionLoss: 0.5 as dB,
    },
    buc: {
      isPowered: true,
      isMuted: false,
      isLoopback: false,
      temperature: 25,
      currentDraw: 0,
      loFrequency: 6425 as MHz,
      filterHighHz: FrequencyBand.c.upHigh,
      filterLowHz: FrequencyBand.c.upLow,
      filterRejectionDb: 40 as dB,
      isExtRefLocked: true,
      frequencyError: 0,
      phaseLockRange: 10000,
      gain: 0 as dB,
      outputPower: -10 as dBm,
      saturationPower: 15 as dBm,
      gainFlatness: 0.5 as dB,
      groupDelay: 3,
      phaseNoise: -100,
      spuriousOutputs: [],
      noiseFloor: -140,
    },
    hpa: {
      isPowered: true,
      backOff: 6,
      outputPower: 50 as dBm,
      isOverdriven: false,
      imdLevel: -30,
      temperature: 45,
      isHpaEnabled: false,
      isHpaSwitchEnabled: false,
      noiseFloor: -140,
      gain: 44 as dB,
    },
    filter: {
      isPowered: true,
      bandwidthIndex: 12,
      bandwidth: 20 as MHz,
      insertionLoss: 2.0,
      noiseFloor: -101,
    },
    lnb: {
      isPowered: false,
      loFrequency: 6080 as MHz, // MHz
      gain: 0 as dB,
      lnaNoiseFigure: 0.6, // dB
      mixerNoiseFigure: 16.0, // dB
      noiseTemperature: 290, // K
      noiseTemperatureStabilizationTime: 180, // seconds
      isExtRefLocked: false,
      noiseFloor: -140, // dBm/Hz
      frequencyError: 0, // Hz
      temperature: 25, // °C
      thermalStabilizationTime: 180, // seconds
    },
    agc: {
      isPowered: true,
      isBypassed: false,
      targetLevel: -30 as dBm,
      currentGain: 0 as dB,
      inputPower: -100 as dBm,
      outputPower: -100 as dBm,
      attackTime: 10,
      releaseTime: 100,
      maxGain: 0 as dB,
      minGain: -60 as dB,
    },
    coupler: {
      isPowered: true,
      tapPointA: TapPoint.TX_IF,
      tapPointB: TapPoint.RX_IF,
      availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
      availableTapPointsB: [TapPoint.RX_IF],
      couplingFactorA: -40, // dB
      couplingFactorB: -39, // dB
      isActiveA: true,
      isActiveB: true,
    } as CouplerState,
    gpsdo: {
      isPowered: true, // CHANGE
      isLocked: false,
      warmupTimeRemaining: 0, // seconds
      temperature: 70, // °C
      gnssSignalPresent: false,
      isGnssSwitchUp: false,
      isGnssAcquiringLock: false,
      satelliteCount: 0,
      utcAccuracy: 0,
      constellation: 'GPS',
      lockDuration: 0,
      frequencyAccuracy: 0,
      allanDeviation: 0,
      phaseNoise: 0,
      isInHoldover: true,
      holdoverDuration: 600,
      holdoverError: 0,
      active10MHzOutputs: 2,
      max10MHzOutputs: 5,
      output10MHzLevel: 0,
      ppsOutputsEnabled: false,
      operatingHours: 6,
      selfTestPassed: true,
      agingRate: 0,
    },
  }],
  spectrumAnalyzers: [
    {
      referenceLevel: 0, // dBm
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      rbw: 50e6 as Hertz,
      minAmplitude: -170,
      maxAmplitude: 0,
      scaleDbPerDiv: (-0 + 170) / 10 as dB, // 6 dB/div
      screenMode: 'both',
      inputUnit: 'MHz',
      inputValue: '',

      // Multi-trace support
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' }, // Trace 1
        { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 2
        { isVisible: false, isUpdating: false, mode: 'clearwrite' }, // Trace 3
      ],
      selectedTrace: 1,
    }
  ],
  transmitters: [],
  receivers: [],
} as GroundStationConfig;
