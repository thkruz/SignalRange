import { Character } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm } from '@app/types';
import type { Degrees } from 'ootk';
import { galwayGroundStation } from './ground-stations';
import { meridianSar1Satellite, meridianSar2Satellite } from './satellites';

/**
 * nats-eu Scenario 3 - "Two-Way Street" / First Commanding Window
 *
 * New mechanic: M2 LEO uplink ops (TT&C tab). Until now GW-01 has only
 * listened. This is the first time the station transmits at a LEO bird, which
 * introduces the thing GEO work never taught: the uplink Doppler shift moves
 * several tens of kHz across a seven-minute pass, so the command carrier has to
 * be pre-compensated or the spacecraft receiver never sees it.
 *
 * Command window is bounded to the MERIDIAN-SAR-1 pass (AOS T+3.2, LOS T+10.3
 * on the 2027-03-15 14:00 scenario clock): windowStartS 220 .. windowEndS 600.
 * A command sent outside that window is rejected, which is the point.
 *
 * Key status starts Valid and `requireValidKey` is off here - COMSEC key
 * handling is scenario 4's lesson, deliberately not stacked on top of this one.
 *
 * SAFETY NOTE for the objective order below: enabling the HPA while the BUC has
 * no drive trips the HPA_NOISE_AMPLIFICATION invariant and fails the mission.
 * The objectives therefore key the modem BEFORE enabling the HPA, and the
 * descriptions say so explicitly.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - T1567: Conduct satellite command and control operations
 *   - K1032: Knowledge of satellite-based communication systems
 *   - K0773: Knowledge of telemetry, tracking and commanding principles
 *
 * Supporting Codes:
 *   - S0421: Skill in operating network equipment
 *   - K0645: Knowledge of standard operating procedures
 */
export const natsEuScenario3Data: ScenarioData = {
  id: 'nats-eu-scenario3',
  url: 'nats-eu/scenarios/nats-eu-scenario3',
  imageUrl: 'nats/3/card.png',
  number: 3,
  isDisabled: false,
  difficulty: 'intermediate',
  prerequisiteScenarioIds: ['nats-eu-scenario2'],
  title: 'Two-Way Street',
  subtitle: 'First Commanding Window',
  duration: '20-25 min',
  missionType: 'Commanding',
  description: `GW-01 is accepted for receive. Today it earns the other half of its licence: transmit.<br><br>Anneke Visser at MERIDIAN constellation ops needs a recorder playback command on the bird this pass, and the constellation's flight rules say the command has to originate from a station that has demonstrated a clean uplink. That is you, in about three minutes.<br><br>One thing GEO never made you think about: the bird is closing at seven kilometres a second. Your 14 GHz carrier arrives at the spacecraft tens of kilohertz off frequency unless you compensate for it. The transmit chain will happily radiate a carrier the satellite cannot hear.`,
  equipment: [
    '4m Ku-Band LEO Tracking Antenna',
    'Ku-Band BUC (12600 MHz LO) + HPA',
    'TT&C Commanding Console',
    'QPSK 3/4 Transmit Modem',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayGroundStation],
    satellites: [meridianSar1Satellite, meridianSar2Satellite],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-03-15',
    scenarioStartWallTime: '14:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-3?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // M2 - uplink ops. Window bounded to the SAR-1 pass; Doppler compensation
    // required for an ACK; COMSEC deliberately not required yet (scenario 4).
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61701,
      windowStartS: 220,
      windowEndS: 600,
      requireDopplerComp: true,
      requireValidKey: false,
      commands: [
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
        { id: 'OBC-WDT-RESET', label: 'Reset OBC watchdog' },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645'],
      title: 'Review the Commanding Brief',
      description: 'Open the shift brief and confirm the command, the target, and the window.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Commanding Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Uplink Doppler Understood',
          params: {
            character: Character.SYSTEM,
            question: 'MERIDIAN-SAR-1 is in a 360 km orbit closing at roughly 7 km/s. What does that do to your 14005 MHz command carrier as the spacecraft sees it?',
            options: [
              'Shifts it by hundreds of kilohertz - the spacecraft receiver sees the wrong frequency unless the uplink is pre-compensated.',
              'Nothing. Doppler only affects the downlink.',
              'Attenuates it, but the frequency is unchanged.',
            ],
            correctIndex: 0,
            explanation: 'Correct. Downlink Doppler you can chase with AFC; uplink Doppler you have to predict and pre-compensate, because the spacecraft cannot tell you it is off frequency.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'track-for-commanding',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'Program-track the bird. You cannot command what you are not pointed at - the 4m Ku beam is under half a degree wide.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
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
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'enable-doppler-comp',
      nice: ['T1567', 'K0773'],
      title: 'Enable Uplink Doppler Compensation',
      description: 'Open the TT&C tab and engage uplink Doppler compensation. This slews the transmit carrier against the predicted range rate so the spacecraft receiver sees 14005 MHz throughout the pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['track-for-commanding'],
      conditions: [
        {
          type: 'tab-active',
          description: 'TT&C Console Open',
          params: { tab: 'commanding' },
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
      id: 'key-the-uplink',
      nice: ['S0421', 'T1567'],
      title: 'Key the Uplink',
      description: 'Bring the transmit chain up in the correct order: put the modem on the air FIRST, then enable the HPA. Enabling a high-power amplifier with no drive from the BUC amplifies its own noise floor and is a station-damaging error.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['enable-doppler-comp'],
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
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'send-the-command',
      nice: ['T1567', 'K0773', 'K1032'],
      title: 'Send the Playback Command',
      description: 'In the TT&C console send REC-PLAYBACK and wait for the acknowledgement. The command window closes at T+10 min - outside it the spacecraft is over the horizon and the command is rejected.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['key-the-uplink'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'REC-PLAYBACK Acknowledged',
          params: { commandId: 'REC-PLAYBACK' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },
    {
      id: 'secure-the-uplink',
      nice: ['S0421', 'K0645'],
      title: 'Secure the Transmit Chain',
      description: 'Command acknowledged. Bring the transmitter down safely and confirm you know the order.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['send-the-command'],
      conditions: [
        {
          type: 'status-check',
          description: 'Shutdown Order Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'Securing the uplink after the pass: what comes down first?',
            options: [
              'The HPA. Kill the amplifier before you remove its drive.',
              'The modem. Stop the carrier first, then the amplifier.',
              'Either - the interlocks handle it.',
            ],
            correctIndex: 0,
            explanation: 'Correct, and it is the mirror of bringing it up: drive before amplifier on the way up, amplifier before drive on the way down. An HPA is never left running on noise.',
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
