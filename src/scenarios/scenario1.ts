import { html } from '@app/engine/utils/development/formatter';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-configs';
import { BUCModule } from '@app/equipment/rf-front-end/buc-module/buc-module';
import { CouplerModule } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModule } from '@app/equipment/rf-front-end/filter-module/filter-module';
import { HPAModule } from '@app/equipment/rf-front-end/hpa-module/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Objective } from '@app/objectives/objective-types';
import { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency, SignalOrigin } from '@app/types';
import { Degrees } from 'ootk';
import { ScenarioData } from '../scenario-manager';

/**
 * Scenario 1: "First Light" - HELIOS-7 Initial Contact
 *
 * A beginner-level scenario where the student conducts the first ground station
 * link test with a newly launched C-band communications satellite.
 */

export const scenario1Data: ScenarioData = {
  id: 'scenario1',
  url: 'scenarios/1',
  imageUrl: 'scenario1.jpg',
  number: 1,
  title: '"First Light"',
  subtitle: 'HELIOS-7 Initial Contact',
  duration: '25-30 min',
  difficulty: 'beginner',
  missionType: 'Commercial Communications',
  description: `You are a Ground Station Operator at Pacific Edge Communications facility in Guam. Your company has just launched HELIOS-7, a new C-band communications satellite. The satellite is now station-keeping at 145°E geostationary orbit. You will conduct the first ground station link test - a critical milestone before commercial operations begin.<br><br> This scenario will guide you through setting up the ground station equipment, acquiring the satellite signal, and performing initial signal quality measurements. You'll learn the basics of antenna pointing, RF front end configuration, and spectrum analysis in a hands-on environment.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
  ],
  settings: {
    isSync: true,
    antennas: [ANTENNA_CONFIG_KEYS.C_BAND_9M_VORTEK],
    rfFrontEnds: [{
      // Module states managed by their respective classes
      omt: OMTModule.getDefaultState(),
      buc: BUCModule.getDefaultState(),
      hpa: HPAModule.getDefaultState(),
      filter: IfFilterBankModule.getDefaultState(),
      lnb: {
        isPowered: false,
        loFrequency: 4200 as MHz, // MHz
        gain: 0 as dB,
        lnaNoiseFigure: 0.6, // dB
        mixerNoiseFigure: 16.0, // dB
        noiseTemperature: 45, // K
        noiseTemperatureStabilizationTime: 180, // seconds
        isExtRefLocked: false,
        isSpectrumInverted: true,
        noiseFloor: -140, // dBm/Hz
        frequencyError: 0, // Hz
        temperature: 25, // °C
        thermalStabilizationTime: 180, // seconds
      },
      coupler: CouplerModule.getDefaultState(),
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
    spectrumAnalyzers: 1,
    transmitters: 0,
    receivers: 0,
    layout: html`
      <div id="mission-checklist-container">
        <div class="mission-brief-icon icon" title="Mission Brief"></div>
        <div class="checklist-icon icon" title="Mission Checklist"></div>
      </div>
      <div class="student-equipment scenario1-layout">
        <div class="paired-equipment-container">
          <div id="antenna1-container" class="antenna-container"></div>
          <div id="specA1-container" class="spec-a-container"></div>
        </div>
        <div id="rf-front-end1-container" class="paired-equipment-container"></div>
      </div>
    `,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-1?content-only=true&dark=true',
    satellites: [
      new Satellite(
        1,
        [
          {
            signalId: '1',
            serverId: 1,
            noradId: 1,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5935e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 10e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'red-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
          {
            signalId: '2',
            serverId: 1,
            noradId: 1,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5945e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 3e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'blue-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        {
          az: 247.3 as Degrees,
          el: 78.2 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
      new Satellite(
        2,
        [
          {
            signalId: '3',
            serverId: 1,
            noradId: 2,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5925e6 as RfFrequency,
            polarization: 'H',
            power: 40 as dBm, // 10 W
            bandwidth: 3e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'blue-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        {
          az: 247.6 as Degrees,
          el: 78.2 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
      new Satellite(
        3,
        [
          {
            signalId: '4',
            serverId: 1,
            noradId: 3,
            /** Must be the uplinkl to match the antenna in simulation */
            frequency: 5915e6 as RfFrequency,
            polarization: 'H',
            power: 43 as dBm, // 20 W
            bandwidth: 5e6 as Hertz,
            modulation: '8QAM' as ModulationType, // We need about 7 C/N to support 8QAM
            fec: '3/4' as FECType,
            feed: 'blue-1.mp4',
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_RX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          }
        ],
        {
          az: 247.1 as Degrees,
          el: 78.2 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ]
  },
  objectives: [
    {
      id: 'acquire-lock-satellite-1',
      title: 'Acquire and Maintain Lock on HELIOS-7',
      description: 'Point the antenna at satellite 1 (HELIOS-7) and achieve stable tracking lock. The lock must be maintained for at least 10 seconds.',
      conditions: [
        {
          type: 'antenna-locked',
          description: 'Antenna locked on Satellite 1',
          params: {
            satelliteId: 1,
          },
          mustMaintain: true,
          maintainDuration: 10, // Must maintain lock for 10 seconds
        },
      ],
      conditionLogic: 'AND',
      points: 100,
    },
  ] as Objective[],
}
