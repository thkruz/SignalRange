import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { type CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import type { RFFrontEndState } from '@app/equipment/rf-front-end/rf-front-end-core';
import type { dB, dBm, Hertz, MHz } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * Campaign 3 (Backyard Operator) - Riley's backyard stations, Burlington VT.
 *
 * Three receive-only hobbyist setups sharing one yard. Each is a full
 * GroundStationConfig so the existing equipment pipeline works unchanged,
 * but with the Campaign 3 opt-ins:
 * - stationClass: 'backyard'  -> SDR Console tab, no TX chain tab
 * - lnb.isDirectSampling      -> RF passes through unmixed (RTL-SDR style)
 * - omt rx/tx 'RHCP'          -> circular pass-through (handedness modeled
 *                                at the antenna feed, not the OMT)
 */

/**
 * Shared RF front end for a budget SDR dongle: direct sampling, no real TX path.
 *
 * @param filterBandwidthIndex Index into FILTER_BANDWIDTH_CONFIGS. The filter
 * drives the site noise floor (narrower = lower), and the backyard signals are
 * ~15 dB weaker at the AGC output than the teleport campaigns' - a narrowband
 * downlink needs a narrowband receive filter or it drowns in the noise gate.
 * Index 6 = 200 kHz (VHF/UHF birds; insertion loss 3.0 stays under the alarm
 * threshold), index 10 = 5 MHz (GPS L1 spread spectrum).
 */
const makeSdrFrontEnd = (filterBandwidthIndex: number, filterBandwidthMhz: number): Partial<RFFrontEndState> => ({
  omt: {
    isPowered: true,
    txPolarization: 'RHCP',
    rxPolarization: 'RHCP',
    effectiveTxPol: 'RHCP',
    effectiveRxPol: 'RHCP',
    crossPolIsolation: 28.5 as dB,
    isFaulted: false,
    insertionLoss: 0.5 as dB,
  },
  buc: {
    isPowered: false, // receive-only: no upconverter
    isMuted: true,
    isLoopback: false,
    temperature: 25,
    currentDraw: 0,
    loFrequency: 0 as MHz,
    filterHighHz: 450e6 as Hertz,
    filterLowHz: 130e6 as Hertz,
    filterRejectionDb: 40 as dB,
    isExtRefLocked: true,
    frequencyError: 0,
    phaseLockRange: 10000,
    gain: 0 as dB,
    outputPower: -60 as dBm,
    saturationPower: 0 as dBm,
    gainFlatness: 0.5 as dB,
    groupDelay: 3,
    phaseNoise: -100,
    spuriousOutputs: [],
    noiseFloor: -140,
  },
  hpa: {
    isPowered: false, // no power amplifier in the backyard
    backOff: 10,
    outputPower: 0 as dBm,
    isOverdriven: false,
    imdLevel: -30,
    temperature: 25,
    isHpaEnabled: false,
    isHpaSwitchEnabled: false,
    noiseFloor: -140,
    gain: 0 as dB,
  },
  filter: {
    isPowered: true,
    // bandwidth/insertionLoss/noiseFloor are recomputed from the index each
    // update (updateFilterCharacteristics_), so only the index matters here
    bandwidthIndex: filterBandwidthIndex,
    bandwidth: filterBandwidthMhz as MHz,
    insertionLoss: 3.0,
    noiseFloor: -121,
  },
  lnb: {
    isPowered: true,
    isDirectSampling: true, // SDR dongle: RF frequency = IF frequency
    loFrequency: 0 as MHz,  // unused in direct-sampling mode
    // LNA + SDR front-end gain, driven by the console's RF GAIN slider. With
    // the AGC bypassed this sets the ADC input level directly: 79 dB puts a
    // mid-pass bird at the ~-30 dBm sweet spot; crank it and the ADC clips,
    // starve it and quantization noise eats the C/N (real RTL-SDR behavior).
    gain: 79 as dB,
    lnaNoiseFigure: 1.0,    // budget hardware (right at the alarm threshold)
    mixerNoiseFigure: 16.0,
    noiseTemperature: 110,
    noiseTemperatureStabilizationTime: 0,
    isExtRefLocked: true,
    noiseFloor: -140,
    frequencyError: 0,
    temperature: 28,
    thermalStabilizationTime: 0,
  },
  agc: {
    isPowered: true,
    // Bypassed: a bare SDR dongle has no AGC stage, so the RF GAIN slider has
    // real consequences at the ADC (clipping high, quantization low)
    isBypassed: true,
    targetLevel: -30 as dBm,
    currentGain: 0 as dB,
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
    satelliteCount: 8,
    utcAccuracy: 50,
    constellation: 'GPS',
    lockDuration: 3600,
    frequencyAccuracy: 2e-11,
    allanDeviation: 1e-11,
    phaseNoise: -110,
    isInHoldover: false,
    holdoverDuration: 0,
    holdoverError: 0,
    active10MHzOutputs: 1,
    max10MHzOutputs: 2,
    output10MHzLevel: 7,
    ppsOutputsEnabled: true,
    operatingHours: 1200,
    selfTestPassed: true,
    agingRate: 1e-10,
  },
});

/** QFH on a fence post: fixed skyward, catches the 137 MHz weather birds */
export const backyardQfhStation = {
  id: 'BKYD-QFH',
  name: 'Weather Rig (QFH)',
  stationClass: 'backyard',
  location: {
    latitude: 44.48,
    longitude: -73.21,
    elevation: 50,
  },
  antennas: [ANTENNA_CONFIG_KEYS.VHF_QFH_137],
  antennaConfigKey: ANTENNA_CONFIG_KEYS.VHF_QFH_137,
  antennasState: [
    {
      isPowered: true,
      azimuth: 0 as Degrees,
      elevation: 90 as Degrees, // zip-tied pointing straight up
      polarization: 0 as Degrees,
      circularHandedness: 'RHCP',
      trackingMode: 'manual',
      targetAzimuth: 0 as Degrees,
      targetElevation: 90 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconFrequencyHz: 137.1e6 as Hertz,
      beaconSearchBwHz: 100e3, // covers +/-3 kHz VHF Doppler with margin
      beaconTrackingBwHz: 1e3,
      isLocked: false,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [makeSdrFrontEnd(6, 0.2)], // 200 kHz filter for the 34 kHz APT downlink
  spectrumAnalyzers: [
    {
      referenceLevel: -60 as dBm,
      centerFrequency: 137.1e6 as Hertz,
      span: 200e3 as Hertz,
      rbw: 1e3 as Hertz,
      minAmplitude: -75 as dBm,
      maxAmplitude: -25 as dBm,
      scaleDbPerDiv: 10 as dB,
      screenMode: 'both',
      inputUnit: 'MHz',
      inputValue: '',
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
      ],
      selectedTrace: 1,
    },
  ],
  transmitters: [{}], // single idle default transmitter; nothing in the yard transmits
  receivers: [{
    activeModem: 1,
    modems: [{
      modemNumber: 1,
      isPowered: true,
      frequency: 137.1 as MHz, // direct sampling: IF = RF
      bandwidth: 0.05 as MHz,
      modulation: 'BPSK',
      fec: '1/2',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;

/** Crossed yagi on a TV rotator: the 70cm bird chaser with the handedness switch */
export const backyardYagiStation = {
  id: 'BKYD-YAGI',
  name: 'Yagi Rig (70cm)',
  stationClass: 'backyard',
  location: {
    latitude: 44.48,
    longitude: -73.21,
    elevation: 50,
  },
  antennas: [ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM],
  antennaConfigKey: ANTENNA_CONFIG_KEYS.UHF_CROSSED_YAGI_70CM,
  antennasState: [
    {
      isPowered: true,
      azimuth: 180 as Degrees, // parked; operator program-tracks the pass
      elevation: 5 as Degrees,
      polarization: 0 as Degrees,
      circularHandedness: 'RHCP',
      trackingMode: 'manual',
      targetAzimuth: 180 as Degrees,
      targetElevation: 5 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconFrequencyHz: 435.25e6 as Hertz,
      beaconSearchBwHz: 100e3, // covers +/-10 kHz UHF Doppler
      beaconTrackingBwHz: 1e3,
      isLocked: false,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [makeSdrFrontEnd(6, 0.2)], // 200 kHz filter: 15 kHz FM channel + Doppler excursion
  spectrumAnalyzers: [
    {
      referenceLevel: -60 as dBm,
      centerFrequency: 435.25e6 as Hertz,
      span: 100e3 as Hertz, // Doppler drift is plainly visible at this span
      rbw: 1e3 as Hertz,
      minAmplitude: -75 as dBm,
      maxAmplitude: -25 as dBm,
      scaleDbPerDiv: 10 as dB,
      screenMode: 'both',
      inputUnit: 'MHz',
      inputValue: '',
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
      ],
      selectedTrace: 1,
    },
  ],
  transmitters: [{}],
  receivers: [{
    activeModem: 1,
    modems: [{
      modemNumber: 1,
      isPowered: true,
      frequency: 435.25 as MHz,
      bandwidth: 0.03 as MHz, // +/-10 kHz Doppler slides outside +/-15 kHz: chase it or use AFC
      modulation: 'QPSK',
      fec: '1/2',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;

/**
 * S8 "Callsign" variant of the yagi rig: same antenna and receiver, plus the
 * TX side of the SDR transceiver powered up - a ~5 W brick amplifier (HPA
 * maxOutputPower 37 dBm) behind the always-on upconverter (BUC LO 0,
 * 130-450 MHz passband, so RF = IF at 435 MHz). BUC boots powered AND
 * unmuted: the HPA-without-drive insta-fail checks exactly those two flags,
 * and a ham rig has no separate BUC/HPA panels to sequence them from.
 * The TX modem boots parked below the transponder passband - entering the
 * uplink frequency is S8's first-transmission objective.
 */
const makeTxFrontEnd = (): Partial<RFFrontEndState> => {
  const frontEnd = makeSdrFrontEnd(6, 0.2);
  return {
    ...frontEnd,
    buc: { ...frontEnd.buc, isPowered: true, isMuted: false },
    hpa: {
      ...frontEnd.hpa,
      isPowered: true,
      isHpaEnabled: true,
      isHpaSwitchEnabled: true,
      backOff: 3,
      maxOutputPower: 37 as dBm, // ~5 W brick
      p1db: 34 as dBm,
    },
  };
};

export const backyardTxStation = {
  ...backyardYagiStation,
  name: 'Yagi Rig (70cm + TX)',
  rfFrontEnds: [makeTxFrontEnd()],
  transmitters: [{
    activeModem: 1,
    modems: [{
      modem_number: 1,
      isPowered: true,
      isTransmitting: false,
      ifSignal: {
        frequency: 435.800e6, // parked off the transponder; S8 has you set 435.900
        power: -20 as dBm,    // drive level; the brick amp does the rest
        bandwidth: 15e3,      // SSTV-ish channel, fits the 30 kHz transponder
        modulation: 'QPSK',
        fec: '1/2',
        feed: 'blue-2.mp4',   // your own SSTV frame, seen again on the downlink
        polarization: null,
      },
    }],
  }],
} as GroundStationConfig;

/** GPS patch on a paint-stick mast: L1 detection experiment */
export const backyardGpsStation = {
  id: 'BKYD-GPS',
  name: 'GPS Experiment (Patch)',
  stationClass: 'backyard',
  location: {
    latitude: 44.48,
    longitude: -73.21,
    elevation: 50,
  },
  antennas: [ANTENNA_CONFIG_KEYS.L_BAND_GPS_PATCH],
  antennaConfigKey: ANTENNA_CONFIG_KEYS.L_BAND_GPS_PATCH,
  antennasState: [
    {
      isPowered: true,
      azimuth: 0 as Degrees,
      elevation: 90 as Degrees, // fixed skyward
      polarization: 0 as Degrees,
      circularHandedness: 'RHCP',
      trackingMode: 'manual',
      targetAzimuth: 0 as Degrees,
      targetElevation: 90 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconFrequencyHz: 1575.42e6 as Hertz,
      beaconSearchBwHz: 2e6,
      beaconTrackingBwHz: 100e3,
      isLocked: false,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [makeSdrFrontEnd(10, 5)], // 5 MHz filter for the 2 MHz spread-spectrum hump
  spectrumAnalyzers: [
    {
      referenceLevel: -60 as dBm,
      centerFrequency: 1575.42e6 as Hertz,
      span: 8e6 as Hertz, // wide: the whole 2 MHz spread-spectrum hump in view
      rbw: 30e3 as Hertz,
      minAmplitude: -75 as dBm,
      maxAmplitude: -25 as dBm,
      scaleDbPerDiv: 10 as dB,
      screenMode: 'both',
      inputUnit: 'MHz',
      inputValue: '',
      traces: [
        { isVisible: true, isUpdating: true, mode: 'clearwrite' },
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
        { isVisible: false, isUpdating: false, mode: 'clearwrite' },
      ],
      selectedTrace: 1,
    },
  ],
  transmitters: [{}],
  receivers: [{
    activeModem: 1,
    modems: [{
      modemNumber: 1,
      isPowered: true,
      frequency: 1575.42 as MHz,
      bandwidth: 2.5 as MHz,
      // Deliberately mismatched to the spread-spectrum signal: GPS is detected
      // as a carrier/energy rise but can never "lock" like a comms downlink
      modulation: 'BPSK',
      fec: '1/2',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;
