import { Character, Emotion } from '@app/modal/character-enum';
import type { Objective } from '@app/objectives/objective-types';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, Hertz, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
import type { Degrees } from 'ootk';
import { createRfFrontEnd } from '../rf-front-end-factory';
import { maineGroundStation, vermontGroundStation } from './ground-stations';
import { ses10Satellite, tidemark1Satellite, tidemark2Satellite } from './satellites';

/**
 * NATS Level 4: "New Bird on the Block"
 *
 * Phase: Intermediate operations
 * Time Pressure: Per-objective timers
 * Calculation Required: YES - IF frequency adjustments
 * New UI Elements: Multi-character dialog, satellite switchover workflow
 *
 * Premise: ME-02 is maintaining primary operations on TIDEMARK-1. TIDEMARK-2 has
 * just completed station-keeping at 45°W and the Halifax spacecraft team has handed
 * over the communications payload. VT-01 needs to switch from monitoring TIDEMARK-1
 * to establishing full uplink/downlink with TIDEMARK-2.
 */

export const scenario4Data: ScenarioData = {
  id: 'nats-scenario4',
  url: 'nats/scenarios/nats-scenario4',
  prerequisiteScenarioIds: ['nats-scenario3'],
  imageUrl: 'nats/4/card.png',
  number: 4,
  title: 'New Bird on the Block',
  subtitle: 'Satellite Switchover Operations',
  duration: '25-30 min',
  timeLimitSeconds: 30 * 60,
  difficulty: 'intermediate',
  missionType: 'Operations Phase',
  description: `ME-02 is maintaining primary communications with TIDEMARK-1. The spacecraft operations team in Halifax has just confirmed that TIDEMARK-2 has completed station-keeping at 45°W and the communications payload is ready for ground operations.<br><br>Your task at VT-01 is to switch from monitoring TIDEMARK-1 to establishing full uplink and downlink with TIDEMARK-2. You'll need to repoint the antenna, acquire the new beacon, reconfigure the modems for the new frequencies, and bring up the transmit path.<br><br>Marcus Chen from Halifax spacecraft ops will confirm payload status. Take your time - ME-02 has primary coverage while you complete the switchover.`,
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
      {
        ...vermontGroundStation,
        rfFrontEnds: [
          createRfFrontEnd(vermontGroundStation.rfFrontEnds[0], {
            buc: { isMuted: true, loFrequency: 7000 as MHz },
            hpa: { isHpaEnabled: false },
          }),
        ],
        receivers: [
          {
            ...vermontGroundStation.receivers[0],
            modems: [
              {
                ...vermontGroundStation.receivers[0].modems[0],
                fec: "1/2",
              },
            ],
          }
        ]
      },
      {
        ...vermontGroundStation,
        id: maineGroundStation.id,
        name: maineGroundStation.name,
        location: maineGroundStation.location,
        isOperational: true,
      }
    ],
    missionBriefUrl: 'https://docs.signalrange.space/scenarios/scenario-4?content-only=true&dark=true',
    isExtraSatellitesVisible: true,
    satellites: [
      tidemark1Satellite,
      ses10Satellite,
      tidemark2Satellite
    ],
  },
  objectives: [
    // Phase 1: Preparation & Understanding
    {
      id: 'review-mission-brief',
      title: 'Review Mission Brief',
      description: 'Open the mission brief to understand the switchover requirements.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Mission Brief Reviewed',
          params: {
            boxId: 'mission-brief',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'verify-current-status',
      title: 'Verify Current TIDEMARK-1 Status',
      description: 'Confirm which satellite VT-01 is currently tracking.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Current Satellite Identified',
          params: {
            question: 'What satellite is VT-01 currently tracking?',
            options: [
              'TIDEMARK-1',
              'TIDEMARK-2',
              'SES-10',
              'None - antenna is stowed',
            ],
            correctIndex: 0,
            explanation: 'VT-01 is currently tracking TIDEMARK-1. The antenna is pointed at Az: 161.8°, El: 34.2° with beacon lock confirmed. We need to switch to TIDEMARK-2 at Az: 219.7°, El: 26.3°.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    // Phase 2: Antenna Reconfiguration
    {
      id: 'command-antenna',
      title: 'Command Antenna to Track TIDEMARK-2',
      description: 'Slew the antenna to TIDEMARK-2 position (Az: 219.7°, El: 26.3°).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-current-status'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program Track Mode Active',
          params: {
            trackingMode: 'program-track',
          },
          mustMaintain: false,
        },
        {
          type: 'antenna-position',
          description: 'Antenna at TIDEMARK-2 Position',
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
    // Phase 3: Beacon Acquisition
    {
      id: 'configure-speca-beacon',
      title: 'Configure Spectrum Analyzer for TIDEMARK-2 Beacon',
      description: 'Set spectrum analyzer to view TIDEMARK-2 beacon at IF frequency 1070 MHz.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['command-antenna'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'speca-center-frequency',
          description: 'Center Frequency: 1070 MHz',
          params: {
            centerFrequency: 1070e6 as Hertz,
            centerFrequencyTolerance: 1e6,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Span: 10 kHz (narrow for CW)',
          params: {
            span: 10e3,
            frequencyTolerance: 5e3,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-rbw-set',
          description: 'RBW: 1 kHz',
          params: {
            rbw: 1000 as Hertz,
            frequencyTolerance: 500,
          },
          mustMaintain: true,
        },
        {
          type: 'speca-reference-level-set',
          description: 'Reference Level: -90 dBm',
          params: {
            referenceLevel: -90,
            referenceLevelTolerance: 5,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'acquire-beacon',
      title: 'Acquire TIDEMARK-2 Beacon',
      description: 'Verify beacon signal appears on spectrum analyzer.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-speca-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'signal-detected',
          description: 'Beacon Signal Detected',
          params: {
            signalId: 'TIDEMARK-2-Beacon',
            minPower: -95 as dBm,
          },
          mustMaintain: false,
        },
        {
          type: 'signal-level-correct',
          description: 'Beacon Level Stable',
          params: {
            signalId: 'TIDEMARK-2-Beacon',
            minPower: -95 as dBm,
          },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'verify-beacon-acquisition',
      title: 'Verify Beacon Acquisition',
      description: 'Confirm understanding of what beacon acquisition indicates.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['acquire-beacon'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Beacon Significance Understood',
          params: {
            question: 'What does a stable beacon signal confirm?',
            options: [
              'Antenna is pointed correctly',
              'LNB local oscillator frequency is correct',
              'Both antenna pointing and LNB frequency are correct',
              'Neither - beacon is independent of ground equipment',
            ],
            correctIndex: 2,
            explanation: 'A stable beacon confirms both: (1) the antenna is pointed at the correct satellite, and (2) the LNB LO frequency is set correctly to downconvert the beacon RF to the expected IF. If either were wrong, you would not see the beacon.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    // Phase 4: Receiver Configuration
    {
      id: 'configure-rx-frequency',
      title: 'Configure RX Modem Frequency',
      description: 'Set receiver modem to TIDEMARK-2 downlink IF frequency (1458 MHz).',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-beacon-acquisition'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX Frequency: 1458 MHz',
          params: {
            frequency: 1458e6,
            frequencyTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-bandwidth-set',
          description: 'RX Bandwidth: 36 MHz',
          params: {
            bandwidth: 36e6,
            bandwidthTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'configure-rx-modulation',
      title: 'Configure RX Modem Modulation',
      description: 'Set receiver modem modulation and FEC to match TIDEMARK-2 signal.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-rx-frequency'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-modulation-set',
          description: 'Modulation: QPSK',
          params: {
            modulation: 'QPSK',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'rx-modem-fec-set',
          description: 'FEC: 3/4',
          params: {
            fec: '3/4',
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'verify-rx-lock',
      title: 'Verify RX Signal Lock',
      description: 'Confirm receiver has locked to TIDEMARK-2 downlink with acceptable SNR.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-rx-modulation'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'Receiver Locked',
          params: {
            modemNumber: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'SNR Above 10 dB',
          params: {
            minCNRatio: 10,
            modemNumber: 1,
          },
          maintainUntilObjectiveComplete: true,
          maintainDuration: 30,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    // Phase 5: Transmitter Configuration
    {
      id: 'configure-tx-modem',
      title: 'Configure TX Modem',
      description: 'Set transmitter modem parameters for TIDEMARK-2 uplink.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['verify-rx-lock'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX Frequency: 1020 MHz',
          params: {
            frequency: 1020e6,
            frequencyTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-bandwidth-set',
          description: 'TX Bandwidth: 36 MHz',
          params: {
            bandwidth: 36e6,
            bandwidthTolerance: 1e6,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-power-set',
          description: 'TX Power: -7 dBm',
          params: {
            power: -7,
            powerTolerance: 1,
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-modulation-set',
          description: 'TX Modulation: QPSK',
          params: {
            modulation: 'QPSK',
          },
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'tx-modem-fec-set',
          description: 'TX FEC: 3/4',
          params: {
            fec: '3/4',
          },
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'enable-transmit-path',
      title: 'Enable Transmit Path',
      description: 'Unmute BUC and enable HPA for transmission.',
      groundStation: 'VT-01',
      prerequisiteObjectiveIds: ['configure-tx-modem'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          maintainUntilObjectiveComplete: true,
        },
        {
          type: 'hpa-not-overdriven',
          description: 'HPA Not Overdriven',
          maintainUntilObjectiveComplete: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ] as Objective[],
  dialogClips: {
    intro: {
      text: `
      <p>
        Hey there, Marcus Chen from Halifax spacecraft ops. TIDEMARK-2's station-keeping is looking good, eh? Payload's been handed over to ground ops - she's all yours now.
      </p>
      <p>
        Sorry for the short notice on this one. The bird came online a bit ahead of schedule, but that's a good problem to have.
      </p>
      <p>
        Charlie said that ME-02's got primary on TIDEMARK-1, so you've got time to work. Take a look at the Mission Brief and give me a shout when you've got lock - I'll be watching from our end.
      </p>
      `,
      character: Character.MARCUS_CHEN,
      emotion: Emotion.HAPPY,
      audioUrl: getAssetUrl('/assets/campaigns/nats/4/intro.mp3'),
    },
    objectives: {
      'review-mission-brief': {
        text: `
        <p>
          Good, you've got the mission brief. This is a standard satellite switchover - nothing you haven't trained for.
        </p>
        <p>
          VT-01 is currently locked on TIDEMARK-1 at azimuth 161.8, elevation 34.2. TIDEMARK-2 is about 58 degrees away in azimuth - that's a significant slew.
        </p>
        <p>
          Let's verify where we're starting from before we move anything.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-brief.mp3'),
      },
      'verify-current-status': {
        text: `
        <p>
          That's right - TIDEMARK-1. Good to confirm you know what you're working with before making changes.
        </p>
        <p>
          Now command the antenna to TIDEMARK-2's position. Azimuth 219.7, elevation 26.3. The ACU will handle the slew - just make sure program track mode is active.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-status.mp3'),
      },
      'command-antenna': {
        text: `
        <p>
          Antenna looks like it is on target. Nice and smooth slew.
        </p>
        <p>
          Let's get the spectrum analyzer ready for the new beacon. TIDEMARK-2's beacon is at 4,180 megahertz RF. With your LO at 5,250 megahertz, what IF frequency should you see?
        </p>
        <p>
          Set your center frequency to the correct IF frequency. Narrow span for the CW beacon.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-antenna.mp3'),
      },
      'configure-speca-beacon': {
        text: `
        <p>
          Spectrum analyzer's ready. 1,070 megahertz center, narrow span, tight RBW. Reference level set for beacon acquisition.
        </p>
        <p>
          Antenna should be on target by now. Watch the display - if everything's aligned, the beacon should appear right at center frequency.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-speca.mp3'),
      },
      'acquire-beacon': {
        text: `
        <p>
          Charlie just pinged me - says you've got the antenna on TIDEMARK-2 and you're seeing the beacon. That's great news.
        </p>
        <p>
          Beacon's been rock solid since we finished station-keeping. If you're seeing it clean on the spectrum analyzer, your pointing and receive chain are good to go.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-beacon.mp3'),
      },
      'verify-beacon-acquisition': {
        text: `
        <p>
          Exactly right. The beacon confirms both your antenna pointing and your LNB frequency. If either were wrong, you wouldn't see it.
        </p>
        <p>
          Now we need to configure the receiver modem for TIDEMARK-2's downlink. The transponder output is at 3,792 megahertz RF - with your LO, that's an IF of 1,458 megahertz.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-beacon-quiz.mp3'),
      },
      'configure-rx-frequency': {
        text: `
        <p>
          Receiver frequency and bandwidth are set. 1,458 megahertz, 36 megahertz bandwidth to match the transponder.
        </p>
        <p>
          Set the modulation and FEC to match TIDEMARK-2's signal format - QPSK with 3/4 rate coding.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-rx-freq.mp3'),
      },
      'configure-rx-modulation': {
        text: `
        <p>
          Modulation parameters are set. The modem should start searching for lock now.
        </p>
        <p>
          Watch the lock indicator and SNR display. We need to see a stable lock with at least 10 dB carrier-to-noise before we bring up the transmit side.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-rx-mod.mp3'),
      },
      'verify-rx-lock': {
        text: `
        <p>
          Catherine here from ME-02. I'm seeing your receiver come online on the network status display. Looks like you've got good lock on TIDEMARK-2's downlink.
        </p>
        <p>
          We're holding steady on TIDEMARK-1 over here, so no rush on your end. SNR on your link looks healthy from what I can see.
        </p>
        `,
        character: Character.CATHERINE_VEGA,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-rx-lock.mp3'),
      },
      'configure-tx-modem': {
        text: `
        <p>
          Transmitter modem's configured. 1,020 megahertz IF, 36 megahertz bandwidth, QPSK 3/4.
        </p>
        <p>
          Before we enable the transmit path, double-check that the HPA is ready and the BUC is configured. We don't want any surprises when we key up.
        </p>
        `,
        character: Character.CHARLIE_BROOKS,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/obj-tx-modem.mp3'),
      },
      'enable-transmit-path': {
        text: `
        <p>
          We're seeing your uplink on the payload side. Clean signal, no anomalies. Beauty, eh?
        </p>
        <p>
          Full duplex established with TIDEMARK-2. VT-01 is now operational on the new bird. Grab yourself a double-double - you've earned it.
        </p>
        <p>
          Charlie, your trainee did good work today. Nice and methodical.
        </p>
        `,
        character: Character.MARCUS_CHEN,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats/4/complete.mp3'),
      },
    },
  },
};
