import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 15 - "Rotation Day" / Fleet COMSEC Under Tempo
 *
 * Rotterdam has ordered the fleet key rotation for today, and it has to
 * happen between passes: the retiring command key may not be used after the
 * MERIDIAN-SAR-1 window, and the first command on the new key has to reach
 * MERIDIAN-SAR-2 inside its window to prove it on orbit. Two keys move: the
 * command key on the TT&C console (begin, then complete) and, staged on the
 * mission clock (phase 16, E3), the fleet traffic key, which rolls at 07:27
 * and leaves the payload crypto reading Mismatch until the operator re-keys
 * before the SAR-2 pass. Receive on the old key, rotate both, prove both -
 * the decode under the new traffic key cold, then chain up in order and
 * KEY-VERIFY under the new command key - and safe down.
 *
 * Clock starts 2027-04-06 07:00:00 UTC. Passes (0 deg horizon, per station,
 * scripts/author-passes.mjs):
 *
 *   SH-02 MERIDIAN-SAR-1: AOS T+13.90 (07:13:53Z), max el 50.6 deg, LOS
 *                         T+23.78 (Fiona's).
 *   GW-01 MERIDIAN-SAR-1: AOS T+15.98 (07:15:59Z, az 022), max el 27.0 deg at
 *                         T+20.78 (07:20:47Z, 782 km), LOS T+25.52 (07:25:31Z,
 *                         az 170), 9.5 min, southbound. Receive only.
 *   GW-01 MERIDIAN-SAR-2: AOS T+33.97 (07:33:58Z, az 190), max el 24.9 deg at
 *                         T+38.67 (07:38:40Z, 829 km), LOS T+43.42 (07:43:25Z,
 *                         az 335), 9.5 min, northbound. The proof pass.
 *   SH-02 MERIDIAN-SAR-2: AOS T+36.26, max el 11.4 deg, LOS T+44.57 (Fiona's
 *                         telemetry contact).
 *
 * Eight and a half minutes between SAR-1 LOS and SAR-2 AOS for the command
 * rotation, the traffic re-key and the retune. Command window is the SAR-2
 * pass with 20 s guards. All thresholds flown in
 * test/campaigns/nats-eu-phase-c-validation.test.ts.
 *
 * Staged state (scenario-local clone): GW-01 RX modem 1 on the 1370 MHz SAR-2
 * carrier from last night's contact; TX modem 1 on 1405 MHz (SAR-1 uplink),
 * to be retuned to 1435 MHz for SAR-2. SH-02 is the shared default.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0876: Knowledge of cryptographic key management concepts
 *   - S0844: Skill in reviewing logs to identify evidence
 *   - S0593: Skill in verifying system integrity
 *
 * Supporting Codes:
 *   - K0874: Knowledge of cryptographic key management
 *   - S0077: Skill in securing network communications
 *   - K0689: Knowledge of network systems management
 *   - T0129: Coordinate and manage system operations schedules
 *   - T0153: Monitor network capacity and performance
 *   - T1567: Conduct satellite command and control operations
 *   - K0645: Knowledge of standard operating procedures
 *   - K0728: Knowledge of cryptographic key storage and handling
 */

/** MERIDIAN-SAR-1 (61701) at the S15 epoch: the 27 deg receive pass over Galway. */
const SAR1_S15_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27096.29166667  .00001000  00000-0  10000-3 0  9992' as TleLine1,
  tle2: '2 61701  97.2000 115.7500 0010000  90.0000 316.2500 15.60000000123458' as TleLine2,
};

/** MERIDIAN-SAR-2 (61702) at the S15 epoch: the 25 deg proof pass over Galway. */
const SAR2_S15_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27096.29166667  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61702  98.4000 300.5000 0010000  90.0000 172.0000 15.60000000123454' as TleLine2,
};

const meridianSar1S15 = createMeridianSar1(SAR1_S15_TLE);
const meridianSar2S15 = createMeridianSar2(SAR2_S15_TLE);

/** GW-01 as the night shift left it: modem on SAR-2. Deep clone, never spread. */
const galwayRotationDay: GroundStationConfig = structuredClone(galwayGroundStation);
galwayRotationDay.receivers![0].modems![0] = {
  ...galwayRotationDay.receivers![0].modems![0],
  frequency: 1370 as MHz,
};

export const natsEuScenario15Data: ScenarioData = {
  id: 'nats-eu-scenario15',
  url: 'nats-eu/scenarios/nats-eu-scenario15',
  imageUrl: 'nats/15/card.png',
  number: 15,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario14'],
  title: 'Rotation Day',
  subtitle: 'Fleet COMSEC Under Tempo',
  duration: '40 min',
  missionType: 'COMSEC Operations',
  description: `07:00 local. Rotterdam has ordered the fleet key rotation for today, and it happens between passes or it does not happen.<br><br>The rule is in the audit log: no command on the retiring key after the 07:16 MERIDIAN-SAR-1 window, and the first command on the new key has to reach MERIDIAN-SAR-2 inside its 07:34 window to prove it on orbit. The traffic key rolls on the fleet schedule at 07:27, in the gap, and the station will not follow it on its own.<br><br>Acknowledge the order, build the day plan, receive SAR-1 on the old keys, rotate both keys in the gap, prove both on SAR-2, safe down, and close the record with evidence rather than a story.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'SH-02 Shetland: 4m Ku-Band LEO Tracker (remote console)',
    'TT&C Commanding Console (command key)',
    'Payload Crypto (traffic key, AES-256-GCM)',
    'Security Console (audit log)',
    'Contact Plan Console',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayRotationDay, shetlandGroundStation],
    satellites: [meridianSar1S15, meridianSar2S15],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-06',
    scenarioStartWallTime: '07:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-15?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    // The skip stops 2 min before the next pass at either site. The rotation
    // gap between SAR-1 LOS and SAR-2 AOS is 8.5 min of real work, so no skip
    // is wanted there; leadTime and the Shetland windows keep it short.
    timeSkip: {
      leadTimeS: 120,
      minSkipS: 300,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'Fleet Key Rotation Record',
      description: 'KEY-2027-Q1 retired, KEY-2027-Q2 activated, 2027-04-06. Evidence for each step, in order.',
    },

    // M3 - four contacts, two sites, no double-booking. The command contact
    // must be Galway's because the TT&C console is Galway's. Windows are
    // 0 deg horizon crossings, per station.
    contactSchedule: {
      stationIds: ['GW-01', 'SH-02'],
      requiredPriorityAtOrAbove: 2,
      contacts: [
        { id: 'R-SAR1-SH', satelliteNoradId: 61701, label: 'MERIDIAN-SAR-1 (Shetland, 51 deg)', priority: 2, windowStartS: 830, windowEndS: 1430, stationId: 'SH-02' },
        {
          id: 'R-SAR1-GW',
          satelliteNoradId: 61701,
          label: 'MERIDIAN-SAR-1 (Galway, 27 deg) - receive on retiring key',
          priority: 1,
          windowStartS: 960,
          windowEndS: 1530,
          stationId: 'GW-01',
        },
        {
          id: 'R-SAR2-GW',
          satelliteNoradId: 61702,
          label: 'MERIDIAN-SAR-2 (Galway, 25 deg) - KEY-VERIFY on new key',
          priority: 1,
          windowStartS: 2040,
          windowEndS: 2610,
          stationId: 'GW-01',
        },
        { id: 'R-SAR2-SH', satelliteNoradId: 61702, label: 'MERIDIAN-SAR-2 (Shetland, 11 deg)', priority: 2, windowStartS: 2180, windowEndS: 2670, stationId: 'SH-02' },
      ],
    },

    // M2/M5 - the proof. Window is the SAR-2 pass: AOS 07:33:58 (2038 s) + 20 s
    // to LOS 07:43:25 (2605 s) - 20 s. Doppler comp and a Valid command key
    // are both required for an ACK; a command sent during Pending Rotation is
    // rejected and shows in the console history.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61702,
      windowStartS: 2060,
      windowEndS: 2585,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'KEY-VERIFY', label: 'Verify command-link key' },
        { id: 'REC-PLAYBACK', label: 'Start recorder playback' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },

    // M6 - the order is in the audit log, with the key material load behind it.
    security: {
      accounts: [
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'op-anneke', name: 'A. Visser (Constellation Ops, remote)', role: 'Constellation Operations', status: 'active' },
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
      ],
      events: [
        { id: 'evt-night-logout', timeS: 0, timestampLabel: '05:12 UTC', actor: 'op-charlie', action: 'Console logout (night shift end)', category: 'auth', severity: 'info' },
        {
          id: 'evt-rotation-order',
          timeS: 0,
          timestampLabel: '05:40 UTC',
          actor: 'op-anneke',
          action: 'Fleet key rotation ordered: retire KEY-2027-Q1 after SAR-1 window, activate KEY-2027-Q2 before SAR-2 window; traffic key rolls 07:27 UTC',
          category: 'command',
          severity: 'warning',
        },
        {
          id: 'evt-key-load',
          timeS: 0,
          timestampLabel: '06:15 UTC',
          actor: 'op-anneke',
          action: 'KEY-2027-Q2 material loaded to GW-01 COMSEC (inactive)',
          category: 'command',
          severity: 'info',
        },
        { id: 'evt-svc-poll', timeS: 0, timestampLabel: '06:30 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        { id: 'evt-login-fiona', timeS: 0, timestampLabel: '06:48 UTC', actor: 'op-fiona', action: 'Console login (SH-02)', category: 'auth', severity: 'info' },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '06:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
      ],
    },

    // E3 - the fleet traffic key rolls at 07:27 on the mission clock, in the
    // gap after SAR-1 LOS. The payload crypto reads Mismatch until the
    // operator re-keys it on the TX chain payload panel.
    hardwareFaultEvents: [
      { id: 'traffic-key-roll', groundStationId: 'GW-01', target: 'crypto-key-mismatch', startTime: 1620, label: 'Fleet traffic key rotation executed 07:27Z (Rotterdam)' },
    ],
  },
  objectives: [
    // ============================================================
    // MISSION PREPARATION
    // ============================================================
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0876'],
      title: 'Read the Rotation Order',
      description: 'Open the brief: the order, the two keys, the two windows, and what is forbidden between retire and activate.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Rotation Order Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Forbidden State Read',
          params: {
            character: Character.SYSTEM,
            question: 'What is forbidden between "retire" and "activate"?',
            options: [
              'Any command: a key in rotation is not a valid key, the spacecraft rejects whatever is sent on it, and a rejected command in the window is time you do not get back',
              'Receiving: the downlink cannot be decoded while the key rotates',
              'Tracking: the pedestal must be parked during a rotation',
              'Nothing: the console queues commands and sends them when the key is valid',
            ],
            correctIndex: 0,
            explanation:
              'Rotation is a state, not a moment. Begin it after the last command on the old key, complete it before the first on the new one, and send nothing in between. Sixteen minutes to SAR-1. Shift clock started.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 1 / BEAT 5: THE ORDER, THE PLAN, THE STATION
    // ============================================================
    {
      id: 'acknowledge-the-order',
      nice: ['K0876', 'S0844'],
      title: 'Acknowledge the Order',
      description: 'Security console: read the audit trail, sign it off, and flag the rotation order so the record shows who saw it and when.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Security Console Open',
          params: { tab: 'security-console' },
          mustMaintain: false,
        },
        {
          type: 'audit-log-reviewed',
          description: 'Audit Log Reviewed',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'security-event-acknowledged',
          description: 'Rotation Order Acknowledged',
          params: { eventId: 'evt-rotation-order' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'build-the-day-plan',
      nice: ['K0689', 'T0129'],
      title: 'Build the Day Plan',
      description: 'Four contacts, two sites, no double-booking. Both Galway halves are yours; the command contact cannot be anywhere else.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acknowledge-the-order'],
      timeLimitSeconds: 4 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Contact Plan Open',
          params: { tab: 'contact-schedule' },
          mustMaintain: false,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-1 07:16 Window on GW-01',
          params: { contactId: 'R-SAR1-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-assigned',
          description: 'SAR-2 07:34 Window on GW-01',
          params: { contactId: 'R-SAR2-GW', groundStationId: 'GW-01' },
          mustMaintain: true,
        },
        {
          type: 'contact-plan-valid',
          description: 'Contact Plan Valid',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Command Contact Placed',
          params: {
            character: Character.SYSTEM,
            question: 'Shetland sees SAR-2 at 11 degrees at the same time Galway sees it at 25. Why must the 07:34 contact be Galway’s?',
            options: [
              'The command originates from the TT&C console at GW-01: the new key is loaded there, and a receive-only site cannot prove a command key. Fiona takes the telemetry contact from her side',
              'Because 25 degrees is better than 11',
              'Because the plan will not validate with two contacts on Shetland',
              'It need not be: either site can send KEY-VERIFY',
            ],
            correctIndex: 0,
            explanation: 'A plan allocates receive windows. Commanding is a station capability, and only one station on this network has the key.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'galway-reference-and-keys',
      nice: ['T0431', 'K0874', 'K0728'],
      title: 'GW-01 Reference and Keys',
      description: 'GPSDO locked, then both keys on record before anything moves: command key Valid on the TX chain, traffic key Valid on RX analysis.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['build-the-day-plan'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'gpsdo-locked',
          description: 'GW-01 GPSDO Locked',
          params: { requiresObservation: true, observationTab: 'gps-timing' },
          mustMaintain: true,
        },
        {
          type: 'tx-key-status',
          description: 'TX Key Valid (pre-rotation)',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Valid (pre-rotation)',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Two Keys Read',
          params: {
            character: Character.SYSTEM,
            question: 'Two keys read Valid. Which is which, and who moves each one today?',
            options: [
              'The command key authenticates what goes up and rotates on the TT&C console, by you, in the gap. The traffic key decrypts what comes down and rolls on the fleet schedule at 07:27, by Rotterdam; you follow it by re-keying the payload crypto',
              'One key, shown twice: the command key is the traffic key',
              'Both rotate on the TT&C console with the same two buttons',
              'Both roll from Rotterdam; the station follows automatically',
            ],
            correctIndex: 0,
            explanation: 'Two keys, two custodians, two schedules. S8 taught you the one you did not rotate is the one that moves.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'tune-for-sar1',
      nice: ['S0421', 'K0773'],
      title: 'Tune for SAR-1',
      description:
        'The night shift left modem 1 on 1370 MHz. Retune to the 1414 MHz SAR-1 carrier, analyzer centred on the 1389 MHz beacon with a 2 MHz span, tracker parked on the 07:16 AOS azimuth: 22 degrees at 5 degrees elevation.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['galway-reference-and-keys'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1414 MHz',
          params: { modemNumber: 1, frequency: 1414e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1389 MHz',
          params: { centerFrequency: 1389e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'GW-01 Analyzer Span 2 MHz',
          params: { span: 2e6, frequencyTolerance: 1e6 },
          mustMaintain: true,
        },
        {
          type: 'antenna-position',
          description: 'Az 22 / El 5',
          params: { azimuth: 22, elevation: 5, tolerance: 2 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-4: SAR-1 ON THE RETIRING KEY
    // ============================================================
    {
      id: 'acquire-sar1',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-1',
      description: 'AOS 07:16 from azimuth 22. Program-track MERIDIAN-SAR-1 and confirm the beacon on RX analysis. Chain cold: nothing goes up on this pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-for-sar1'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-1',
          params: { noradId: 61701 },
          mustMaintain: false,
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
      id: 'receive-on-the-retiring-key',
      nice: ['T0153', 'K0740', 'K0876'],
      title: 'Receive on the Retiring Key',
      description: 'Lock the 1414 MHz carrier, hold C/N above 8 dB through culmination (07:20:47, 27 degrees, 782 km) and confirm the payload decrypts. Do not command.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'rx-crypto-status',
          description: 'Payload Decrypting on Q1',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Receive-Only Understood',
          params: {
            character: Character.SYSTEM,
            question: 'The command key is still Valid and the bird is up. Why not send REC-PLAYBACK now and get it out of the way?',
            options: [
              'The order retires KEY-2027-Q1 after this window and a command on it now is a command on a key about to die; if the rotation on the spacecraft side has already begun, it is rejected and logged against you. The window is receive-only by order, not by capability',
              'Because the TT&C console is not configured for SAR-1 today',
              'Because the traffic key would reject it',
              'No reason: a Valid key is a Valid key',
            ],
            correctIndex: 0,
            explanation: 'A key state on your console is a promise about the far end. On rotation day the promise expires at a time, not at a button.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'log-the-receive-pass',
      nice: ['K0645', 'S0575'],
      title: 'Log the Receive Pass',
      description: 'LOS 07:25:31. One line into the rotation record: the last pass on Q1, decoded, no commands sent.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['receive-on-the-retiring-key'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Receive Pass Logged',
          params: {
            character: Character.SYSTEM,
            question: 'What does the rotation record need for the 07:16 pass?',
            options: [
              'Last contact on KEY-2027-Q1: decoded, payload decrypting, zero commands sent. The record needs the absence of a command as much as the presence of one',
              'Pass worked',
              'The C/N at culmination',
              'Nothing: the rotation record starts at the rotation',
            ],
            correctIndex: 0,
            explanation: 'The order says no command after this window. The evidence that you obeyed it is a line that says so, written before the key moves.',
            pointPenalty: 5,
            documentSection: 'Retire',
            documentLine: '07:16Z MERIDIAN-SAR-1 GW-01: last contact on KEY-2027-Q1. Decoded at 27 deg, payload decrypting, zero commands sent. Q1 retired at LOS 07:25:31Z.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },

    // ============================================================
    // BEAT 5: THE GAP - TWO KEYS MOVE
    // ============================================================
    {
      id: 'rotate-the-command-key',
      nice: ['K0876', 'K0874', 'S0077'],
      title: 'Rotate the Command Key',
      description: 'TT&C console: begin the rotation, then complete it. KEY-2027-Q2 must read Valid before the SAR-2 window opens at 07:34:18.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-receive-pass'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'TT&C Console Open',
          params: { tab: 'commanding' },
          mustMaintain: false,
        },
        {
          type: 'key-rotation-completed',
          description: 'Command Key Rotation Completed',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Rotation State Read',
          params: {
            character: Character.SYSTEM,
            question: 'Between Begin and Complete the console read "Pending Rotation". What would a command sent in that state have done?',
            options: [
              'Been rejected as key-invalid and written into the command history with that reason: a rotation in progress is not a key, and the rejection is the failure mode this whole day is built to avoid',
              'Gone up on the old key, which is still loaded',
              'Queued until Complete and then gone up on the new key',
              'Gone up unauthenticated',
            ],
            correctIndex: 0,
            explanation: 'Two buttons, one state between them. The rotation is not a formality on a Monday morning; it is the interval in which the fleet has no key at all.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'read-the-traffic-key',
      nice: ['K0728', 'K0874', 'S0844'],
      title: 'Read the Traffic Key',
      description: 'The fleet traffic key rolls at 07:27. Read the payload crypto on RX analysis after it does: the decryption key will not be what you left it.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rotate-the-command-key'],
      conditions: [
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Reads Mismatch',
          params: { keyStatus: 'Mismatch', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Mismatch Diagnosed',
          params: {
            character: Character.SYSTEM,
            question: 'Traffic key Mismatch on the payload crypto, command key Valid on Q2. Which key moved, and where is the fix?',
            options: [
              'Rotterdam rolled the fleet traffic key on schedule and the station did not follow. The fix is the re-key on the TX chain payload panel, not the TT&C console: the command key is a different key and is already done',
              'Your rotation broke the traffic key; undo it and rotate again',
              'The spacecraft zeroized its keys when the command key changed',
              'Nothing moved: Mismatch is the normal reading during a rotation window',
            ],
            correctIndex: 0,
            explanation: 'Two keys, two custodians. The one Rotterdam moves is the one you follow; the one you move is the one Rotterdam verifies.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 're-key-the-payload-crypto',
      nice: ['K0728', 'K0874', 'S0421'],
      title: 'Re-key the Payload Crypto',
      description: 'Load the new traffic key on the TX chain payload panel and confirm both directions read Valid before the SAR-2 window.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['read-the-traffic-key'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-key-status',
          description: 'TX Traffic Key Valid (Q2)',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'RX Traffic Key Valid (Q2)',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'tune-for-sar2-and-the-uplink',
      nice: ['S0421', 'K0773', 'K1032'],
      title: 'Tune for SAR-2 and the Uplink',
      description:
        'Modem 1 to the 1370 MHz SAR-2 carrier, analyzer centred on 1370 MHz; TX modem 1 from 1405 MHz to the 1435 MHz SAR-2 telecommand IF (14035 MHz at the BUC). The tracker is wherever SAR-1 left it; program-track slews to the 07:34 rise at azimuth 190.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['re-key-the-payload-crypto'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'GW-01 RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'GW-01 Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'tx-modem-frequency-set',
          description: 'GW-01 TX 1435 MHz',
          params: { modemNumber: 1, frequency: 1435e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },

    // ============================================================
    // BEATS 2-3: PROVE BOTH KEYS ON SAR-2
    // ============================================================
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'AOS 07:34 from azimuth 190. Program-track MERIDIAN-SAR-2 and confirm its beacon on RX analysis. Chain cold until the downlink is proven.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['tune-for-sar2-and-the-uplink'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'GW-01 Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'GW-01 Tracking SAR-2',
          params: { noradId: 61702 },
          mustMaintain: false,
        },
        {
          type: 'signal-detected',
          description: 'MERIDIAN-SAR-2 Beacon Detected',
          params: {
            signalId: 'MERIDIAN-SAR-2-Beacon',
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
      id: 'decode-on-the-new-traffic-key',
      nice: ['K0728', 'T0153', 'K0740'],
      title: 'Decode on the New Traffic Key',
      description:
        'Lock the 1370 MHz carrier with the chain still cold, hold C/N above 8 dB and confirm the payload decrypts under Q2. That is the traffic key proven; an uplink on the rack would spoil this measurement, so it comes first.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'rx-crypto-status',
          description: 'Payload Decrypting on Q2',
          params: { cryptoMode: 'ACTIVE', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'chain-up-for-the-proof',
      nice: ['S0421', 'T1567', 'K0645'],
      title: 'Chain Up for the Proof',
      description: 'Window open until 07:43:05. Uplink Doppler compensation on the TT&C console, then the chain in order: carrier into the muted BUC, unmute, HPA. Two minutes.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['decode-on-the-new-traffic-key'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-transmitting',
          description: 'Transmit Modem On Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
        {
          type: 'buc-unmuted',
          description: 'BUC Unmuted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'hpa-enabled',
          description: 'HPA Output Enabled',
          params: { requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'prove-the-new-key-on-orbit',
      nice: ['K0876', 'T1567', 'S0593'],
      title: 'Prove the New Key on Orbit',
      description: 'Send KEY-VERIFY under KEY-2027-Q2 and confirm the acknowledgement before the window closes at 07:43:05.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up-for-the-proof'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'KEY-VERIFY Acknowledged',
          params: { commandId: 'KEY-VERIFY' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Proof Understood',
          params: {
            character: Character.SYSTEM,
            question: 'KEY-VERIFY acknowledged. What exactly has been proven, and what has not?',
            options: [
              'That the spacecraft authenticated a command under Q2 inside the window: the command key is live on orbit. It says nothing about the traffic key, which the decode proved separately, and nothing about the other spacecraft, which Rotterdam verifies one by one',
              'That the whole fleet is on Q2',
              'That both keys are live, since one ACK covers the link',
              'Only that the uplink reached the bird; the ACK does not check the key',
            ],
            correctIndex: 0,
            explanation: 'An ACK is proof of one thing on one bird. Rotation day is a list of them.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 25,
    },

    // ============================================================
    // BEAT 4: SAFE DOWN, CLOSE THE RECORD
    // ============================================================
    {
      id: 'safe-the-uplink',
      nice: ['S0421', 'K0645'],
      title: 'Safe the Uplink',
      description: 'Proof in hand. Chain down in the mirror order: HPA output off, BUC muted, carrier off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['prove-the-new-key-on-orbit'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'hpa-disabled',
          description: 'HPA Output Disabled',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'buc-muted',
          description: 'BUC Muted',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'tx-modem-not-transmitting',
          description: 'Transmit Modem Off Air',
          params: { modemNumber: 1 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'close-the-comsec-record',
      nice: ['K0876', 'K0645', 'S0593'],
      title: 'Close the COMSEC Record',
      description: 'Anneke wants the rotation evidence. Write it as evidence.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Evidence Recorded',
          params: {
            character: Character.SYSTEM,
            question: 'What is the rotation evidence?',
            options: [
              'The order acknowledged in the audit log, the last Q1 contact logged with zero commands, the command rotation completed on the console, the traffic re-key with both directions Valid, a decode under Q2, and KEY-VERIFY acknowledged under Q2 inside the window. Any one alone is not proof',
              'KEY-VERIFY acknowledged: the ACK is the evidence',
              'The console showing Valid on both keys',
              'Anneke’s confirmation that the fleet is on Q2',
            ],
            correctIndex: 0,
            explanation: 'A rotation record is a chain: order, retire, rotate, follow, prove. Break any link and the fleet has a key nobody can vouch for.',
            pointPenalty: 5,
            documentSection: 'Activate',
            documentLine:
              '07:27Z fleet traffic key rolled (Rotterdam); GW-01 payload crypto re-keyed, TX/RX Valid on Q2. Command key rotation begun and completed on TT&C console before 07:34 window. 07:34Z MERIDIAN-SAR-2 GW-01: decoded under Q2 (traffic key proven cold), chain up in order, KEY-VERIFY ACK under KEY-2027-Q2 inside window, chain secured HPA-BUC-modem. Rotation order acknowledged in audit log 07:03Z. Fleet on Q2 at GW-01.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
  ],
  dialogClips: {
    intro: {
      text: `
      <p>
        <em>[Text message from Anneke Visser at 05:41]</em>
      </p>
      <p>
        "Rotation order is in your audit log. Old command key dies after your 07:16 SAR-1 window; new key proven on SAR-2 at 07:34 with KEY-VERIFY, inside the window. No commands in between. The traffic key rolls on the fleet schedule at 07:27, in your gap, and your station will not follow it on its own. No gaps, please. Confirm each step back to me."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'build-the-day-plan': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at 07:03]</em>
        </p>
        <p>
          "Give me the Shetland halves and I'll stay off the uplink. Fifty-one degrees on SAR-1 and an eleven-degree graze on SAR-2 - I'll take the telemetry off the second and leave the proving to you. Not touching a key today."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'rotate-the-command-key': {
        text: `
        <p>
          Rotation complete on my side. Q2 is active in the fleet key store. Your window opens in a few minutes; your traffic key will have rolled by then, so look at it before you look at the sky.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'read-the-traffic-key': {
        text: `
        <p>
          <em>[Automated notice from MERIDIAN Ops at 07:27]</em>
        </p>
        <p>
          "Fleet traffic key rotation executed 07:27:00Z per order. Sites: load new material before your next payload contact."
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
      'prove-the-new-key-on-orbit': {
        text: `
        <p>
          KEY-VERIFY acknowledged under Q2. SAR-2 is on the new key, and so is Galway. Two more sites to go and then the fleet is on Q2. Close your record; I will countersign it.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'close-the-comsec-record': {
        text: `
        <p>
          That is an evidence chain, not a story. Order, retire, rotate, follow, prove. Thank you, Galway - same again next quarter.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
    },
  },
};
