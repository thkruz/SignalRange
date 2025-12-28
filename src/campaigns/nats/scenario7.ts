import { type AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from "@app/equipment/antenna/antenna-config-keys";
import { Receiver } from '@app/equipment/receiver/receiver';
import { BUCModuleCore } from '@app/equipment/rf-front-end/buc-module';
import { CouplerState } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { TapPoint } from '@app/equipment/rf-front-end/coupler-module/tap-points';
import { IfFilterBankModuleCore } from '@app/equipment/rf-front-end/filter-module';
import { HPAModuleCore } from '@app/equipment/rf-front-end/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from '@app/signal-origin';
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import type { Degrees } from 'ootk';

/**
 * NATS Level 7: "Equipment Cascade"
 *
 * Phase: Pressure
 * Time Pressure: High (20 minutes before frequency drift causes service loss)
 * Calculation Required: As needed
 * New UI Elements: Fault isolation tools, backup system controls, holdover monitoring
 *
 * Premise: 10 PM shift. GPSDO has lost GNSS lock and entered holdover mode. Charlie
 * is at dinner but reachable by phone. You're solo on console and need to maintain
 * TIDEMARK-1 service while troubleshooting. 5 minutes in, LNB temperature alarm appears.
 * Cascade failure scenario - manage multiple simultaneous faults.
 */

export const scenario7Data: ScenarioData = {
  id: 'nats-level-7-equipment-cascade',
  isDisabled: true,
  prerequisiteScenarioIds: ['nats-level-6-interference-hunt'],
  url: 'nats/level-7/equipment-cascade',
  imageUrl: 'nats/7/card.png',
  number: 7,
  title: 'Level 7: "Equipment Cascade"',
  subtitle: 'Multiple Fault Management',
  duration: '25-30 min (20 min deadline)',
  difficulty: 'advanced',
  missionType: 'Pressure Phase',
  description: `It's 10 PM. You're solo on the night shift. Charlie just left for dinner - he'll be back in 45 minutes.<br><br>The GPSDO alarm sounds. GNSS lock lost - the reference oscillator has entered holdover mode. It's still providing a 10 MHz reference, but the frequency accuracy is slowly degrading. You have approximately 20 minutes before accumulated drift causes loss of service on TIDEMARK-1.<br><br>5 minutes into troubleshooting the GPSDO issue, a second alarm: LNB temperature rising above operational limits. Now you're managing two simultaneous equipment faults while trying to keep the customer link online.<br><br>Charlie is reachable by phone for guidance, but he can't physically help. This is cascade failure management - prioritize, troubleshoot methodically, decide when to use backup systems. Keep the service running.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (with backup GPSDO reference)',
    'Backup LNB (hot spare)',
    'Spectrum Analyzer',
    'Receiver Modem',
    'Fault Isolation Tools',
  ],
  settings: {
    isSync: true,
    // cascadeEventTimings: {
    //   primaryFault: 0, // GPSDO holdover at mission start
    //   secondaryFault: 300, // LNB temp alarm at 5 minutes
    // },
    groundStations: [
      {
        id: 'VT-01',
        name: 'Vermont Ground Station',
        location: {
          latitude: 44.5588,
          longitude: -72.5778,
          elevation: 350,
        },
        antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
        antennasState: [
          {
            // Currently serving TIDEMARK-1
            isPowered: true,
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            polarization: 0 as Degrees,
            isTracking: true,
            trackingMode: 'step-track',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [
          {
            // Primary RF front end
            omt: OMTModule.getDefaultState(),
            buc: {
              ...BUCModuleCore.getDefaultState(),
              isPowered: false,
              loFrequency: 2225 as MHz,
              outputPower: 0 as dBm,
              isMuted: true,
              isExtRefLocked: true, // Still locked, but to degrading reference
            },
            hpa: {
              ...HPAModuleCore.getDefaultState(),
              isPowered: false,
              isHpaEnabled: false,
              outputPower: 0 as dBm,
            },
            filter: {
              ...IfFilterBankModuleCore.getDefaultState(),
              isPowered: true,
              bandwidthIndex: 3,
            },
            lnb: {
              isPowered: true,
              loFrequency: 5150 as MHz,
              gain: 55 as dB,
              lnaNoiseFigure: 0.6,
              mixerNoiseFigure: 16.0,
              noiseTemperature: 65, // Will rise to 95 at 5-minute mark
              noiseTemperatureStabilizationTime: 0,
              isExtRefLocked: true,
              noiseFloor: -140,
              frequencyError: 0, // Will increase over time due to GPSDO drift
              temperature: 45, // Will rise to 85 at 5-minute mark (ALARM)
              thermalStabilizationTime: 0,
              // temperatureAlarmThreshold: 75, // °C
            },
            coupler: {
              isPowered: true,
              tapPointA: TapPoint.TX_IF,
              tapPointB: TapPoint.RX_IF,
              availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
              availableTapPointsB: [TapPoint.RX_IF],
              couplingFactorA: -40,
              couplingFactorB: -39,
              isActiveA: true,
              isActiveB: true,
            } as CouplerState,
            gpsdo: {
              isPowered: true,
              isLocked: false, // *** PRIMARY FAULT: GNSS lock lost ***
              warmupTimeRemaining: 0,
              temperature: 65,
              gnssSignalPresent: false, // GPS antenna cable disconnected
              isGnssSwitchUp: false,
              isGnssAcquiringLock: false,
              satelliteCount: 0,
              utcAccuracy: 0,
              constellation: 'GPS',
              lockDuration: 0,
              frequencyAccuracy: 1e-9, // Degrading in holdover
              allanDeviation: 5e-11, // Worse than locked
              phaseNoise: -130, // Worse than locked
              isInHoldover: true, // *** HOLDOVER MODE ***
              holdoverDuration: 0, // Just entered holdover
              holdoverError: 0, // Will accumulate over time
              // holdoverStability: 1e-9, // Degrades at this rate
              // maxHoldoverTime: 1200, // 20 minutes before unacceptable drift
              active10MHzOutputs: 5, // Still feeding equipment
              max10MHzOutputs: 5,
              output10MHzLevel: 0,
              ppsOutputsEnabled: true,
              operatingHours: 86400,
              selfTestPassed: true,
              agingRate: 1e-10,
            },
          },
          {
            // Backup RF front end (hot spare, can be switched to)
            omt: OMTModule.getDefaultState(),
            buc: {
              ...BUCModuleCore.getDefaultState(),
              isPowered: false,
              loFrequency: 2225 as MHz,
              outputPower: 0 as dBm,
              isMuted: true,
              isExtRefLocked: false,
            },
            hpa: {
              ...HPAModuleCore.getDefaultState(),
              isPowered: false,
              isHpaEnabled: false,
              outputPower: 0 as dBm,
            },
            filter: {
              ...IfFilterBankModuleCore.getDefaultState(),
              isPowered: false,
              bandwidthIndex: 0,
            },
            lnb: {
              // Backup LNB - cold spare, needs configuration
              isPowered: false,
              loFrequency: 5150 as MHz,
              gain: 55 as dB,
              lnaNoiseFigure: 0.6,
              mixerNoiseFigure: 16.0,
              noiseTemperature: 20, // Cold
              noiseTemperatureStabilizationTime: 180,
              isExtRefLocked: false,
              noiseFloor: -140,
              frequencyError: 0,
              temperature: 18, // Cold
              thermalStabilizationTime: 180,
              // temperatureAlarmThreshold: 75,
            },
            coupler: {
              isPowered: false,
              tapPointA: TapPoint.TX_IF,
              tapPointB: TapPoint.RX_IF,
              availableTapPointsA: [TapPoint.TX_IF, TapPoint.TX_RF_POST_BUC],
              availableTapPointsB: [TapPoint.RX_IF],
              couplingFactorA: -40,
              couplingFactorB: -39,
              isActiveA: false,
              isActiveB: false,
            } as CouplerState,
            gpsdo: {
              // Backup GPSDO - available if needed
              isPowered: true,
              isLocked: true,
              warmupTimeRemaining: 0,
              temperature: 60,
              gnssSignalPresent: true,
              isGnssSwitchUp: true,
              isGnssAcquiringLock: false,
              satelliteCount: 9,
              utcAccuracy: 20,
              constellation: 'GPS',
              lockDuration: 86400,
              frequencyAccuracy: 1e-12,
              allanDeviation: 6e-13,
              phaseNoise: -138,
              isInHoldover: false,
              holdoverDuration: 0,
              holdoverError: 0,
              active10MHzOutputs: 0, // Not currently feeding anything
              max10MHzOutputs: 5,
              output10MHzLevel: 0,
              ppsOutputsEnabled: true,
              operatingHours: 86400,
              selfTestPassed: true,
              agingRate: 1.2e-10,
            },
          },
        ],
        spectrumAnalyzers: [
          {
            referenceLevel: -50,
            centerFrequency: 3947.8e6 as Hertz,
            span: 10e6 as Hertz,
            rbw: 10e3 as Hertz,
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 12 as dB,
            screenMode: 'both',
            inputUnit: 'MHz',
            inputValue: '',
            traces: [
              { isVisible: true, isUpdating: true, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
              { isVisible: false, isUpdating: false, mode: 'clearwrite' },
            ],
            selectedTrace: 1,
          }
        ],
        transmitters: [],
        receivers: [Receiver.getDefaultState()],
      },
    ],
    satellites: [
      new Satellite(
        'TIDEMARK-1',
        1,
        [
          {
            signalId: 'tidemark-1-beacon',
            serverId: 1,
            noradId: 1,
            frequency: 3947.8e6 as RfFrequency,
            polarization: 'H',
            power: -95 as dBm,
            bandwidth: 1e3 as Hertz,
            modulation: 'CW' as ModulationType,
            fec: 'none' as FECType,
            feed: null,
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            signalId: 'tidemark-1-carrier',
            serverId: 1,
            noradId: 1,
            frequency: 3952.5e6 as RfFrequency,
            polarization: 'H',
            power: -87 as dBm,
            bandwidth: 5e6 as Hertz,
            modulation: '16APSK' as ModulationType,
            fec: '3/4' as FECType,
            feed: 'maritime-data.mp4',
            isDegraded: false, // Not degraded yet, but will be if faults not fixed
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        [],
        {
          az: 214.2 as Degrees,
          el: 24.8 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
    // maintenanceLogs: [
    //   {
    //     timestamp: 'Earlier Today',
    //     entry: 'Roof maintenance crew reported GPS antenna cable may have been disturbed during snow removal',
    //   }
    // ],
  },
};
