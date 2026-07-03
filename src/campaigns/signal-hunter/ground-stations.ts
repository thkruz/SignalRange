import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { FrequencyBand } from '@app/constants';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { type CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import type { dB, dBm, MHz, Hertz } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * Campaign 5 (Signal Hunter) - Peterson Annex (PA-22)
 *
 * 22nd Electronic Warfare Squadron field site on the Colorado plains. A C-band
 * 9m dish already program-tracking the victim SENTRY-7 and receiving its
 * allied service carrier (3785 MHz -> 1365 MHz IF, LNB LO 5150). The spectrum
 * analyzer opens on a wide span so the operator can see the intermittent
 * hostile carrier a few MHz off the friendly one.
 */
export const petersonGroundStation = {
  id: 'PA-22',
  name: 'Peterson Annex',
  location: {
    latitude: 38.82,
    longitude: -104.70,
    elevation: 1900,
  },
  antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
  antennaConfigKey: ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK,
  antennasState: [
    {
      // Program-tracking SENTRY-7 (az 172.5 / el 47.1 from PA-22 at T+0)
      isPowered: true,
      azimuth: 172.5 as Degrees,
      elevation: 47.1 as Degrees,
      polarization: 0 as Degrees,
      trackingMode: 'program-track',
      isBeaconLocked: true,
      targetSatelliteId: 71001,
      targetAzimuth: 172.5 as Degrees,
      targetElevation: 47.1 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconCN: 12 as dB,
      beaconFrequencyHz: 3785e6 as Hertz,
      isLocked: true,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [{
    omt: {
      isPowered: true,
      txPolarization: 'V',
      rxPolarization: 'H',
      effectiveTxPol: 'V',
      effectiveRxPol: 'H',
      crossPolIsolation: 28.5 as dB,
      isFaulted: false,
      insertionLoss: 0.5 as dB,
    },
    buc: {
      isPowered: true,
      isMuted: true,
      isLoopback: false,
      temperature: 25,
      currentDraw: 0,
      loFrequency: 7000 as MHz,
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
      isHpaEnabled: false,
      isHpaSwitchEnabled: false,
      noiseFloor: -140,
      gain: 44 as dB,
    },
    filter: {
      isPowered: true,
      bandwidthIndex: 13,
      bandwidth: 40 as MHz,
      insertionLoss: 2.0,
      noiseFloor: -101,
    },
    lnb: {
      isPowered: true,
      loFrequency: 5150 as MHz,
      gain: 65 as dB,
      lnaNoiseFigure: 0.6,
      mixerNoiseFigure: 16.0,
      noiseTemperature: 43,
      noiseTemperatureStabilizationTime: 0,
      isExtRefLocked: true,
      noiseFloor: -140,
      frequencyError: 0,
      temperature: 28,
      thermalStabilizationTime: 0,
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
      minGain: -100 as dB,
    },
    coupler: {
      isEngineeringMode: false,
      tapPointA: TapPoint.TX_IF,
      tapPointB: TapPoint.RX_IF,
      availableTapPointsA: [TapPoint.TX_IF, TapPoint.RX_IF],
      availableTapPointsB: [TapPoint.TX_IF, TapPoint.RX_IF],
      couplingFactorA: -40,
      couplingFactorB: -39,
      isEnabledA: false,
      isEnabledB: true,
      isActiveA: false,
      isActiveB: true,
    } as CouplerState,
    gpsdo: {
      isPowered: true,
      isLocked: true,
      warmupTimeRemaining: 0,
      temperature: 70,
      gnssSignalPresent: true,
      isGnssSwitchUp: true,
      isGnssAcquiringLock: false,
      satelliteCount: 10,
      utcAccuracy: 15, // ns - a tight timing reference is what makes TDOA viable
      constellation: 'GPS',
      lockDuration: 7200,
      frequencyAccuracy: 2e-11,
      allanDeviation: 1e-11,
      phaseNoise: -110,
      isInHoldover: false,
      holdoverDuration: 0,
      holdoverError: 0,
      active10MHzOutputs: 3,
      max10MHzOutputs: 5,
      output10MHzLevel: 7,
      ppsOutputsEnabled: true,
      operatingHours: 8760,
      selfTestPassed: true,
      agingRate: 1e-10,
    },
  }],
  spectrumAnalyzers: [
    {
      referenceLevel: -60 as dBm,
      centerFrequency: 1364e6 as Hertz, // Between the service carrier (1365) and jammer (1362) IFs
      span: 30e6 as Hertz,
      rbw: 100e3 as Hertz,
      minAmplitude: -110 as dBm,
      maxAmplitude: -50 as dBm,
      scaleDbPerDiv: 10 as dB,
      screenMode: 'both',
      inputUnit: 'MHz',
      inputValue: '',
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
        { isVisible: true, isUpdating: true, mode: 'maxhold' }, // Catch the duty-cycled jammer
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
      ],
      selectedTrace: 1,
    },
  ],
  receivers: [{
    activeModem: 1,
    modems: [{
      modemNumber: 1,
      isPowered: true,
      frequency: 1365 as MHz, // SENTRY-7 service carrier IF
      bandwidth: 8 as MHz,
      modulation: 'QPSK',
      fec: '3/4',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;
