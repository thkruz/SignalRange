import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 4 - "Keys to the Bird" / Command-Link COMSEC
 *
 * New mechanic: M5 command-link authentication and key operations. Scenario 3
 * proved GW-01 can reach the spacecraft; this one adds the requirement that the
 * spacecraft can prove the command came from NATS. `requireValidKey` is on, so
 * a command sent on a key that is mid-rotation is rejected - the operator has to
 * complete the scheduled rotation before the window closes.
 *
 * Command window is the MERIDIAN-SAR-1 pass again (AOS T+3.2, LOS T+10.3):
 * windowStartS 220 .. windowEndS 600. Doppler compensation is still required -
 * scenario 3's lesson does not get switched off because a new one arrived.
 *
 * The console's zeroize control is deliberately arm-then-fire and is NOT part of
 * any objective here: emergency key destruction is scenario 21's lesson, and an
 * accidental zeroize during a routine rotation should feel like the serious
 * mistake it is.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0874: Knowledge of cryptographic key management concepts
 *   - K0875: Knowledge of cryptology
 *   - K0728: Knowledge of cryptographic key storage and handling
 *
 * Supporting Codes:
 *   - S0077: Skill in securing network communications
 *   - T1567: Conduct satellite command and control operations
 */
export const natsEuScenario4Data: ScenarioData = {
  id: 'nats-eu-scenario4',
  url: 'nats-eu/scenarios/nats-eu-scenario4',
  imageUrl: 'nats/4/card.png',
  number: 4,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario3'],
  title: 'Keys to the Bird',
  subtitle: 'Command-Link COMSEC',
  duration: '20-25 min',
  missionType: 'Commanding',
  description: `A command link that anyone can use is not a command link, it is a liability. MERIDIAN commands carry an authentication tag; the spacecraft rejects anything it cannot verify.<br><br>Today's rotation was scheduled weeks ago and it lands, as these things do, in the middle of your only pass. The old key is already marked for retirement and the new material is loaded but not yet active. Until you complete the rotation, the bird will not authenticate a thing you send.<br><br>Anneke needs a payload safe-mode command before the bird goes into its next imaging block. You have one window.`,
  equipment: [
    '4m Ku-Band LEO Tracking Antenna',
    'Ku-Band BUC + HPA',
    'TT&C Commanding Console (COMSEC)',
    'QPSK 3/4 Transmit Modem',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-4?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // M5 - COMSEC required. A command sent while the key is Pending Rotation is
    // rejected, so the rotation must complete inside the pass window.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 220,
      windowEndS: 600,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0874'],
      title: 'Review the COMSEC Brief',
      description: 'Open the shift brief and confirm the rotation schedule and the command to be sent.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'COMSEC Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Rotation Risk Understood',
          params: {
            character: Character.SYSTEM,
            question: 'The key is marked Pending Rotation when the pass starts. What happens if you send PLD-SAFE before completing the rotation?',
            options: [
              'The spacecraft cannot verify the authentication tag and rejects the command.',
              'It goes through - rotation only affects the next pass.',
              'It goes through but is logged as unauthenticated.',
            ],
            correctIndex: 0,
            explanation: 'Correct. A key in rotation is not a valid key. Complete the rotation first, then command.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'complete-key-rotation',
      nice: ['K0874', 'K0728', 'S0077'],
      title: 'Complete the Scheduled Key Rotation',
      description: 'Open the TT&C console and work the COMSEC panel: begin the scheduled rotation, then complete it. The key status must read Valid before any command will authenticate. Leave the zeroize control alone - that destroys key material and is not part of a routine rotation.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      conditions: [
        {
          type: 'tab-active',
          description: 'TT&C Console Open',
          params: { tab: 'commanding' },
          mustMaintain: false,
        },
        {
          type: 'key-rotation-completed',
          description: 'Key Rotation Completed',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'track-and-compensate',
      nice: ['S0421', 'K1032', 'T1567'],
      title: 'Acquire and Compensate',
      description: 'Program-track MERIDIAN-SAR-1 and engage uplink Doppler compensation, exactly as you did last pass. New lessons do not retire old ones.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['complete-key-rotation'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-1 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-1-Beacon',
            minPower: -130 as dBm,
            requiresObservation: true,
            observationTab: 'rx-analysis',
          },
          mustMaintain: false,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'send-authenticated-command',
      nice: ['T1567', 'S0077', 'K0875'],
      title: 'Send the Authenticated Command',
      description: 'Key the modem first, then the HPA, then send PLD-SAFE and confirm the acknowledgement. The window closes at T+10 min.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-and-compensate'],
      conditions: [
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Enabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'command-acknowledged',
          description: 'PLD-SAFE Acknowledged',
          params: { commandId: 'PLD-SAFE' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 30,
    },
    {
      id: 'log-the-rotation',
      nice: ['K0874', 'K0645'],
      title: 'Log the Rotation',
      description: 'Close out the COMSEC record for the shift.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['send-authenticated-command'],
      conditions: [
        {
          type: 'status-check',
          description: 'COMSEC Record Closed',
          params: {
            character: Character.SYSTEM,
            question: 'Rotation complete and the command authenticated. Why is a key rotation scheduled at all, rather than left alone while it is working?',
            options: [
              'Limiting how long any one key is in use limits what a compromised key is worth.',
              'Keys wear out and stop working after a fixed number of uses.',
              'It is a licensing requirement with no operational purpose.',
            ],
            correctIndex: 0,
            explanation: 'Correct. Rotation is about bounding exposure, not about the key failing. Logged and closed.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
  ],
};
