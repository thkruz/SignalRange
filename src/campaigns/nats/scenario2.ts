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
 * NATS Level 2: "Scheduled Maintenance"
 *
 * Phase: Tutorial
 * Time Pressure: None
 * Calculation Required: None (all values provided)
 * New UI Elements: LNB/BUC/ACU controls, RF mute switches
 *
 * Premise: Take TIDEMARK-1 offline for planned antenna maintenance, then bring
 * it back online. First time actually touching the controls yourself. Maintenance
 * crew needs to work on the antenna feed assembly.
 */

export const scenario2Data: ScenarioData = {
  id: 'nats-level-2-maintenance',
  prerequisiteScenarioIds: ['nats-level-1-first-day'],
  url: 'nats/level-2/scheduled-maintenance',
  imageUrl: 'nats/2/card.png',
  number: 2,
  title: 'Level 2: "Scheduled Maintenance"',
  subtitle: 'Power Down and Recovery Procedures',
  duration: '20-25 min',
  difficulty: 'beginner',
  missionType: 'Tutorial',
  description: `The maintenance crew needs to perform work on the TIDEMARK-1 antenna feed assembly. You'll power down the transmit chain in the proper sequence to ensure safety (don't radiate the maintenance crew), move the antenna to stow position for access, then restore service after the maintenance window.<br><br>This is your first time actually controlling the equipment. Charlie will provide all frequency values and configuration settings - you just need to execute the procedures in the correct order.<br><br>Key lesson: Sequence matters. RF safety protocols exist for a reason.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End (GPSDO, LNB, BUC, HPA)',
    'Spectrum Analyzer',
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
            // TIDEMARK-1 currently serving traffic
            isPowered: true,
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            polarization: 0 as Degrees,
            isTracking: true,
            trackingMode: 'step-track',
          } as Partial<AntennaState>,
        ],
        rfFrontEnds: [{
          omt: OMTModule.getDefaultState(),
          buc: {
            ...BUCModuleCore.getDefaultState(),
            isPowered: true,
            loFrequency: 2225 as MHz,
            outputPower: 10 as dBm,
            isMuted: false,
            isExtRefLocked: true,
          },
          hpa: {
            ...HPAModuleCore.getDefaultState(),
            isPowered: true,
            isHpaEnabled: true,
            outputPower: 100 as dBm, // Watts - actively transmitting
          },
          filter: {
            ...IfFilterBankModuleCore.getDefaultState(),
            isPowered: true,
            bandwidthIndex: 3, // 36 MHz
          },
          lnb: {
            isPowered: true,
            loFrequency: 5150 as MHz,
            gain: 55 as dB,
            lnaNoiseFigure: 0.6,
            mixerNoiseFigure: 16.0,
            noiseTemperature: 65,
            noiseTemperatureStabilizationTime: 0,
            isExtRefLocked: true,
            noiseFloor: -140,
            frequencyError: 0,
            temperature: 45,
            thermalStabilizationTime: 0,
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
            satelliteCount: 12,
            utcAccuracy: 15,
            constellation: 'GPS',
            lockDuration: 43200,
            frequencyAccuracy: 1e-12,
            allanDeviation: 5e-13,
            phaseNoise: -140,
            isInHoldover: false,
            holdoverDuration: 0,
            holdoverError: 0,
            active10MHzOutputs: 5,
            max10MHzOutputs: 5,
            output10MHzLevel: 0,
            ppsOutputsEnabled: true,
            operatingHours: 43200,
            selfTestPassed: true,
            agingRate: 1e-10,
          },
        }],
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
        receivers: [],
      },
    ],
    satellites: [
      new Satellite(
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
        ],
        [],
        {
          az: 214.2 as Degrees,
          el: 24.8 as Degrees,
          frequencyOffset: 2.225e9 as Hertz,
        }
      ),
    ]
  },
  objectives: [
    {
      id: 'safety-briefing',
      title: 'Phase 1: Safety Briefing',
      description: 'Acknowledge the RF safety procedures and maintenance window.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'briefing-acknowledged',
          description: 'Maintenance Safety Briefing Acknowledged',
          params: {
            briefingId: 'rf-safety',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'power-down-hpa',
      title: 'Phase 2: Disable HPA',
      description: 'Disable the High Power Amplifier using the two-step ARM/DISABLE procedure.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['safety-briefing'],
      conditions: [
        {
          type: 'hpa-armed',
          description: 'HPA ARM Button Clicked',
          mustMaintain: false,
        },
        {
          type: 'equipment-disabled',
          description: 'HPA Disabled',
          params: {
            equipment: 'hpa',
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'mute-buc',
      title: 'Phase 3: Mute BUC RF Output',
      description: 'Mute the Block Upconverter to stop all RF transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-down-hpa'],
      conditions: [
        {
          type: 'buc-muted',
          description: 'BUC RF Output Muted',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-down-lnb',
      title: 'Phase 4: Power Down LNB',
      description: 'Power off the Low Noise Block to complete RF chain shutdown.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['mute-buc'],
      conditions: [
        {
          type: 'equipment-powered-off',
          description: 'LNB Powered Off',
          params: {
            equipment: 'lnb',
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'antenna-stow',
      title: 'Phase 5: Move Antenna to Stow Position',
      description: 'Command the antenna to stow position (Az: 0°, El: 90°) for maintenance access.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-down-lnb'],
      conditions: [
        {
          type: 'antenna-position-command',
          description: 'Stow Position Commanded (Az: 0°, El: 90°)',
          params: {
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position-reached',
          description: 'Antenna Reached Stow Position',
          params: {
            azimuth: 0 as Degrees,
            elevation: 90 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'maintenance-window',
      title: 'Phase 6: Maintenance Window',
      description: 'Wait for maintenance crew to complete work on antenna feed assembly.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['antenna-stow'],
      conditions: [
        {
          type: 'time-elapsed',
          description: 'Maintenance Completed (simulated time skip)',
          params: {
            duration: 300, // 5 minutes simulated
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 0,
    },
    {
      id: 'repoint-antenna',
      title: 'Phase 7: Repoint Antenna at TIDEMARK-1',
      description: 'Command antenna to return to operational pointing (Az: 214.2°, El: 24.8°).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['maintenance-window'],
      conditions: [
        {
          type: 'antenna-position-command',
          description: 'Operational Position Commanded',
          params: {
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position-reached',
          description: 'Antenna Reached Operational Position',
          params: {
            azimuth: 214.2 as Degrees,
            elevation: 24.8 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'power-up-lnb',
      title: 'Phase 8: Restore LNB',
      description: 'Power on LNB with settings: LO 5,150 MHz, Gain 55 dB. Wait for thermal stabilization.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['repoint-antenna'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'LNB Powered On',
          params: {
            equipment: 'lnb',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-lo-set',
          description: 'LNB LO Set to 5,150 MHz',
          params: {
            loFrequency: 5150 as MHz,
            loFrequencyTolerance: 0,
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
      id: 'verify-beacon',
      title: 'Phase 9: Verify Beacon Reception',
      description: 'Confirm TIDEMARK-1 beacon is visible on spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-lnb'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected (3,947.8 MHz)',
          params: {
            signalId: 'tidemark-1-beacon',
            minPower: -100 as dBm,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'restore-transmit',
      title: 'Phase 10: Restore Transmit Chain',
      description: 'Unmute BUC and enable HPA to restore full service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon'],
      conditions: [
        {
          type: 'buc-unmuted',
          description: 'BUC RF Output Unmuted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-armed',
          description: 'HPA ARM Button Clicked',
          mustMaintain: false,
        },
        {
          type: 'equipment-enabled',
          description: 'HPA Enabled',
          params: {
            equipment: 'hpa',
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        The maintenance crew needs to work on the antenna feed assembly in fifteen minutes. We're taking TIDEMARK-1 offline for the window.
      </p>
      <p>
        We do this right, or someone gets a face full of RF. Let's start with the HPA. See that red ENABLE button? Click ARM first, then DISABLE. Two-step process prevents accidents.
      </p>
      <p>
        Sequence matters here. HPA first, then BUC mute, then LNB power down, then we stow the antenna. Never skip steps, never reverse order.
      </p>
      <p>
        After maintenance, we reverse the process. Antenna back on target, LNB up, verify beacon, then restore transmit. I'll walk you through each step.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONCERNED,
      audioUrl: getAssetUrl('/assets/campaigns/nats/2/intro.mp3'),
    },
    objectives: {
      'power-down-hpa': {
        text: `
        <p>
          HPA's disabled. No more RF coming from that amplifier. Good.
        </p>
        <p>
          Now mute the BUC. That's the last line of defense before we let anyone climb the tower.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-hpa-down.mp3'),
      },
      'mute-buc': {
        text: `
        <p>
          BUC's muted. No RF transmission anywhere in the chain now.
        </p>
        <p>
          Power down the LNB next. We don't need it while the antenna's stowed anyway.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-buc-mute.mp3'),
      },
      'antenna-stow': {
        text: `
        <p>
          Antenna's at stow. Maintenance crew has the all-clear.
        </p>
        <p>
          They're replacing a waveguide flange gasket - should take about fifteen minutes. We'll fast-forward through that.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-stow.mp3'),
      },
      'maintenance-window': {
        text: `
        <p>
          Maintenance is complete. Crew's clear of the tower. Time to bring the link back up.
        </p>
        <p>
          Point the antenna back at 214.2 degrees azimuth, 24.8 degrees elevation. That's where TIDEMARK-1 sits in our sky.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-maintenance-done.mp3'),
      },
      'power-up-lnb': {
        text: `
        <p>
          LNB's powered and configured. LO at 5,150 megahertz, gain at 55 dB.
        </p>
        <p>
          Temperature's climbing - it'll stabilize in about three minutes. Wait for the thermal indicator to go green.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-lnb-up.mp3'),
      },
      'verify-beacon': {
        text: `
        <p>
          There's the beacon. Clean acquisition at 3,947.8 MHz, right where it should be.
        </p>
        <p>
          Now we can restore transmit. Unmute the BUC, then enable the HPA. Same ARM procedure as before.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-beacon.mp3'),
      },
      'restore-transmit': {
        text: `
        <p>
          Link's restored. TIDEMARK-1 back in service, customers are happy, maintenance is done.
        </p>
        <p>
          That's how scheduled maintenance goes. Power down in sequence, stow safely, restore in reverse order. You did it correctly.
        </p>
        <p>
          Tomorrow we'll do a weather handover to the Maine site. Same principles, different scenario.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/complete.mp3'),
      },
    },
  },
};
