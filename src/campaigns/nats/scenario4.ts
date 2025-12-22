import type { AntennaState } from '@app/equipment/antenna';
import { ANTENNA_CONFIG_KEYS } from '@app/equipment/antenna/antenna-configs';
import { BUCModuleCore } from '@app/equipment/rf-front-end/buc-module';
import { CouplerState, TapPoint } from '@app/equipment/rf-front-end/coupler-module/coupler-module';
import { IfFilterBankModuleCore } from '@app/equipment/rf-front-end/filter-module';
import { HPAModuleCore } from '@app/equipment/rf-front-end/hpa-module';
import { OMTModule } from '@app/equipment/rf-front-end/omt-module/omt-module';
import { Satellite } from '@app/equipment/satellite/satellite';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import { SignalOrigin } from "@app/SignalOrigin";
import type { dB, dBi, dBm, FECType, Hertz, MHz, ModulationType, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';

/**
 * NATS Level 4: "New Bird, No Handbook"
 *
 * Phase: Mastery (first independent level)
 * Time Pressure: None
 * Calculation Required: YES - RF to IF conversions
 * New UI Elements: Reference guide, calculation confirmation dialogs
 *
 * Premise: TIDEMARK-2 just reached geostationary orbit at 45°W. Spacecraft team
 * has provided the beacon frequency, but you need to calculate all IF frequencies
 * yourself. No more pre-filled values. Charlie checks your math before you execute.
 */

export const scenario4Data: ScenarioData = {
  id: 'nats-level-4-new-bird',
  prerequisiteScenarioIds: [],
  url: 'nats/level-4/new-bird-no-handbook',
  imageUrl: 'nats/4/card.png',
  number: 4,
  title: 'Level 4: "New Bird, No Handbook"',
  subtitle: 'Independent RF Calculations',
  duration: '30-35 min',
  difficulty: 'intermediate',
  missionType: 'Mastery Phase',
  description: `TIDEMARK-2 has just reached geostationary orbit at 45°W. The spacecraft operations team in Halifax has confirmed station-keeping and handed over the communications payload to ground operations.<br><br>SeaLink has provided the beacon frequency: 3,947.8 MHz. Your target IF frequency is the standard 1,247.5 MHz. You must calculate the required LNB local oscillator frequency, select appropriate filter bandwidth, and configure the spectrum analyzer parameters yourself.<br><br>Charlie will check your calculations before you execute. This is the transition to mastery - no more hand-holding with pre-filled values. Show your work.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Reference Documentation',
  ],
  settings: {
    isSync: true,
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
            // Stowed initially
            isPowered: true,
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            polarization: 0 as Degrees,
            isTracking: false,
            trackingMode: 'manual',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [{
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
            isPowered: true,
            bandwidthIndex: 0, // Student must select
          },
          lnb: {
            isPowered: false,
            loFrequency: 0 as MHz, // Student must calculate
            gain: 0 as dB,
            lnaNoiseFigure: 0.6,
            mixerNoiseFigure: 16.0,
            noiseTemperature: 25,
            noiseTemperatureStabilizationTime: 180,
            isExtRefLocked: false,
            noiseFloor: -140,
            frequencyError: 0,
            temperature: 22,
            thermalStabilizationTime: 180,
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
            isLocked: true,
            warmupTimeRemaining: 0,
            temperature: 65,
            gnssSignalPresent: true,
            isGnssSwitchUp: true,
            isGnssAcquiringLock: false,
            satelliteCount: 11,
            utcAccuracy: 18,
            constellation: 'GPS',
            lockDuration: 86400,
            frequencyAccuracy: 1e-12,
            allanDeviation: 5e-13,
            phaseNoise: -140,
            isInHoldover: false,
            holdoverDuration: 0,
            holdoverError: 0,
            active10MHzOutputs: 1, // Only GPSDO itself currently
            max10MHzOutputs: 5,
            output10MHzLevel: 0,
            ppsOutputsEnabled: true,
            operatingHours: 86400,
            selfTestPassed: true,
            agingRate: 1e-10,
          },
        }],
        spectrumAnalyzers: [
          {
            referenceLevel: 0, // Student must configure
            centerFrequency: 1e9 as Hertz, // Student must configure
            span: 100e6 as Hertz, // Student must configure
            rbw: 1e6 as Hertz, // Student must configure
            minAmplitude: -170,
            maxAmplitude: 0,
            scaleDbPerDiv: 17 as dB,
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
        receivers: [],
      },
    ],
    satellites: [
      new Satellite(
        2, // TIDEMARK-2
        [
          {
            signalId: 'tidemark-2-beacon',
            serverId: 1,
            noradId: 2,
            frequency: 3947.8e6 as RfFrequency, // Provided to student
            polarization: 'H',
            power: -93 as dBm, // Slightly stronger (newer satellite)
            bandwidth: 1e3 as Hertz, // CW beacon
            modulation: 'CW' as ModulationType,
            fec: 'none' as FECType,
            feed: null,
            isDegraded: false,
            origin: SignalOrigin.SATELLITE_TX,
            noiseFloor: null,
            gainInPath: 0 as dBi,
          },
        ],
        [],
        {
          az: 219.7 as Degrees, // 45°W from Vermont
          el: 26.3 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ],
  },
  objectives: [
    {
      id: 'review-documentation',
      title: 'Phase 1: Review Reference Documentation',
      description: 'Read the RF calculations guide and TIDEMARK-2 operations note.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'document-viewed',
          description: 'RF Calculations Guide Reviewed',
          params: {
            documentId: 'rf-calculations-guide',
          },
          mustMaintain: false,
        },
        {
          type: 'document-viewed',
          description: 'TIDEMARK-2 Operations Note Reviewed',
          params: {
            documentId: 'tidemark-2-ops-note',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'calculate-lnb-lo',
      title: 'Phase 2: Calculate LNB Local Oscillator Frequency',
      description: 'Calculate required LO frequency. Submit calculation for Charlie\'s approval.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-documentation'],
      conditions: [
        {
          type: 'calculation-submitted',
          description: 'LO Frequency Calculation Submitted',
          params: {
            calculationType: 'lnb-lo-frequency',
            correctAnswer: 2700.3, // MHz: 3947.8 - 1247.5
            tolerance: 0.1,
            showWork: true,
          },
          mustMaintain: false,
        },
        {
          type: 'calculation-approved',
          description: 'Charlie Approved Calculation',
          params: {
            calculationType: 'lnb-lo-frequency',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'select-if-filter',
      title: 'Phase 3: Select IF Filter Bandwidth',
      description: 'Choose appropriate IF filter for CW beacon signal. Explain your selection.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-lnb-lo'],
      conditions: [
        {
          type: 'filter-selected',
          description: 'Narrow IF Filter Selected (10 kHz)',
          params: {
            filterId: 3, // 10 kHz filter
          },
          mustMaintain: false,
        },
        {
          type: 'selection-justified',
          description: 'Filter Selection Justified',
          params: {
            selectionType: 'if-filter',
            correctReasoning: 'cw-beacon-narrow-bandwidth',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'configure-spectrum-analyzer',
      title: 'Phase 4: Configure Spectrum Analyzer',
      description: 'Set SpecA parameters for CW beacon acquisition (Center: 1,247.5 MHz, appropriate span/RBW).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['select-if-filter'],
      conditions: [
        {
          type: 'frequency-set',
          description: 'Center Frequency: 1,247.5 MHz',
          params: {
            frequency: 1247.5e6 as RfFrequency,
            tolerance: 1e3 as Hertz,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-span-set',
          description: 'Span: 5-10 kHz (narrow for CW)',
          params: {
            minSpan: 5e3,
            maxSpan: 10e3,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW: ≤ 100 Hz (very narrow)',
          params: {
            maxRbw: 100,
          },
          mustMaintain: false,
        },
        {
          type: 'speca-reference-level-set',
          description: 'Reference Level: -85 to -90 dBm',
          params: {
            minReferenceLevel: -90,
            maxReferenceLevel: -85,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'point-antenna',
      title: 'Phase 5: Point Antenna at TIDEMARK-2',
      description: 'Command antenna to Az: 219.7°, El: 26.3° (45°W from Vermont).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-spectrum-analyzer'],
      conditions: [
        {
          type: 'antenna-position-command',
          description: 'TIDEMARK-2 Position Commanded',
          params: {
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            tolerance: 1.0 as Degrees,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position-reached',
          description: 'Antenna On Target',
          params: {
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-configure-lnb',
      title: 'Phase 6: Power and Configure LNB',
      description: 'Power LNB with calculated LO frequency and standard 55 dB gain.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['point-antenna'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'LNB Powered',
          params: {
            equipment: 'lnb',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Set to Calculated Value (2,700.3 MHz)',
          params: {
            loFrequency: 2700.3 as MHz,
            loFrequencyTolerance: 0.5, // Allow small rounding
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain Set to 55 dB',
          params: {
            gain: 55,
            gainTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-thermally-stable',
          description: 'LNB Thermally Stabilized',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-beacon',
      title: 'Phase 7: Acquire TIDEMARK-2 Beacon',
      description: 'Verify beacon signal appears on spectrum analyzer at correct frequency.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-configure-lnb'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Beacon Detected at 1,247.5 MHz ± 1 kHz',
          params: {
            signalId: 'tidemark-2-beacon',
            minPower: -96 as dBm, // -93 expected, allow margin
          },
          mustMaintain: false,
        },
        {
          type: 'signal-level-correct',
          description: 'Signal Level Within Expected Range (-95 to -91 dBm)',
          params: {
            signalId: 'tidemark-2-beacon',
            minPower: -95 as dBm,
            maxPower: -91 as dBm,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        The spacecraft team just sent the beacon frequency for TIDEMARK-2: 3,947.8 megahertz. Standard IF target is 1,247.5 megahertz.
      </p>
      <p>
        You've got the equations in the reference guide. Show me your LO calculation before you configure the LNB. I need to see your work.
      </p>
      <p>
        This is the first time you're doing this without me giving you the answer. Take your time, use the documentation, get it right.
      </p>
      <p>
        When you're ready, submit your calculation and I'll check it before you execute.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/4/intro.mp3'),
    },
    objectives: {
      'calculate-lnb-lo': {
        text: `
        <p>
          2,700.3 megahertz. That's correct. 3,947.8 minus 1,247.5 equals 2,700.3.
        </p>
        <p>
          Good work showing the calculation. Math matters here - one decimal place wrong and you won't see the beacon.
        </p>
        <p>
          Now select your IF filter. Think about the signal type - CW beacon, very narrow bandwidth.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-calculation.mp3'),
      },
      'select-if-filter': {
        text: `
        <p>
          Ten kilohertz filter. Right choice. CW signal doesn't need wide bandwidth - narrower filter means less noise.
        </p>
        <p>
          Configure the spectrum analyzer now. Center frequency at your target IF, narrow span for the CW beacon, tight RBW.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-filter.mp3'),
      },
      'configure-spectrum-analyzer': {
        text: `
        <p>
          Spectrum analyzer's configured. Center at 1,247.5 megahertz, 5 kilohertz span, 100 hertz RBW. Reference level appropriate for the expected signal.
        </p>
        <p>
          Point the antenna at TIDEMARK-2 and power up the LNB with your calculated settings.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-speca.mp3'),
      },
      'power-configure-lnb': {
        text: `
        <p>
          LNB's up with your calculated LO frequency. Temperature stabilizing.
        </p>
        <p>
          If your math was right, you should see the beacon appear right at center frequency when the LNB comes up to temperature.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-lnb.mp3'),
      },
      'acquire-beacon': {
        text: `
        <p>
          There it is. Clean spike at 1,247.5 megahertz, signal level right where the spacecraft team predicted.
        </p>
        <p>
          You calculated correctly, configured correctly, and acquired on first try. That's exactly what I wanted to see.
        </p>
        <p>
          You can do the math now. Next time, we'll work with a satellite that's got an inclined orbit - TIDEMARK-1's been drifting for a while. I'll show you how to track it.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/complete.mp3'),
      },
    },
  },
};
