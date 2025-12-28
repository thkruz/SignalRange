import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz } from '@app/types';
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
 * Time Pressure: Low (30s limit on maintenance positioning)
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
  duration: '20-30 min',
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
  timeLimitSeconds: 30 * 60, // 30 minutes
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
        spectrumAnalyzers: [
          {
            ...vermontGroundStation.spectrumAnalyzers[0],
            centerFrequency: 1074.50125e6 as Hertz,
          },
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
      id: 'mission-brief-opened',
      title: 'Open Mission Brief',
      description: 'Open and read the mission brief document including safety brief.',
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Document Opened',
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
      timeLimitSeconds: 3 * 60, // 3 minutes
    },
    {
      id: 'safety-briefing',
      title: 'Safety Briefing',
      description: 'Acknowledge the RF safety procedures and maintenance window.',
      prerequisiteObjectiveIds: ['mission-brief-opened'],
      groundStation: 'VT-01',
      conditions: [
        {
          type: 'status-check',
          description: 'Maintenance Safety Briefing Acknowledged',
          params: {
            question: 'I need you to confirm you understand the RF safety briefing for today\'s maintenance work. Company policy is that I need you to verbally acknowledge before we can proceed. Lawyers and such...',
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
      timeLimitSeconds: 5 * 60, // 5 minutes
    },
    {
      id: 'disable-hpa-output',
      title: 'Disable HPA Output',
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
      points: 10,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'power-off-hpa',
      title: 'Power Off HPA',
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
      points: 10,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'mute-buc',
      title: 'Mute BUC RF Output',
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
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'power-down-lnb',
      title: 'Power Down LNB',
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
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'antenna-maintenance',
      title: 'Move Antenna to Maintenance Position',
      description: 'Command the antenna to maintenance position (Az: 0°, El: 5°) for maintenance access.',
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
        elapsedTimeThreshold: 15 * 60, // 15 minutes
        pointsDeducted: 30,
        message: "You delayed maintenance getting started on time. Don't let it happen again.",
      },
      points: 15,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'repoint-antenna',
      title: 'Repoint Antenna at TIDEMARK-1',
      description: 'Command antenna to return to operational pointing (Az: 161.8°, El: 34.2°).',
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
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'power-up-lnb',
      title: 'Restore LNB',
      description: 'Power on LNB with settings: LO 5,250 MHz, Gain 60 dB. Wait for thermal stabilization.',
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
          description: 'LNB LO Set to 5,250 MHz',
          params: {
            loFrequency: 5250 as MHz,
            loFrequencyTolerance: 0,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'lnb-gain-set',
          description: 'LNB Gain Set to 60 dB',
          params: {
            gain: 60,
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
      points: 10,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'verify-beacon',
      title: 'Verify Beacon Reception',
      description: 'Confirm TIDEMARK-1 beacon is visible on spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['power-up-lnb'],
      conditions: [
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected (4,175.5 MHz RF / 1,074.5 MHz IF)',
          params: {
            signalId: 'TIDEMARK-1-Beacon',
            minPower: -100 as dBm,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Spectrum Analyzer Center Frequency Set to exactly 1,074.5 MHz',
          params: {
            centerFrequency: 1074.5e6 as Hertz,
            centerFrequencyTolerance: 0,
          },
          mustMaintain: true,
        }
      ],
      conditionLogic: 'AND',
      points: 10,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'unmute-buc',
      title: 'Unmute BUC RF Output',
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
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'power-on-hpa',
      title: 'Power On HPA',
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
      points: 10,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
    {
      id: 'enable-hpa-output',
      title: 'Enable HPA Output',
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
      points: 10,
      timeLimitSeconds: 2 * 60, // 2 minutes
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        Maintenance crew needs access to the antenna feed assembly in fifteen minutes. We're taking TIDEMARK-1 offline for the window.
      </p>
      <p>
        First things first - you need to acknowledge the RF safety briefing. Someone forgot that step once. Maintenance tech caught about fifty watts to the face. He's fine now, but the paperwork wasn't.
      </p>
      <p>
        After that, we shut down in sequence: HPA first, then BUC, then LNB, then stow the antenna. Never skip steps, never reverse order. Go.
      </p>
      `,
      character: Character.CHARLIE_BROOKS,
      emotion: Emotion.CONFIDENT,
      audioUrl: getAssetUrl('/assets/campaigns/nats/2/intro.mp3'),
    },
    objectives: {
      'safety-briefing': {
        text: `
        <p>
          Good. Now we start the shutdown sequence.
        </p>
        <p>
          The HPA is pushing several hundred watts through that feed horn. We disable it first - that's the big one. TX Chain tab. Find the HPA panel and disable the output. Two-step process: ARM first, then DISABLE.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-safety-briefing.mp3'),
      },
      'disable-hpa-output': {
        text: `
        <p>
          Output's disabled. No more RF coming out of the amplifier. But it's still powered and hot.
        </p>
        <p>
          Power it off completely. Same panel, hit the power switch. Tubes need to cool before anyone touches anything upstream.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-disable-hpa-output.mp3'),
      },
      'power-off-hpa': {
        text: `
        <p>
          HPA's down. Now the BUC.
        </p>
        <p>
          Even without the HPA, the BUC still outputs a few milliwatts. Not enough to hurt anyone, but enough to cause interference if we're moving the antenna around. Mute it. Same tab, BUC panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-off-hpa.mp3'),
      },
      'mute-buc': {
        text: `
        <p>
          BUC's muted. Transmit chain is completely silent now.
        </p>
        <p>
          Power down the LNB next. We don't need it during maintenance, and there's no point leaving equipment energized when the antenna's not pointed at anything useful. RX Analysis tab, LNB panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-mute-buc.mp3'),
      },
      'power-down-lnb': {
        text: `
        <p>
          LNB's off. RF chain is completely cold. Safe for maintenance.
        </p>
        <p>
          Now stow the antenna. ACU Control tab. Set tracking mode to MAINTENANCE - that'll command it to azimuth zero, elevation five degrees. Low enough for the crew to access the feed, high enough to clear any obstructions.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-down-lnb.mp3'),
      },
      'antenna-maintenance': {
        text: `
        <p>
          Antenna's at maintenance position. Crew has the all-clear.
        </p>
        <p>
          They're replacing a waveguide flange gasket - routine work, takes about fifteen minutes.
        </p>
        <p>
          ...
        </p>
        <p>
          Are you keeping your shift log updated? Eventually you'll need to be able to answer questions about what you did using your shift log. So always keep track of what work you did.
        </p>
        <p>
          ...
        </p>
        <p>
          Maintenance is complete. Something about this place always makes time feel like its moving faster when you are waiting on other people. Crew's clear of the tower. Time to bring the link back up. ACU Control tab. Set tracking mode back to PROGRAM TRACK and command the antenna to azimuth 161.8, elevation 34.2. That's where TIDEMARK-1 sits.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-antenna-maintenance.mp3'),
      },
      'repoint-antenna': {
        text: `
        <p>
          Antenna's back on target. Now we restore the receive path first.
        </p>
        <p>
          Power up the LNB. RX Analysis tab. Set the local oscillator to 5,250 megahertz, gain to 60 dB. Wait for thermal stabilization - the indicator will go green when it's ready.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-repoint-antenna.mp3'),
      },
      'power-up-lnb': {
        text: `
        <p>
          LNB's stable. Now verify we're actually seeing the satellite.
        </p>
        <p>
          Check the spectrum analyzer. TIDEMARK-1's beacon should be visible at 1,074.5 MHz on the IF side. That's 4,175.5 MHz RF, minus our 5,250 MHz LO. If you see a clean carrier there, we're pointed correctly.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-up-lnb.mp3'),
      },
      'verify-beacon': {
        text: `
        <p>
          There's the beacon. Acquisition looks clean.
        </p>
        <p>
          Now we can restore transmit. Unmute the BUC first. TX Chain tab, BUC panel. We bring up the low-power stages before the high-power ones.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-verify-beacon.mp3'),
      },
      'unmute-buc': {
        text: `
        <p>
          BUC's live. Now power on the HPA. Same tab, HPA panel.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-unmute-buc.mp3'),
      },
      'power-on-hpa': {
        text: `
        <p>
          HPA's powered. Last step - enable the output. ARM first, then ENABLE. Same two-step process as shutdown.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-power-on-hpa.mp3'),
      },
      'enable-hpa-output': {
        text: `
        <p>
          Link's restored. TIDEMARK-1 back in service.
        </p>
        <p>
          That's scheduled maintenance. Power down in sequence, stow safely, restore in reverse order. You did it correctly - no one got hurt, no equipment got damaged, all within our Authorised Service Interruption window.
        </p>
        <p>
          I am going to recommend authorizing you to help with remote ground stations. Same equipment, but more of it and higher stakes. Go get some coffee or whatever it is you do here when not training.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats/2/obj-enable-hpa-output.mp3'),
      },
    },
  },
};