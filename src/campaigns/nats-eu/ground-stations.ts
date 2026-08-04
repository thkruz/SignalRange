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
 * NATS Europe - Galway Ground Station (GW-01)
 *
 * Ku-band LEO downlink station on the Irish west coast. Frequency plan:
 * - LNB LO 13100 MHz (high-side): 11686 MHz video -> 1414 MHz IF,
 *   11711 MHz beacon -> 1389 MHz IF (both inside the 950-2150 MHz L-band IF;
 *   the beacon sits above the video's 11668-11704 MHz occupied band so the
 *   CW tone is not blocked by the stronger co-channel carrier)
 * - BUC LO 12600 MHz (low-side): 1405 MHz IF -> 14005 MHz Ku uplink
 * - Fast 4m pedestal (KU_BAND_4M_LEO_TRACKER, 20 deg/s) for LEO tracking
 */
export const galwayGroundStation = {
  id: 'GW-01',
  name: 'Galway Ground Station',
  location: {
    latitude: 53.27,
    longitude: -9.05,
    elevation: 20,
  },
  antennas: [ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER],
  antennaConfigKey: ANTENNA_CONFIG_KEYS.KU_BAND_4M_LEO_TRACKER,
  antennasState: [
    {
      // Powered and parked near the MERIDIAN-SAR-1 AOS azimuth (~5 deg); the
      // operator selects the target and enables program-track for the pass
      isPowered: true,
      azimuth: 5 as Degrees,
      elevation: 3 as Degrees,
      polarization: 0 as Degrees,
      trackingMode: 'manual',
      targetAzimuth: 5 as Degrees,
      targetElevation: 3 as Degrees,
      targetPolarization: 0 as Degrees,
      slewing: false,
      beaconFrequencyHz: 11711e6 as Hertz, // MERIDIAN-SAR-1 telemetry beacon
      beaconSearchBwHz: 1e6, // Wide enough for +/-273 kHz LEO Doppler
      beaconTrackingBwHz: 1e3,
      isLocked: false,
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
      loFrequency: 12600 as MHz, // Ku-band low-side LO
      filterHighHz: FrequencyBand.ku.upHigh,
      filterLowHz: FrequencyBand.ku.upLow,
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
      loFrequency: 13100 as MHz, // Ku-band high-side LO (IF = LO - RF)
      gain: 65 as dB,
      lnaNoiseFigure: 0.8,
      mixerNoiseFigure: 16.0,
      noiseTemperature: 60, // K - stable
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
  }],
  spectrumAnalyzers: [
    {
      referenceLevel: -60 as dBm,
      centerFrequency: 1414e6 as Hertz, // MERIDIAN-SAR-1 video downlink IF
      span: 60e6 as Hertz,
      rbw: 1e6 as Hertz,
      minAmplitude: -110 as dBm,
      maxAmplitude: -50 as dBm,
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
  transmitters: [{
    activeModem: 1,
    modems: [{
      isPowered: true,
      antenna_id: 1,
      modem_number: 1,
      isFaulted: false,
      isTransmitting: false,
      isTransmittingSwitchUp: false,
      isFaultSwitchUp: false,
      id: 1,
      isLoopback: false,
      ifSignal: {
        signalId: 'GW-01-MERIDIAN-CMD',
        serverId: 1,
        noradId: 61701,
        polarization: 'V',
        feed: '',
        isDegraded: false,
        origin: SignalOrigin.TRANSMITTER,
        noiseFloor: null,
        gainInPath: 0 as dBi,
        frequency: 1405e6 as IfFrequency, // -> 14005 MHz Ku telecommand uplink
        power: -7 as dBm,
        bandwidth: 36e6 as Hertz,
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
      frequency: 1414 as MHz, // MERIDIAN-SAR-1 video downlink IF
      bandwidth: 36 as MHz,
      modulation: 'QPSK',
      fec: '3/4',
      antenna_id: 1,
    }],
  }],
} as GroundStationConfig;

/**
 * NATS Europe - Shetland Ground Station (SH-02)
 *
 * The second EU site, debuting in scenario 5. Deliberately the SAME hardware as
 * GW-01 (4m Ku LEO tracker, identical frequency plan) so the lesson the
 * two-station scenarios teach is *scheduling*, not new equipment.
 *
 * Its higher latitude (60.15 N vs Galway's 53.27 N) gives complementary pass
 * geometry on sun-synchronous birds - more passes per day, and overlap windows
 * with Galway that the operator has to deconflict.
 *
 * KNOWN MODELING LIMIT: OrbitalSatellite carries a single observer (Galway), so
 * satellite az/el/range telemetry is Galway-relative everywhere. Contact
 * planning across the two sites is therefore modeled abstractly by
 * ContactScheduleManager (windows + conflicts) rather than by propagating each
 * station separately. Scenarios must not ask the operator to *track* from
 * SH-02; they allocate contacts to it. Lifting this needs per-station
 * propagation in OrbitalSatellite.
 */
export const shetlandGroundStation = {
  // Deep clone, NOT a spread: the config's nested antennasState / rfFrontEnds /
  // receivers objects are handed to the equipment constructors and mutated at
  // runtime, so a shallow copy would make Shetland and Galway share one
  // antenna's live state.
  ...structuredClone(galwayGroundStation),
  id: 'SH-02',
  name: 'Shetland Ground Station',
  location: {
    latitude: 60.15,
    longitude: -1.15,
    elevation: 35,
  },
} as GroundStationConfig;
