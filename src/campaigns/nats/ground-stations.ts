import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { createRfFrontEnd } from '@app/campaigns/rf-front-end-factory';
import { FrequencyBand } from '@app/constants';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { type CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import type { Degrees } from 'ootk';

export const vermontGroundStation = {
  id: 'VT-01',
  name: 'Vermont Ground Station',
  location: {
    latitude: 44.5588,
    longitude: -72.5778,
    elevation: 210, // Lamoille valley floor, Morrisville area (was 2 m; nats-r3-s01-F2)
  },
  antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
  antennasState: [
    {
      // Antenna already tracking TIDEMARK-1 in program-track mode
      isPowered: true,
      azimuth: 153.1 as Degrees, // Locked on TIDEMARK-1 (53 W, Phase 28 D4)
      elevation: 35.1 as Degrees,
      // polarization: derived from geometry (Phase 29 D8, geoPolarizationSkewDeg; +18.8 deg TM-1 at VT-01)
      trackingMode: 'program-track',
      isBeaconLocked: true,
      targetSatelliteId: 61525,
      targetAzimuth: 153.1 as Degrees,
      targetElevation: 35.1 as Degrees,
      slewing: false,
      beaconCN: 10.5 as dB,
      beaconFrequencyHz: 4175.5e6 as Hertz, // TIDEMARK-1 beacon (RF; the beacon receiver tunes RF)
      isLocked: true,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [
    {
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
        loFrequency: 7000 as MHz,
        filterHighHz: FrequencyBand.c.upHigh,
        filterLowHz: FrequencyBand.c.upLow,
        filterRejectionDb: 40 as dB,
        isExtRefLocked: true,
        frequencyError: 0,
        phaseLockRange: 10000,
        gain: 23 as dB,
        outputPower: -10 as dBm,
        // P1dB of the BUC's output stage (Rapp, Psat 2.16 dB above, 19.6): the
        // 16 dBm operating point runs 12 dB backed off (3.1 A, ~47 degC)
        saturationPower: 28 as dBm,
        gainFlatness: 0.5 as dB,
        groupDelay: 3,
        phaseNoise: -100,
        spuriousOutputs: [],
        noiseFloor: -140,
      },
      hpa: {
        isPowered: true,
        // 1 kW (P1dB 60 dBm) C-band TWTA in ALC (19.6): output = P1dB - backOff,
        // 10 dB -> 50 dBm (100 W); Saleh curve, Psat 64.1 dBm (2.6 kW)
        amplifierType: 'twta',
        p1db: 60 as dBm,
        isAlcEnabled: true,
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
        gain: 65 as dB,
        lnaNoiseFigure: 0.6, // dB
        mixerNoiseFigure: 16.0, // dB
        noiseTemperature: 43, // K - stable
        // Same LNB model as ME-02 (phase 27): a power cycle costs 90 s of warm-up.
        // At start the LNB is already warm (noise 43 K, 28 degC), so this only
        // bites after the operator cycles it
        noiseTemperatureStabilizationTime: 90, // seconds
        isExtRefLocked: true, // Locked to GPSDO 10 MHz
        noiseFloor: -140, // dBm/Hz
        frequencyError: 0, // Hz
        temperature: 28, // °C - stable
        thermalStabilizationTime: 90, // seconds
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
        couplingFactorA: -20, // dB (monitor coupler; the analyzer reads line power through it, Phase 19.2)
        couplingFactorB: -20, // dB
        isEnabledA: false,
        isEnabledB: true,
        isActiveA: false,
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
    },
  ],
  spectrumAnalyzers: [
    {
      referenceLevel: -91 as dBm, // Engineering-mode field; S4 checks it stays at the beacon preset
      centerFrequency: 1074.5e6 as Hertz, // IF frequency for beacon
      span: 2e3 as Hertz, // 2 kHz span for CW beacon
      rbw: null, // Auto (3 Hz at 2 kHz): the CW line stands ~55 dB over the floor
      // Phase 27: the TIDEMARK beacon reads -54 to -59 dBm at the RX IF tap
      // (ledger), the floor ~-114 dBm in 3 Hz: both on screen, 10 dB/div
      minAmplitude: -140 as dBm,
      maxAmplitude: -40 as dBm,
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
    },
  ],
  transmitters: [
    {
      activeModem: 1,
      modems: [
        {
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
            noradId: 61525,
            polarization: 'V',
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.TRANSMITTER,
            noiseFloor: null,
            gainInPath: 0 as dBi,
            frequency: 1057e6 as IfFrequency, // TM-1 TP-1: 7000 - 5943 (LO above RF, LSB)
            power: -7 as dBm,
            bandwidth: 36e6 as Hertz, // Match payload bandwidth
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
          },
        },
      ],
    },
  ],
  receivers: [
    {
      activeModem: 1,
      modems: [
        {
          modemNumber: 1,
          isPowered: true,
          frequency: 1532 as MHz, // IF frequency for 3718 MHz RF with 5150 MHz LO
          bandwidth: 36 as MHz, // Match payload bandwidth
          modulation: 'QPSK',
          fec: '3/4',
          antenna_id: 1,
        },
      ],
    },
  ],
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
  rfFrontEnds: [
    {
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
        saturationPower: 28 as dBm, // same BUC model as VT-01 (19.6)
        gainFlatness: 0.5 as dB,
        groupDelay: 3,
        phaseNoise: -100,
        spuriousOutputs: [],
        noiseFloor: -140,
      },
      hpa: {
        isPowered: true,
        amplifierType: 'twta', // same 1 kW TWTA as VT-01 (19.6)
        p1db: 60 as dBm,
        isAlcEnabled: true,
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
        noiseTemperatureStabilizationTime: 90, // seconds (19.6: lnb-thermally-stable waits it out)
        isExtRefLocked: false,
        noiseFloor: -140, // dBm/Hz
        frequencyError: 0, // Hz
        temperature: 25, // °C
        thermalStabilizationTime: 90, // seconds
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
        isEngineeringMode: false,
        tapPointA: TapPoint.TX_IF,
        tapPointB: TapPoint.RX_IF,
        availableTapPointsA: [TapPoint.TX_IF, TapPoint.RX_IF],
        availableTapPointsB: [TapPoint.TX_IF, TapPoint.RX_IF],
        couplingFactorA: -20, // dB (monitor coupler; the analyzer reads line power through it, Phase 19.2)
        couplingFactorB: -20, // dB
        isEnabledA: false,
        isEnabledB: true,
        isActiveA: false,
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
    },
  ],
  spectrumAnalyzers: [
    {
      referenceLevel: -40, // dBm, top of the screen
      centerFrequency: 600e6 as Hertz,
      span: 100e6 as Hertz,
      // Auto (300 kHz at 100 MHz); 50 MHz at a 100 MHz span resolved nothing (phase 27)
      rbw: null,
      // The same 10 dB/div window as VT-01: a C-band beacon at -54 to -59 dBm
      // and a carrier's density sit inside it once tuned
      minAmplitude: -140,
      maxAmplitude: -40,
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
    },
  ],
  // One TX and one RX chassis, as at VT-01: the equipment is in the rack even
  // while the station is out of service (phase 27: `[]` now means none)
  transmitters: [{}],
  receivers: [{}],
} as GroundStationConfig;

/**
 * ME-02 in service (phase 27, r2-s13-F2): the station Catherine runs when a
 * brief calls Maine operational. Spreading `maineGroundStation` and flipping
 * `isOperational` left the out-of-service front end (GPSDO in holdover with
 * no GNSS, LNB off and unlocked) on a station the story says is carrying
 * traffic. Here the GPSDO is GNSS-locked, the LNB is on, warm and locked to
 * its 10 MHz, the AGC has its working range; the TX chain stays cold (BUC
 * muted, HPA off) until a scenario stages it.
 */
export const maineGroundStationOperational = {
  ...maineGroundStation,
  isOperational: true,
  rfFrontEnds: [
    // The station-standard chain every operational ME-02 in the campaign runs
    // (VT-01's: LNB LO 5250, BUC LO 7000), TX cold until a scenario stages it
    createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
      buc: { isMuted: true },
      hpa: { isHpaEnabled: false, isHpaSwitchEnabled: false },
    }),
  ],
} as GroundStationConfig;

/** ME-02 tracking TIDEMARK-2 from Maine (phase 19.4 look angles; S9, S14, S16) */
export const ME02_TM2_ANTENNA_STATE = {
  isPowered: true,
  azimuth: 148.13 as Degrees, // Maine sees TM-2 (45 W) here, not at Vermont's 143.3 / 31.8 (Phase 28 D4)
  elevation: 32.86 as Degrees,
  // polarization: derived from geometry (Phase 29 D8, geoPolarizationSkewDeg; about +22 deg TM-2 at ME-02)
  trackingMode: 'program-track',
  isBeaconLocked: true,
  targetSatelliteId: 61526, // TIDEMARK-2
  targetAzimuth: 148.13 as Degrees,
  targetElevation: 32.86 as Degrees,
  slewing: false,
  beaconCN: 10.2 as dB,
  beaconFrequencyHz: 4180e6 as Hertz, // TIDEMARK-2 beacon (RF)
  isLocked: true,
} as Partial<AntennaState>;

/**
 * ME-02's TIDEMARK-2 hub carrier on the air (phase 27): with the stand-in
 * composites gone, a story that has Maine carrying TM-2 starts this modem
 * keyed (TP-1 6017 MHz = BUC LO 7000 - IF 983, LSB) with the chain hot.
 */
export const ME02_TM2_TRANSMITTER = {
  activeModem: 1,
  modems: [
    {
      ...vermontGroundStation.transmitters[0].modems[0],
      ifSignal: {
        ...vermontGroundStation.transmitters[0].modems[0].ifSignal,
        signalId: 'TIDEMARK-2-Teleport',
        noradId: 61526,
        frequency: 983e6 as IfFrequency, // TM-2 TP-1: 7000 - 6017
      },
    },
  ],
};

/** ME-02's chain hot on its own traffic: BUC unmuted, HPA on at VT-01's 10 dB back-off */
export const ME02_HOT_RF_FRONT_END = createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {});
