import { html } from '@app/engine/utils/development/formatter';
import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz, RfFrequency } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

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
  id: 'nats-scenario4',
  url: 'nats/scenarios/nats-scenario4',
  prerequisiteScenarioIds: [],
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
    'Receiver Modem',
    'Transmitter Modem',
  ],
  settings: {
    isSync: true,
    groundStations: [
      vermontGroundStation,
      maineGroundStation
    ],
    layout: html`
              <div class="student-equipment scenario1-layout">
                <div class="paired-equipment-container">
                  <div id="antenna1-container" class="antenna-container"></div>
                  <div id="specA1-container" class="spec-a-container"></div>
                </div>
                <div id="rf-front-end1-container" class="paired-equipment-container"></div>
              </div>
            `,
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-2?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
      tidemark2Satellite
    ],
  },
  objectives: [
    {
      id: 'calculate-lnb-lo',
      title: 'Phase 2: Calculate LNB Local Oscillator Frequency',
      description: 'Calculate required LO frequency. Submit calculation for Charlie\'s approval.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'status-check',
          description: 'Calculation Submitted and Approved',
          params: {
            question: 'What is the required LNB local oscillator frequency (in MHz) to achieve the target IF of 1,247.5 MHz for the TIDEMARK-2 beacon at 3,947.8 MHz?',
            options: [
              '5,195.3 MHz',
              '5,255.3 MHz',
              '5,193.5 MHz',
              '5,253.5 MHz',
            ],
            correctIndex: 0,
            explanation: 'The LNB local oscillator frequency is calculated by adding the target IF frequency to the received RF frequency: 3,947.8 MHz + 1,247.5 MHz = 5,195.3 MHz. This LO frequency will downconvert the received beacon signal to the desired IF frequency for processing.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'select-if-filter',
      title: 'Phase 3: Select IF Filter Bandwidth',
      description: 'Choose appropriate IF filter for CW beacon signal. Explain your selection.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['calculate-lnb-lo'],
      conditions: [
        {
          type: 'filter-bandwidth-set',
          description: 'Narrow IF Filter Selected (1 MHz)',
          params: {
            bandwidthIndex: 8, // 1 Mhz
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
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span: 2-10 kHz (narrow for CW)',
          params: {
            span: 6e3,
            frequencyTolerance: 4e3,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW: ≤ 1 kHz (very narrow)',
          params: {
            rbw: 1000 as Hertz,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-reference-level-set',
          description: 'Reference Level: -100 dBm',
          params: {
            referenceLevel: -100,
          },
          mustMaintain: true,
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
          type: 'antenna-position',
          description: 'TIDEMARK-2 Position Commanded',
          params: {
            trackingMode: 'program-track',
            azimuth: 219.7 as Degrees,
            elevation: 26.3 as Degrees,
            tolerance: 0.5 as Degrees,
          },
          mustMaintain: false,
        },
      ],
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
          description: 'LNB LO Set to Calculated Value (5,195.3 MHz)',
          params: {
            loFrequency: 5195.3 as MHz,
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
          description: 'Signal Level Above -95 dBm for 60 Seconds',
          params: {
            signalId: 'tidemark-2-beacon',
            minPower: -95 as dBm,
          },
          mustMaintain: true,
          maintainDuration: 5, // seconds
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
          5,195.3 megahertz. That's correct.
        </p>
        <p>
          Good work showing the calculation. Math matters here - one decimal place wrong and you might not see the beacon.
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
          1 megahertz filter. Perfect choice for a CW beacon. This is the balance between noise floor and insertion loss.
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
