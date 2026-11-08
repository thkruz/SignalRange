import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import { getAssetUrl } from '@app/utils/asset-url';
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
// Night shift left the BUC muted: the proof objective's "carrier into the muted
// BUC, then unmute" must be true when it opens (nats-eu-r1 s15-F2).
galwayRotationDay.rfFrontEnds[0].buc = { ...galwayRotationDay.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario15Data: ScenarioData = {
  id: 'nats-eu-scenario15',
  url: 'nats-eu/scenarios/nats-eu-scenario15',
  imageUrl: 'nats-eu/15/card.png',
  number: 15,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario14'],
  title: 'Rotation Day',
  subtitle: 'Fleet COMSEC Under Tempo',
  duration: '40 min',
  missionType: 'COMSEC Operations',
  description: `07:00 UTC. Rotterdam has ordered the fleet key rotation for today, and it has to happen between passes.<br><br>The rule is in the audit log: no command on the retiring key after the 07:16 MERIDIAN-SAR-1 window, and the first command on the new key has to reach MERIDIAN-SAR-2 inside its 07:34 window, which proves the key on orbit. The traffic key rolls on the fleet schedule at 07:27, in the gap, and the station won't follow it on its own.<br><br>Acknowledge the order, build the day plan, receive SAR-1 on the old keys, rotate both keys in the gap, prove both on SAR-2, safe down, and close the record with evidence rather than a story.`,
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

    // M2/M5 - the proof. Window is the SAR-2 pass: AOS 07:33:58 (2038 s) + 22 s
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
      description: 'Open the mission brief and read the order: the two keys, the two windows, and what is forbidden between retiring the old key and activating the new one.',
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
              'Any command: a key in rotation is not a valid key, and a rejected command in the window is time you can’t get back',
              'Receiving: the downlink can’t be decoded while the key rotates, and a decode attempted in the gap corrupts the frames',
              'Tracking: the pedestal must stay parked during a rotation, and a program-track slew in the gap is logged against you',
              'Nothing: the console queues commands and sends them when the key is valid, so the gap only costs you a delay',
            ],
            correctIndex: 0,
            explanation:
              'The spacecraft rejects whatever is sent on a key that’s mid-rotation, so rotation is a state that lasts from Begin to Complete, not a single moment. Begin it after the last command on the old key, complete it before the first command on the new one, and send nothing in between. SAR-1 rises in about sixteen minutes, and your shift clock has started.',
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
      description: 'On the security console, review the audit log and acknowledge the rotation order, so the record shows who saw it and when.',
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
      description: 'Assign the four contacts across the two sites with no double-booking. Both Galway passes are yours, and the command contact can only be at Galway.',
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
              'The command originates from the TT&C console at GW-01: the key is loaded there, and a receive-only site cannot prove it',
              '25 degrees is better than 11: the higher pass carries the margin a command ACK needs, and Shetland could not hold the lock',
              'The plan will not validate with two contacts on Shetland: the board is one site per window, and Galway is the free one',
              'It need not be: either site can send KEY-VERIFY, and the plan puts the contact on Galway only because 25 beats 11',
            ],
            correctIndex: 0,
            explanation:
              'Fiona takes the telemetry contact from her side, because the plan allocates receive windows. Commanding is a different capability, and only Galway’s TT&C console holds the key, so the 07:34 contact has to be Galway’s whatever the elevation.',
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
      description:
        'Confirm the GPSDO is locked, then put both keys on record before anything moves: the command key reads Valid on the TX chain, and the traffic key reads Valid on RX analysis.',
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
              'Command key: uplink, rotated by you on the TT&C console in the gap. Traffic key: downlink, rolled by Rotterdam at 07:27',
              'Command key: uplink, and it’s the traffic key shown twice. One key, rotated by you on the TT&C console in the gap',
              'Command key: uplink, rotated by you on the TT&C console. Traffic key: downlink, rotated by you with the same two buttons',
              'Command key: uplink, rolled by Rotterdam on the fleet schedule. Traffic key: downlink, the same; the station follows both',
            ],
            correctIndex: 0,
            explanation:
              'The command key authenticates what goes up, and you rotate it yourself on the TT&C console. The traffic key decrypts what comes down, and Rotterdam rolls it on the fleet schedule, so you follow it by re-keying the payload crypto. That’s two keys with two owners on two schedules, and treating them as one is the tempting mistake.',
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
        'The night shift left RX modem 1 on 1370 MHz, so retune it to the 1414 MHz SAR-1 carrier. Centre the analyzer on the 1389 MHz beacon with a 2 MHz span, and park the tracker where SAR-1 will rise at 07:16: azimuth 22, elevation 5.',
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
      description:
        'SAR-1 rises at 07:16 from azimuth 22. Turn on program-track for MERIDIAN-SAR-1 and confirm its beacon on RX analysis. Keep the transmit chain off, because nothing goes up on this pass.',
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
      description: 'Lock the 1414 MHz carrier, hold C/N above 8 dB through culmination (07:20:47, 27 degrees, 782 km) and confirm the payload decrypts. Don’t send any commands.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar1'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-1',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, signalId: 'MERIDIAN-SAR-1-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
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
              'The order retires KEY-2027-Q1 after this window; a command on it now is a command on a key about to die, and may be rejected',
              'The TT&C console is not configured for SAR-1 today; the TX modem is still on 1405 MHz, and a command on it goes nowhere',
              'The traffic key would reject it; REC-PLAYBACK is a payload command, and the payload crypto rolls at 07:27, before it could act',
              'No reason at all; a Valid key is a Valid key, and REC-PLAYBACK now saves a command on the SAR-2 window, which is the busy one',
            ],
            correctIndex: 0,
            explanation:
              'The console still reads Valid, but that only tells you what the console holds, not what the spacecraft will accept. If the rotation has already begun on the spacecraft side, the command is rejected and logged against you. This window is receive-only by order, not because the station can’t transmit.',
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
      description: 'SAR-1 sets at 07:25:31. Add one line to the rotation record saying this was the last pass on Q1, that it decoded, and that you sent no commands.',
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
              'Last contact on KEY-2027-Q1: decoded, payload decrypting, zero commands sent; the absence of a command is the record',
              'Pass worked on KEY-2027-Q1: decoded at 27 degrees, C/N above 8 dB; the rotation record starts at the rotation itself',
              'The C/N at culmination on KEY-2027-Q1: 27 degrees, 782 km, decoded; the number is the record, the key is a detail',
              'Nothing for this pass: the rotation record starts at Begin on the TT&C console; a receive pass has no COMSEC content',
            ],
            correctIndex: 0,
            explanation:
              'The record needs to show that no command went up, because the order says none may follow this window. The only evidence that you obeyed is a line saying so, written before the key moves. The C/N figure matters less here, because the record is about the key, not the signal.',
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
      description:
        'On the TT&C console, begin the rotation and then complete it. KEY-2027-Q2 must read Valid before the SAR-2 window opens at 07:34:20. Rotate in the gap, because your three minutes start when SAR-1 sets at Galway (07:25:31).',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['log-the-receive-pass'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-pass-phase',
      conditions: [
        {
          type: 'satellite-pass-phase',
          description: 'SAR-1 Pass Over (LOS)',
          params: { noradId: 61701, phase: 'set' },
          mustMaintain: false,
        },
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
              'Been rejected as key-invalid and written into the command history with that reason: a rotation in progress is not a key',
              'Gone up on the old key, which is still loaded until Complete is pressed: the console sends on whatever key it holds',
              'Queued on the console until Complete and then gone up on the new key: the console holds commands through a rotation',
              'Gone up unauthenticated and been executed on the bird as plain text: the spacecraft accepts commands with no key at all',
            ],
            correctIndex: 0,
            explanation:
              'Between Begin and Complete the console holds no valid command key, so the spacecraft rejects anything sent and the console history records why. That rejection is the failure this whole day is built to avoid. The old key still working is the tempting wrong answer, because the console only sends on a key it counts as valid.',
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
      description: 'The fleet traffic key rolls at 07:27. Once it has, read the payload crypto on RX analysis: the traffic key will no longer read Valid.',
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
              'Rotterdam rolled the fleet traffic key and the station did not follow; the fix is the re-key on the TX chain payload panel',
              'Your command rotation broke the traffic key on the console; the fix is to undo it on the TT&C console and rotate again',
              'The spacecraft zeroized its keys when the command key changed; the fix is a KEY-VERIFY under Q2 to reload them on orbit',
              'Nothing moved: Mismatch is the normal reading during a rotation window, and the fix is to wait for the SAR-2 AOS and read again',
            ],
            correctIndex: 0,
            explanation:
              'Rotterdam rolled the traffic key on the fleet schedule, and the station follows it by re-keying the payload crypto. Your command rotation can’t be the cause, because the command key is a separate key and it already reads Valid on Q2. Waiting wouldn’t help either, because the mismatch stays until someone loads the new material.',
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
      description: 'Load the new traffic key on the TX chain payload panel, then confirm both directions read Valid before the SAR-2 window.',
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
        'Set RX modem 1 to the 1370 MHz SAR-2 carrier and centre the analyzer on the 1397 MHz SAR-2 beacon. Then move TX modem 1 from 1405 MHz to 1435 MHz, the SAR-2 telecommand IF (14035 MHz at the BUC). The tracker is still where SAR-1 left it, and program-track will slew it to the 07:34 rise at azimuth 190.',
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
          // On the beacon, as for SAR-1: the acquisition row reads the CW
          // beacon on this frame (phase 27 B2)
          description: 'GW-01 Analyzer Centre 1397 MHz',
          params: { centerFrequency: 1397e6, centerFrequencyTolerance: 100e3 },
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
      description:
        'SAR-2 rises at 07:34 from azimuth 190. Turn on program-track for MERIDIAN-SAR-2 and confirm its beacon on RX analysis. Keep the transmit chain off until the downlink is proven.',
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
        'Lock the 1370 MHz carrier with the transmit chain still off, hold C/N above 8 dB and confirm the payload decrypts under Q2. That proves the traffic key, and it comes before any uplink because a transmitter on the rack would spoil the measurement.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
      conditions: [
        {
          type: 'receiver-signal-locked',
          description: 'GW-01 RX Modem Locked on SAR-2',
          params: { modemNumber: 1, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: false,
        },
        {
          type: 'receiver-snr-threshold',
          description: 'GW-01 C/N Above 8 dB',
          params: { modemNumber: 1, minCNRatio: 8, signalId: 'MERIDIAN-SAR-2-VIDEO', requiresObservation: true, observationTab: 'rx-analysis' },
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
      description:
        'The command window closes at 07:43:05. Turn on uplink Doppler compensation on the TT&C console, then bring the chain up in order: start the carrier into the muted BUC, unmute the BUC, then enable the HPA. You have two minutes.',
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
              'That the spacecraft authenticated a command under Q2 inside the window, and nothing else',
              'That the whole fleet is on Q2 as of this ACK, including the traffic key Rotterdam rolled',
              'That both keys are live on this spacecraft, since one ACK covers the whole link',
              'Only that the uplink reached the bird inside the window, since the ACK doesn’t check the key',
            ],
            correctIndex: 0,
            explanation:
              'The ACK shows that SAR-2 authenticated one command under Q2, so the command key is live on that spacecraft. It says nothing about the traffic key, which the decode proved separately, and nothing about the rest of the fleet, which Rotterdam verifies one spacecraft at a time. That’s why the record needs both proofs.',
            pointPenalty: 5,
            documentSection: 'Activate',
            documentLine:
              'KEY-VERIFY acknowledged {{at:cmd:KEY-VERIFY:ack|07:36}}Z under KEY-2027-Q2 on MERIDIAN-SAR-2, inside the window: the command key is live on orbit. This proves one command on one spacecraft; the traffic key was proved separately by the decode.',
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
      description: 'The proof is done, so take the chain down in the reverse order: disable the HPA output, mute the BUC, then turn the carrier off.',
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
      description: 'Anneke needs the rotation record to show every step with its evidence. Choose the entry that does that.',
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
              'The order acknowledged, the last Q1 contact with zero commands, the rotation, the re-key and the ACK under Q2',
              'KEY-VERIFY acknowledged under Q2 inside the window, with the command history line beside it, as the one proof',
              'The console reading Valid on both keys, on the TX chain and on RX analysis, with the time each one turned Valid',
              'Anneke’s confirmation that the fleet is on Q2, countersigned in the audit log, with the 07:27 fleet notice attached',
            ],
            correctIndex: 0,
            explanation:
              'The correct record is the whole chain: the order in the audit log, the last Q1 contact with zero commands, the command rotation, the traffic re-key with both directions Valid, a decode under Q2 and KEY-VERIFY acknowledged under Q2 inside the window. Any one of those alone is only part of the proof, and a missing link means nobody can vouch for the key.',
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
        "The rotation order is in your audit log. Nothing goes up on the old command key after your 07:16 SAR-1 window. Then you prove the new key on SAR-2 at 07:34 by sending KEY-VERIFY, the test command, inside that window. Please don't send any other commands in between. The traffic key, which decrypts what the satellite sends down, rolls on the fleet schedule at 07:27, in your gap, and your station won't follow it on its own. Please confirm each step back to me."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: getAssetUrl('/assets/campaigns/nats-eu/15/intro.mp3'),
    },
    objectives: {
      'build-the-day-plan': {
        text: `
        <p>
          <em>[Text message from Fiona MacLeod at {{stationTime}}]</em>
        </p>
        <p>
          "I can see the plan, and the Shetland halves are mine. We get fifty-one degrees on SAR-1, then an eleven-degree graze on SAR-2, which is a pass that barely clears our horizon. I'll take the telemetry off the second one and leave the proving to you. I'm not touching a key today, so the uplink is all yours."
        </p>
        `,
        character: Character.FIONA_MACLEOD,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/15/obj-build-the-day-plan.mp3'),
      },
      'rotate-the-command-key': {
        text: `
        <p>
          That's the command key rotated, and I can see Q2 active in the fleet key store. The traffic key is Rotterdam's to move, and it rolls on the fleet schedule in this same gap. Once it has rolled, read the payload crypto before you retune anything, because that tells you whether your station followed.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/15/obj-rotate-the-command-key.mp3'),
      },
      'read-the-traffic-key': {
        text: `
        <p>
          The fleet traffic key rolled at 07:27, as ordered, so your Mismatch is the expected result. Please load the new material on the transmit chain payload panel before your next payload contact, which is SAR-2 in a few minutes.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.NEUTRAL,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/15/obj-read-the-traffic-key.mp3'),
      },
      'prove-the-new-key-on-orbit': {
        text: `
        <p>
          I see the KEY-VERIFY acknowledgement under Q2, so SAR-2 is on the new key and so is Galway. Please safe the uplink first, because the proof is done and there's no reason to leave the transmitter on. Then close your record, and I'll countersign it.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/15/obj-prove-the-new-key-on-orbit.mp3'),
      },
      'close-the-comsec-record': {
        text: `
        <p>
          That's the whole evidence chain: the order, the last pass on Q1, the rotation, the re-key and the proof, each with a time. It's countersigned, and I'll see you at the next quarterly rotation.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: getAssetUrl('/assets/campaigns/nats-eu/15/obj-close-the-comsec-record.mp3'),
      },
    },
  },
};
