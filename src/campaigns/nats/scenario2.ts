import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { maineGroundStationConfig, vermontGroundStation } from './ground-stations';
import { natsHtmlLayout } from './html-layout';
import { ses10Satellite, tidemark1Satellite } from './satellites';

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
  id: 'nats-scenario2',
  url: 'nats/scenarios/nats-scenario2',
  prerequisiteScenarioIds: [],
  imageUrl: 'nats/2/card.png',
  number: 2,
  title: 'Scheduled Maintenance',
  subtitle: 'Power Down and Recovery Procedures',
  duration: '20-25 min',
  difficulty: 'beginner',
  missionType: 'Tutorial',
  description: `The maintenance crew needs to perform work on the TIDEMARK-1 antenna feed assembly. You'll power down the transmit chain in the proper sequence to ensure safety (don't radiate the maintenance crew), move the antenna to stow position for access, then restore service after the maintenance window.<br><br>This is your first time actually controlling the equipment. Charlie will provide all frequency values and configuration settings - you just need to execute the procedures in the correct order.<br><br>Key lesson: Sequence matters. RF safety protocols exist for a reason.`,
  equipment: [
    '9-meter C-band Antenna',
    'RF Front End',
    'Spectrum Analyzer',
    'Receiver Modem (pre-configured)',
    'Transmitter Modem (pre-configured)',
  ],
  settings: {
    isSync: true,
    groundStations: [
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            hpa: { isHpaEnabled: true, isHpaSwitchEnabled: true },
          }),
        ],
      },
      { ...maineGroundStationConfig, isOperational: false },
    ],
    layout: natsHtmlLayout,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-2?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
    ],
  },
  objectives: [
    {
      id: 'safety-briefing',
      title: 'Phase 1: Safety Briefing',
      description: 'Acknowledge the RF safety procedures and maintenance window.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'status-check',
          description: 'Maintenance Safety Briefing Acknowledged',
          params: {
            question: 'I need you to confirm you understand the RF safety briefing for today\'s maintenance work. Company policy is that I need you to verbally acknowledge before we can proceed. Lawyer\'s and such...',
            options: [
              'I have received and understood the RF safety briefing for today\'s maintenance work.',
            ],
            correctIndex: 0,
            explanation: 'Acknowledging the RF safety briefing is a critical step to ensure all personnel are aware of the safety procedures before maintenance work begins.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'disable-hpa-output',
      title: 'Phase 2a: Disable HPA Output',
      description: 'Disable the High Power Amplifier output by toggling the HPA enable switch off.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['safety-briefing'],
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'power-off-hpa',
      title: 'Phase 2b: Power Off HPA',
      description: 'Power off the High Power Amplifier completely.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['disable-hpa-output'],
      conditions: [
        {
          type: 'equipment-not-powered',
          description: 'HPA Powered Off',
          params: {
            equipment: 'hpa',
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'mute-buc',
      title: 'Phase 3: Mute BUC RF Output',
      description: 'Mute the Block Upconverter to stop all RF transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-off-hpa'],
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
          type: 'equipment-not-powered',
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
      id: 'antenna-maintenance',
      title: 'Phase 5: Move Antenna to Maintenance Position',
      description: 'Command the antenna to maintenance position (Az: 0°, El: 5) for maintenance access.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-down-lnb'],
      conditions: [
        {
          type: 'antenna-position',
          description: 'Antenna Reached Maintenance Position',
          params: {
            trackingMode: 'maintenance',
            elevation: 5 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
      ],
      timePenalty: {
        elapsedTimeThreshold: 30, // 15 minutes
        pointsDeducted: 30,
        message: "You delayed maintenance getting started on time. Don't let it happen again."
      },
      points: 15,
    },
    {
      id: 'repoint-antenna',
      title: 'Phase 7: Repoint Antenna at TIDEMARK-1',
      description: 'Command antenna to return to operational pointing (Az: 214.2°, El: 24.8°).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['antenna-maintenance'],
      conditions: [
        {
          type: 'antenna-position',
          description: 'Operational Position Commanded',
          params: {
            trackingMode: 'program-track',
            azimuth: 161.8 as Degrees,
            elevation: 34.2 as Degrees,
            tolerance: 0.1 as Degrees,
          },
        },
      ],
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
      id: 'unmute-buc',
      title: 'Phase 10a: Unmute BUC RF Output',
      description: 'Unmute the Block Upconverter to allow RF transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon'],
      conditions: [
        {
          type: 'buc-unmuted',
          description: 'BUC RF Output Unmuted',
          maintainUntilObjectiveComplete: true,
        },
      ],
      points: 10,
    },
    {
      id: 'power-on-hpa',
      title: 'Phase 10b: Power On HPA',
      description: 'Power on the High Power Amplifier.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['unmute-buc'],
      conditions: [
        {
          type: 'equipment-powered',
          description: 'HPA Powered On',
          params: {
            equipment: 'hpa',
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      points: 5,
    },
    {
      id: 'enable-hpa-output',
      title: 'Phase 10c: Enable HPA Output',
      description: 'Enable the High Power Amplifier output to restore full service.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-on-hpa'],
      conditions: [
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          maintainUntilObjectiveComplete: true,
        },
      ],
      points: 5,
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
      'enable-hpa-output': {
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
