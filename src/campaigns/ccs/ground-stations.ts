import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { FrequencyBand } from '@app/constants';
import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-config-keys';
import { type CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, IfFrequency, MHz, ModulationType } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * Campaign 4 (9th EWS) - SANDSTORM transportable X-band EA site (SS-01).
 *
 * A two-aperture electronic-attack site:
 * - Antenna 0 (JAM): 5 m X-band, trained on the target COBALT-4 (az 175 / el 50),
 *   fed by the TX chain (rfFrontEnd 0). BUC LO 7000 MHz low-side, so a 1125 MHz
 *   IF upconverts to the 8125 MHz target uplink.
 * - Antenna 1 (MONITOR): 3 m X-band look-through aperture for battle-damage
 *   assessment, fed by the RX chain (rfFrontEnd 1). LNB LO 8925 MHz high-side,
 *   so the 7475 MHz victim downlink lands at 1450 MHz IF. Starts parked off the
 *   target (az 90 / el 10) - the operator slews it on for coordination.
 *
 * Redundancy: the JAM transmitter carries two pre-tuned jam strings - modem 1
 * (primary) and modem 2 (backup). A scheduled hardware fault trips the primary
 * mid-mission; the operator fails over to the backup to restore the effect.
 *
 * The two-antenna / two-front-end wiring uses GroundStation's existing routing
 * (antenna i <-> rfFrontEnd i; receivers 0-1 -> rf 0, 2-3 -> rf 1), so the
 * monitor receiver sits at index 2 to read the RX front end.
 */
export const sandstormGroundStation = {
  id: 'SS-01',
  name: 'SANDSTORM Field Site',
  location: {
    latitude: 34.0,
    longitude: -118.0,
    elevation: 400,
  },
  antennas: [ANTENNA_CONFIG_KEYS.X_BAND_5M, ANTENNA_CONFIG_KEYS.X_BAND_3M_ANTESTAR_RS],
  antennasState: [
    {
      // JAM aperture: powered and already trained on COBALT-4, so it starts
      // boresight-on rather than merely close. These are the bird's true look
      // angles from its authored GEO slot (115.1W - see ccs/satellites.ts), not
      // the rounded 175/50 the objective asks the operator for: this is a 5 m
      // dish with a 0.56 deg beam, and the 0.4 deg of rounding costs ~13 dB of
      // beacon C/N. The objective's 3 deg tolerance covers both.
      isPowered: true,
      azimuth: 174.9 as Degrees,
      elevation: 50.4 as Degrees,
      polarization: 0 as Degrees,
      trackingMode: 'manual',
      targetAzimuth: 174.9 as Degrees,
      targetElevation: 50.4 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconFrequencyHz: 7290e6 as Hertz, // COBALT-4 telemetry beacon
      beaconSearchBwHz: 1e6,
      beaconTrackingBwHz: 1e3,
      isLocked: false,
    } as Partial<AntennaState>,
    {
      // MONITOR aperture: parked off-target; operator slews it onto COBALT-4
      isPowered: true,
      azimuth: 90 as Degrees,
      elevation: 10 as Degrees,
      polarization: 0 as Degrees,
      trackingMode: 'manual',
      targetAzimuth: 90 as Degrees,
      targetElevation: 10 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconFrequencyHz: 7290e6 as Hertz,
      beaconSearchBwHz: 1e6,
      beaconTrackingBwHz: 1e3,
      isLocked: false,
    } as Partial<AntennaState>,
  ],
  rfFrontEnds: [
    // rfFrontEnd 0 - JAM transmit chain (X-band up)
    {
      omt: {
        isPowered: true,
        txPolarization: 'H',
        rxPolarization: 'H',
        effectiveTxPol: 'H',
        effectiveRxPol: 'H',
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
        loFrequency: 7000 as MHz, // X-band low-side LO (RF = LO + IF)
        filterHighHz: FrequencyBand.x.upHigh,
        filterLowHz: FrequencyBand.x.upLow,
        filterRejectionDb: 40 as dB,
        isExtRefLocked: true,
        frequencyError: 0,
        phaseLockRange: 10000,
        gain: 30 as dB,
        outputPower: -10 as dBm,
        saturationPower: 20 as dBm,
        gainFlatness: 0.5 as dB,
        groupDelay: 3,
        phaseNoise: -100,
        spuriousOutputs: [],
        noiseFloor: -140,
      },
      hpa: {
        isPowered: true,
        backOff: 8,
        outputPower: 50 as dBm,
        isOverdriven: false,
        imdLevel: -30,
        temperature: 45,
        isHpaEnabled: false,
        isHpaSwitchEnabled: false,
        noiseFloor: -140,
        gain: 30 as dB,
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
        loFrequency: 8925 as MHz,
        gain: 60 as dB,
        lnaNoiseFigure: 1.2,
        mixerNoiseFigure: 16.0,
        noiseTemperature: 90,
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
        isEnabledA: true,
        isEnabledB: false,
        isActiveA: true,
        isActiveB: false,
      } as CouplerState,
      gpsdo: {
        isPowered: true,
        isLocked: true,
        warmupTimeRemaining: 0,
        temperature: 70,
        gnssSignalPresent: true,
        isGnssSwitchUp: true,
        isGnssAcquiringLock: false,
        satelliteCount: 9,
        utcAccuracy: 50,
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
        operatingHours: 4380,
        selfTestPassed: true,
        agingRate: 1e-10,
      },
    },
    // rfFrontEnd 1 - MONITOR receive chain (X-band down)
    {
      omt: {
        isPowered: true,
        txPolarization: 'H',
        rxPolarization: 'H',
        effectiveTxPol: 'H',
        effectiveRxPol: 'H',
        crossPolIsolation: 28.5 as dB,
        isFaulted: false,
        insertionLoss: 0.5 as dB,
      },
      buc: {
        isPowered: false,
        isMuted: true,
        isLoopback: false,
        temperature: 25,
        currentDraw: 0,
        loFrequency: 7000 as MHz,
        filterHighHz: FrequencyBand.x.upHigh,
        filterLowHz: FrequencyBand.x.upLow,
        filterRejectionDb: 40 as dB,
        isExtRefLocked: true,
        frequencyError: 0,
        phaseLockRange: 10000,
        gain: 30 as dB,
        outputPower: -10 as dBm,
        saturationPower: 20 as dBm,
        gainFlatness: 0.5 as dB,
        groupDelay: 3,
        phaseNoise: -100,
        spuriousOutputs: [],
        noiseFloor: -140,
      },
      hpa: {
        isPowered: false,
        backOff: 10,
        outputPower: 0 as dBm,
        isOverdriven: false,
        imdLevel: -30,
        temperature: 25,
        isHpaEnabled: false,
        isHpaSwitchEnabled: false,
        noiseFloor: -140,
        gain: 30 as dB,
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
        loFrequency: 8925 as MHz, // X-band high-side LO (IF = LO - RF -> 1450 MHz)
        gain: 62 as dB,
        lnaNoiseFigure: 1.0,
        mixerNoiseFigure: 16.0,
        noiseTemperature: 80,
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
        satelliteCount: 9,
        utcAccuracy: 50,
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
        operatingHours: 4380,
        selfTestPassed: true,
        agingRate: 1e-10,
      },
    },
  ],
  spectrumAnalyzers: [
    {
      referenceLevel: -50 as dBm,
      centerFrequency: 1125e6 as Hertz, // JAM chain uplink IF (8125 MHz RF)
      span: 60e6 as Hertz,
      rbw: 1e6 as Hertz,
      minAmplitude: -110 as dBm,
      maxAmplitude: -40 as dBm,
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
  transmitters: [
    {
      activeModem: 1,
      modems: [
        {
          // Modem 1 - PRIMARY jam string (pre-tuned to the 8125 MHz uplink)
          isPowered: true,
          antenna_id: 1,
          modem_number: 1,
          isFaulted: false,
          isTransmitting: false,
          isTransmittingSwitchUp: false,
          isFaultSwitchUp: false,
          id: 0,
          isLoopback: false,
          ifSignal: {
            signalId: 'SS-01-JAM-A',
            serverId: 1,
            noradId: 90042,
            polarization: 'H',
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.TRANSMITTER,
            noiseFloor: null,
            gainInPath: 0 as dBi,
            frequency: 1125e6 as IfFrequency, // -> 8125 MHz X-band uplink
            power: 0 as dBm,
            bandwidth: 5e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
          },
        },
        {
          // Modem 2 - BACKUP jam string (identical config for fast failover)
          isPowered: true,
          antenna_id: 1,
          modem_number: 2,
          isFaulted: false,
          isTransmitting: false,
          isTransmittingSwitchUp: false,
          isFaultSwitchUp: false,
          id: 1,
          isLoopback: false,
          ifSignal: {
            signalId: 'SS-01-JAM-B',
            serverId: 1,
            noradId: 90042,
            polarization: 'H',
            feed: '',
            isDegraded: false,
            origin: SignalOrigin.TRANSMITTER,
            noiseFloor: null,
            gainInPath: 0 as dBi,
            frequency: 1125e6 as IfFrequency,
            power: 0 as dBm,
            bandwidth: 5e6 as Hertz,
            modulation: 'QPSK' as ModulationType,
            fec: '3/4' as FECType,
          },
        },
      ],
    },
  ],
  receivers: [
    // Receivers 0-1 route to rfFrontEnd 0 (JAM chain) - unused placeholders
    {
      activeModem: 1,
      modems: [{ modemNumber: 1, isPowered: false, frequency: 1125 as MHz, bandwidth: 5 as MHz, modulation: 'QPSK', fec: '3/4', antenna_id: 1 }],
    },
    {
      activeModem: 1,
      modems: [{ modemNumber: 1, isPowered: false, frequency: 1125 as MHz, bandwidth: 5 as MHz, modulation: 'QPSK', fec: '3/4', antenna_id: 1 }],
    },
    // Receiver 2 routes to rfFrontEnd 1 (MONITOR chain) - watches the victim downlink
    {
      activeModem: 1,
      modems: [{ modemNumber: 1, isPowered: true, frequency: 1450 as MHz, bandwidth: 5 as MHz, modulation: 'QPSK', fec: '3/4', antenna_id: 2 }],
    },
  ],
} as GroundStationConfig;
