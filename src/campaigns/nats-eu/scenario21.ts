import type { GroundStationConfig } from '@app/assets/ground-station/ground-station-state';
import { Character, Emotion } from '@app/modal/character-enum';
import type { ScenarioData } from '@app/ScenarioData';
import type { dBm, MHz } from '@app/types';
import type { Degrees, TleLine1, TleLine2 } from 'ootk';
import { galwayGroundStation, shetlandGroundStation } from './ground-stations';
import { createMeridianSar1, createMeridianSar2, type MeridianTle } from './satellites';

/**
 * nats-eu Scenario 21 - "Knocking on the Door" / Command-Link Intrusion Attempt (Gray Zone arc 5/8)
 *
 * Downlink, uplink, time - and now the key. Wednesday morning, a SAR-2
 * commanding pass with two commands. HK-DUMP goes up and ACKs at 09:25. Ninety
 * seconds later Rotterdam's telemetry shows the bird rejecting three inbound
 * frames with a stale authentication counter, and the station's own crypto
 * unit logs the same three frames: byte-for-byte the HK-DUMP the operator sent,
 * re-transmitted from somewhere that is not this station. A replay. The key is
 * intact - the bird rejected the frames because the counter had moved, which
 * is exactly what the counter is for - and every badge on the station reads
 * Valid. The operator has to call that correctly (replay against an intact
 * key, not a compromise), rotate the key out of cycle on Anneke's order
 * because the adversary now provably holds ciphertext of it, send the second
 * command under the new key, and then answer Priya's question: the retired key
 * and the unit's log - keep them or zeroize them?
 *
 * Phase 18: two decisions. `call-the-knock` is graded on crypto-intact alone
 * (a replay looks like nothing on the station and like everything in the
 * log; the log entries are the evidence, so they are flagged - and therefore
 * no longer an "unacknowledged anomaly" - by the time the call is made). `retain-the-evidence` is the 13.6 lesson with a
 * cost that lands one scenario later: the zeroize branch fires
 * destroyEvidence on the KG-01 unit log, the campaign record remembers it,
 * and S22's attribution report cannot tie the probe to the actor. First
 * shipped use of key-rotation-completed as an incident response rather than
 * a scheduled event, and of the audit log's `command` category as evidence.
 *
 * Clock starts 2027-04-21 09:00:00 UTC. Passes (0 deg horizon, Galway,
 * scripts/author-passes.mjs, epoch 09:00:00Z):
 *
 *   MERIDIAN-SAR-2: AOS T+23.98 (09:23:58Z, az 008), max el 30.6 deg at T+28.74
 *                   (09:28:44Z, 703 km), LOS T+33.45 (09:33:27Z, az 219), 9.5 min,
 *                   southbound. The commanding pass; window 09:24:18 .. 09:33:07
 *                   (T+1458 .. T+1987).
 *   MERIDIAN-SAR-1: AOS T+46.00 (09:46:00Z, az 006), max el 26.2 deg at T+50.77,
 *                   LOS T+55.48 (az 223). In the sky, not tasked.
 *
 * The knock: settings.security events at T+1620 (09:27:00Z) - Rotterdam's
 * monitoring entry and the KG-01 unit log, both anomalies. No RF event, no
 * fault: the station is clean throughout, which is the point.
 *
 * Staged state (scenario-local clone of GW-01): TX modem 1 on 1405 MHz
 * (SAR-1 command IF) - to be retuned to 1435; RX modem 1 on 1414 (SAR-1) - to
 * be retuned to 1370. BUC muted. Command key KEY-2027-Q2 Valid; out-of-cycle set KEY-2027-Q2b
 * staged in the COMSEC store since S19's debrief.
 *
 * NICE Framework Alignment:
 * Primary Codes:
 *   - K0729: Knowledge of cryptographic key management concepts
 *   - S0648: Skill in detecting anomalies
 *   - K0751: Knowledge of system threats
 *
 * Supporting Codes:
 *   - K0874: Knowledge of cryptographic key management
 *   - K0875: Knowledge of key management systems
 *   - S0593: Skill in handling incidents
 *   - K0946: Knowledge of logging and audit practices
 *   - T1567: Configure system hardware, software, peripheral equipment
 *   - S0675: Skill in configuring RF transmit equipment within safe limits
 *   - K1032: Knowledge of satellite-based communication systems
 *   - S0421: Skill in operating communications equipment
 *   - K0645: Knowledge of standard operating procedures
 *   - T1580: Report service status to stakeholders
 *   - K0741: Knowledge of alarm states and their meaning
 *   - T0153: Monitor network capacity and performance
 */

/** MERIDIAN-SAR-2 (61702) at the S21 epoch: the 31 deg commanding pass, southbound from az 008. */
const SAR2_S21_TLE: MeridianTle = {
  tle1: '1 61702U 27015A   27111.37500000  .00001000  00000-0  10000-3 0  9993' as TleLine1,
  tle2: '2 61702  98.4000 142.0000 0010000  90.0000 282.0000 15.61950000123450' as TleLine2,
};

/** MERIDIAN-SAR-1 (61701) at the S21 epoch: a 26 deg pass at 09:46, untasked. */
const SAR1_S21_TLE: MeridianTle = {
  tle1: '1 61701U 27015A   27111.37500000  .00001000  00000-0  10000-3 0  9992' as TleLine1,
  tle2: '2 61701  98.0000 146.2500 0010000  90.0000 196.2500 15.58070000123456' as TleLine2,
};

const meridianSar1S21 = createMeridianSar1(SAR1_S21_TLE);
const meridianSar2S21 = createMeridianSar2(SAR2_S21_TLE);

/** GW-01 as Friday left it: RX on SAR-1's video IF, TX still on SAR-1's command IF, BUC muted. Deep clone, never spread. */
const galwayKnock: GroundStationConfig = structuredClone(galwayGroundStation);
galwayKnock.receivers![0].modems![0] = {
  ...galwayKnock.receivers![0].modems![0],
  frequency: 1414 as MHz,
};
galwayKnock.rfFrontEnds[0].buc = { ...galwayKnock.rfFrontEnds[0].buc, isMuted: true };

export const natsEuScenario21Data: ScenarioData = {
  id: 'nats-eu-scenario21',
  url: 'nats-eu/scenarios/nats-eu-scenario21',
  imageUrl: 'nats/21/card.png',
  number: 21,
  isDisabled: false,
  difficulty: 'advanced',
  prerequisiteScenarioIds: ['nats-eu-scenario20'],
  title: 'Knocking on the Door',
  subtitle: 'Command-Link Intrusion Attempt (Gray Zone 5/8)',
  duration: '40 min',
  missionType: 'Security Operations',
  description: `09:00, Galway, Wednesday. SAR-2 at 09:24 is a commanding pass: a housekeeping dump, then a payload status. The key is KEY-2027-Q2, Valid at both ends; KEY-2027-Q2b has been staged in the store since Friday's debrief.<br><br>They have had the downlink, the uplink and the clock. The only thing on this station they have not touched is the key - and the console will tell you the moment they try, in a log entry that looks like nothing at all.`,
  equipment: [
    'GW-01 Galway: 4m Ku-Band LEO Tracker',
    'Ku-Band RF Front End (13100 MHz LNB LO, 12600 MHz BUC LO) + HPA',
    'TT&C Commanding Console with KG-01 command crypto unit',
    'Security Console (audit log: station, monitoring service, KG-01 unit log)',
    'Spectrum Analyzer',
    'QPSK 3/4 RX Modem with Video Decoder',
  ],
  settings: {
    isSync: true,
    groundStations: [galwayKnock, shetlandGroundStation],
    satellites: [meridianSar1S21, meridianSar2S21],
    isExtraSatellitesVisible: true,
    scenarioStartDate: '2027-04-21',
    scenarioStartWallTime: '09:00:00',

    missionBriefUrl: 'https://docs.signalrange.space/campaign-2/scenario-21?content-only=true&dark=true',

    contactTimeline: {
      horizonHours: 2,
      minElevation: 5 as Degrees,
      showLighting: true,
    },

    timeSkip: {
      leadTimeS: 120,
      minSkipS: 120,
      horizonHours: 1,
    },

    workingDocument: {
      title: 'COMSEC Incident Record CI-2027-0421-GW01',
      description: 'The SAR-2 window of 21 April: what was sent, what came back to the bird from elsewhere, what the key did, what was kept.',
    },

    // M2/M5 - the commanding pass. Window is the SAR-2 pass with 20 s guards.
    // No uplinkFrequencyHz: nothing is jammed today. The knock is in the log.
    commanding: {
      groundStationId: 'GW-01',
      targetNoradId: 61702,
      windowStartS: 1458,
      windowEndS: 1987,
      requireDopplerComp: true,
      requireValidKey: true,
      commands: [
        { id: 'HK-DUMP', label: 'Housekeeping telemetry dump' },
        { id: 'PLD-STATUS', label: 'Payload status request' },
        { id: 'PLD-SAFE', label: 'Payload to safe mode' },
      ],
    },

    // M6 - the log. The knock lands at T+1620 as two entries: Rotterdam's
    // monitoring service sees the bird reject three frames, and KG-01 logs the
    // same three frames as re-sent copies of the operator's own HK-DUMP. The
    // KG-01 entry is the evidence S22 needs; the zeroize branch destroys it.
    security: {
      accounts: [
        { id: 'op-charlie', name: 'C. Brooks', role: 'Site Lead', status: 'active' },
        { id: 'op-duty', name: 'Operator on duty (you)', role: 'Operator', status: 'active' },
        { id: 'op-fiona', name: 'F. MacLeod', role: 'Operator (SH-02)', status: 'active' },
        { id: 'svc-monitor', name: 'Monitoring Service', role: 'Service Account', status: 'active' },
        { id: 'kg-01', name: 'KG-01 command crypto unit', role: 'Equipment', status: 'active' },
        { id: 'svc-legacy', name: 'Telemetry bridge (legacy, decommissioned 14 Jan)', role: 'Service Account', status: 'disabled' },
      ],
      events: [
        {
          id: 'evt-q2b-staged',
          timeS: 0,
          timestampLabel: '16 Apr 22:10 UTC',
          actor: 'op-charlie',
          action: 'Command key KEY-2027-Q2b staged to COMSEC store (inactive, out-of-cycle spare)',
          category: 'command',
          severity: 'info',
        },
        {
          id: 'evt-ti-closed',
          timeS: 0,
          timestampLabel: '19 Apr 06:02 UTC',
          actor: 'op-duty',
          action: 'Timing incident TI-2027-0419-GW01 closed; frozen offset issued to Rotterdam',
          category: 'config',
          severity: 'info',
        },
        { id: 'evt-login-duty', timeS: 0, timestampLabel: '08:55 UTC', actor: 'op-duty', action: 'Console login', category: 'auth', severity: 'info' },
        { id: 'evt-svc-poll-0900', timeS: 0, timestampLabel: '09:00 UTC', actor: 'svc-monitor', action: 'Telemetry poll', category: 'config', severity: 'info' },
        {
          id: 'evt-rotterdam-counter',
          timeS: 1620,
          timestampLabel: '09:27 UTC',
          actor: 'svc-monitor',
          action: 'SAR-2 telemetry: 3 inbound TT&C frames rejected at the spacecraft - authentication counter stale (09:26:41-09:26:55)',
          category: 'command',
          severity: 'warning',
          isAnomaly: true,
        },
        {
          id: 'evt-kg-replay-log',
          timeS: 1632,
          timestampLabel: '09:27 UTC',
          actor: 'kg-01',
          action: 'KG-01 unit log: 3 frames observed on the return matching command traffic sent 09:25 (HK-DUMP), counter 0x2F13 stale, source not this station',
          category: 'command',
          severity: 'warning',
          isAnomaly: true,
        },
      ],
    },
  },
  objectives: [
    {
      id: 'review-mission-brief',
      nice: ['K0645', 'K0729'],
      title: 'Read the Brief',
      description:
        'Open the shift brief: two commands in the SAR-2 window, the key that is live and the one that is staged, and what the authentication counter does when a frame arrives twice.',
      groundStation: 'GW-01',
      freezesScenarioTimer: true,
      prerequisiteObjectiveIds: [],
      conditions: [
        {
          type: 'mission-brief-opened',
          description: 'Brief Reviewed',
          params: { boxId: 'mission-brief' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Counter Understood',
          params: {
            character: Character.SYSTEM,
            question: 'A command frame the station sent is captured and sent again to the bird a minute later, unchanged. What happens?',
            options: [
              'The bird rejects it: every authenticated frame carries a counter, the counter has moved on, and a stale counter fails authentication even though the key and the ciphertext are genuine',
              'The bird executes it again: the frame is genuine, correctly encrypted under the live key, and the bird has no way to know it is a copy',
              'The bird rejects it because the Doppler is wrong: a frame sent from elsewhere arrives off-frequency and never demodulates',
              'The station rejects it: KG-01 sees its own frame come back on the return and blocks the uplink until the key is rotated',
            ],
            correctIndex: 0,
            explanation:
              'That is what the counter is for. A replay proves the adversary can capture and re-transmit your command traffic; it does not prove they can read it or make their own. The bird says no, and both ends log that it said no. Twenty-four minutes to AOS.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'dashboard-sweep',
      nice: ['T0153', 'K0741'],
      title: 'GW-01 Dashboard Sweep',
      description: 'Board read. Confirm the active alarm state on GW-01 before the uplink goes anywhere near the air.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['review-mission-brief'],
      timeLimitSeconds: 90,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tab-active',
          hidden: true,
          description: 'Dashboard Open',
          params: { tab: 'dashboard' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Alarm State Confirmed',
          params: {
            character: Character.SYSTEM,
            question: 'What is the active alarm state on GW-01 at 09:00?',
            options: [
              'RX AGC at max gain - weak signal on an empty sky, no hardware alarm',
              'No active alarms - all systems nominal, board clear for the pass',
              'COMSEC alarm - a spare key staged in the store is flagged until it is either loaded or destroyed',
              'BUC muted alarm - the uplink is inhibited and the board wants it cleared',
            ],
            correctIndex: 0,
            explanation:
              'Empty sky, not a fault. A staged spare is what a store is for, and a muted BUC is correct for a station with nothing to send yet. The board will read exactly like this at 09:27 too.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'key-baseline',
      nice: ['K0874', 'T0431'],
      title: 'Key Baseline',
      description: 'Command key Valid on the TX chain, traffic key Valid on the receive side. Read both now; both will still read Valid at 09:27, and that is the whole problem.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['dashboard-sweep'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-key-status',
          description: 'Command Key Valid (TX Chain)',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: true,
        },
        {
          type: 'rx-key-status',
          description: 'Traffic Key Valid (RX Analysis)',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'rx-analysis' },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'audit-baseline',
      nice: ['K0946', 'K0645'],
      title: 'Read the Log Before the Pass',
      description: 'Security console: sign off the log as it stands at 09:00, so that anything that appears during the window is new by definition.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['key-baseline'],
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
          description: 'Log Signed Off at 09:00',
          params: {},
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Baseline Read',
          params: {
            character: Character.SYSTEM,
            question: 'What does the log hold at 09:00 that matters for this window?',
            options: [
              'KEY-2027-Q2b staged as an inactive spare on the 16th, the timing incident closed on the 19th, a login and a poll - nothing anomalous, and nothing from KG-01 at all',
              'An unacknowledged KG-01 entry from overnight - the unit has been rejecting frames since 03:00 and nobody flagged it',
              'The spare key was loaded, not staged - Charlie activated Q2b on the 16th and the console is already on it',
              'A svc-legacy login at 08:40 - the decommissioned bridge is answering again',
            ],
            correctIndex: 0,
            explanation:
              'Quiet, and signed off as quiet. KG-01 writes to this log only when it has something to say, which it has not yet. The value of the sign-off is that the next KG-01 line cannot be mistaken for background.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'arm-the-uplink',
      nice: ['S0421', 'K0773', 'T1567'],
      title: 'Arm the Uplink',
      description:
        "TX modem 1 is on SAR-1's 1405 MHz command IF. Retune it for SAR-2's 14035 MHz TT&C uplink through the 12600 MHz BUC LO, and engage uplink Doppler compensation on the TT&C console before the window opens at 09:24:18.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['audit-baseline'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'tx-modem-frequency-set',
          description: 'TX 1435 MHz',
          params: { modemNumber: 1, frequency: 1435e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'uplink-doppler-comp-enabled',
          description: 'Uplink Doppler Compensation Engaged',
          params: {},
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'rx-chain-ready',
      nice: ['S0421', 'K0773'],
      title: 'Set Up the Receiver for SAR-2',
      description: 'Retune RX modem 1 to 1370 MHz and frame the analyzer on 1370 with a 40 MHz span. The return is where the bird tells you what it heard.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['arm-the-uplink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'rx-modem-frequency-set',
          description: 'RX 1370 MHz',
          params: { modemNumber: 1, frequency: 1370e6, frequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-center-frequency',
          description: 'Analyzer Centre 1370 MHz',
          params: { centerFrequency: 1370e6, centerFrequencyTolerance: 100e3 },
          mustMaintain: true,
        },
        {
          type: 'speca-span-set',
          description: 'Analyzer Span 40 MHz',
          params: { span: 40e6, frequencyTolerance: 5e6 },
          mustMaintain: true,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'preposition-for-aos',
      nice: ['S0421', 'K1032'],
      title: 'Pre-position for AOS',
      description: 'AOS 09:23:58 from azimuth 008, southbound. Park the tracker on the rise azimuth at 5 degrees.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rx-chain-ready'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'antenna-position',
          description: 'Parked on Az 008 / El 5',
          params: { azimuth: 8, elevation: 5, tolerance: 3 },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 5,
    },
    {
      id: 'acquire-sar2',
      nice: ['S0421', 'K1032'],
      title: 'Acquire MERIDIAN-SAR-2',
      description: 'Program-track SAR-2 before 09:24 and confirm the 1397 MHz beacon on RX analysis. The chain stays cold until she is locked.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['preposition-for-aos'],
      conditions: [
        {
          type: 'antenna-tracking-mode-set',
          description: 'Program-Track Enabled',
          params: { trackingMode: 'program-track' },
          mustMaintain: true,
        },
        {
          type: 'antenna-locked',
          description: 'Tracking SAR-2',
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
      points: 15,
    },
    {
      id: 'chain-up',
      nice: ['S0675', 'S0421', 'K0645'],
      title: 'Chain Up in Order',
      description: 'Window open at 09:24:18. Carrier into the muted BUC, unmute, HPA. Two minutes.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['acquire-sar2'],
      timeLimitSeconds: 2 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
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
      id: 'first-command',
      nice: ['T1567', 'K1032'],
      title: 'Housekeeping Dump',
      description: 'Send HK-DUMP and confirm the acknowledgement. Note the time: the frame you just sent is about to come back.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['chain-up'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'HK-DUMP Acknowledged',
          params: { commandId: 'HK-DUMP' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'ACK Read',
          params: {
            character: Character.SYSTEM,
            question: 'HK-DUMP ACKed at 09:25 under KEY-2027-Q2. Who, apart from the bird, could now hold a copy of that frame?',
            options: [
              'Anyone with a receiver under the uplink footprint or on the transponded return: the frame is encrypted, so they cannot read it, but they can record it',
              'Nobody: an authenticated frame is bound to this station and the bird discards anything that did not originate here',
              'Rotterdam only: the frame is mirrored to constellation ops over the ground network, not over the air',
              'Anyone who has the key: without KEY-2027-Q2 the frame is not even detectable as a command',
            ],
            correctIndex: 0,
            explanation:
              'Encryption hides the content, not the transmission. A frame on the air can be captured by anyone under it, and the transponder repeats your uplink to everyone under the downlink. That is why the counter exists - and why what happens next is not a surprise.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'spot-the-knock',
      nice: ['S0648', 'K0946'],
      title: 'Spot the Knock',
      description:
        "09:27. Two new lines in the log: Rotterdam's monitoring service and KG-01, ninety seconds after your ACK. Flag the monitoring entry first and read what the bird did.",
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['first-command'],
      conditions: [
        {
          type: 'security-event-acknowledged',
          description: 'Counter-Reject Entry Flagged',
          params: { eventId: 'evt-rotterdam-counter' },
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Reject Read',
          params: {
            character: Character.SYSTEM,
            question: 'Three inbound frames rejected at the spacecraft with a stale authentication counter, 09:26:41 to 09:26:55. What does that entry tell you?',
            options: [
              'Someone sent the bird command frames that authenticated under the live key but carried a counter the bird had already passed - genuine ciphertext, re-sent. The bird refused all three',
              'The command key is out of step between the station and the bird - a counter mismatch is the first sign of a key rotation that only happened at one end',
              "Three of the station's own frames were garbled by Doppler and re-sent by the console automatically, and the bird refused the retries",
              "The monitoring service has a clock error - a counter is a timestamp, and Rotterdam's reference is still carrying the 19 April offset",
            ],
            correctIndex: 0,
            explanation:
              'Your one HK-DUMP ACKed at 09:25. Three more arrived at the bird that you did not send, under your key, and the bird threw them out because their counter was old. That is a replay. The key worked exactly as designed at both ends.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 10,
    },
    {
      id: 'call-the-knock',
      nice: ['S0648', 'K0751', 'K0729'],
      title: 'Call the Knock',
      description:
        'Read the command key on the TX chain and flag the KG-01 unit log on the Security console - the unit saw the same three frames and knows they were yours. Then call it: what is this, and what does the key need?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['spot-the-knock'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'key-seen',
          type: 'tx-key-status',
          description: 'Command key read on TX Chain',
          params: { keyStatus: 'Valid', requiresObservation: true, observationTab: 'tx-chain' },
          mustMaintain: false,
        },
        {
          id: 'unit-log-flagged',
          type: 'security-event-acknowledged',
          description: 'KG-01 unit log flagged on the Security console',
          params: { eventId: 'evt-kg-replay-log', requiresObservation: true, observationTab: 'security-console' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'What the Knock Is',
          params: {
            character: Character.ANNEKE_VISSER,
            prompt:
              'Three of your frames came back at my bird from somewhere else and it refused them. Your key reads Valid at my end. Window is open for six more minutes and you owe me a PLD-STATUS. What is this, and what do you want to do with the key?',
            evidence: ['key-seen', 'unit-log-flagged'],
            decisionOptions: [
              {
                label:
                  'A replay against an intact key - the bird rejected it. Keep the log, rotate to Q2b out of cycle because they hold ciphertext of Q2, and send PLD-STATUS under the new key',
                correctWhen: { fact: 'crypto-intact', is: true },
                consequence: { log: 'Replay against intact command key called; out-of-cycle rotation to KEY-2027-Q2b requested at both ends' },
              },
              {
                label: 'Key compromised - zeroize KEY-2027-Q2 on KG-01 now and hold commanding until Rotterdam re-keys the bird',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: {
                  destroyEvidence: { auditEventId: 'evt-kg-replay-log' },
                  log: 'Command key zeroized on KG-01 with the key intact; unit log cleared with it',
                },
                feedback:
                  "Nothing about the key failed: the bird rejected the frames because the counter had moved, which is the key working. Zeroize is for a key you believe is in someone else's hands. It also wipes the unit, and KG-01's log of what it saw goes with it - the only record on this station of where those frames came from.",
              },
              {
                label: 'Our own retries - the console re-sent HK-DUMP on a Doppler miss. Nothing to do; send PLD-STATUS',
                feedback:
                  'The console sends once and logs once; there is one HK-DUMP in its history and one ACK. KG-01 says the three frames arrived on the return from a source that is not this station. Sending the next command on the same key hands them another frame to keep.',
              },
              {
                label: "A counter desync after the timing incident - Rotterdam's reference still carries the 19 April offset. Ask them to resync and resend",
                feedback:
                  'A counter is not a clock; it does not care what time it is. Your own HK-DUMP authenticated a minute earlier on the same counter chain. The offset was corrected on the 19th and the log says so.',
              },
            ],
            explanation:
              'Every badge on the station says Valid because the key is valid. The evidence is in two log entries: the bird said no to frames it should never have seen, and KG-01 recognised them as yours. A replay proves capture, not compromise - so the answer is proportionate: keep the record, rotate the key they have been recording, carry on.',
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'rotate-on-order',
      nice: ['K0874', 'K0875', 'T1567'],
      title: 'Rotate Out of Cycle',
      description:
        'Anneke has keyed SAR-2 to KEY-2027-Q2b. TT&C console: begin the rotation, confirm it, and read Valid before you send anything else. Two minutes of the window go to this.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['call-the-knock'],
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
          description: 'Command Key Rotated to KEY-2027-Q2b',
          params: {},
          mustMaintain: true,
        },
        {
          type: 'status-check',
          description: 'Rotation Reasoned',
          params: {
            character: Character.SYSTEM,
            question: 'Why rotate a key that was never compromised?',
            options: [
              'Because they hold recorded traffic under it: every frame captured under Q2 is a frame they can try again, and a key that has been recorded is a key you stop using - rotation bounds the exposure without destroying anything',
              'Because the counter is exhausted: three stale rejects push the authentication counter past its limit and the key cannot sign another frame',
              'Because Rotterdam requires it: any anomaly on the command link triggers a mandatory rotation regardless of cause',
              'It should not be rotated - a rotation under pressure is how a good key gets replaced by one loaded wrong',
            ],
            correctIndex: 0,
            explanation:
              'The key is fine; its history is not. Rotation retires the traffic they recorded and costs two minutes of window. Zeroize would have cost the key, the unit and the evidence. Proportionate response is the whole skill.',
            pointPenalty: 5,
            documentSection: 'Rotation',
            documentLine:
              'Called replay against intact KEY-2027-Q2 09:28. Out-of-cycle rotation to KEY-2027-Q2b ordered by Rotterdam; SAR-2 keyed 09:28, GW-01 rotation begun and confirmed on the TT&C console, key Valid 09:29. Q2 retired, not zeroized.',
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'second-command',
      nice: ['T1567', 'K1032'],
      title: 'Payload Status Under the New Key',
      description: 'Send PLD-STATUS under KEY-2027-Q2b and confirm the ACK before the window closes at 09:33:07.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['rotate-on-order'],
      conditions: [
        {
          type: 'command-acknowledged',
          description: 'PLD-STATUS Acknowledged',
          params: { commandId: 'PLD-STATUS' },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'New Key Read',
          params: {
            character: Character.SYSTEM,
            question: 'PLD-STATUS ACKed under Q2b. If the three recorded frames are sent to the bird again tomorrow, what happens?',
            options: [
              'They fail twice over: the counter is stale and the key they were encrypted under is no longer loaded on the bird. What they recorded is now worth nothing',
              'They still authenticate: a recorded frame carries its own key material, so a rotation does not touch frames captured before it',
              'The bird executes them: Q2b re-based the counter, so the old counter values are fresh again',
              'They cannot be sent at all: rotation changes the uplink frequency and the recorded frames are on the old carrier',
            ],
            correctIndex: 0,
            explanation:
              'Two locks on the same door. The counter would have held on its own; the rotation makes their recording useless even if it did not. That is what the two minutes bought.',
            pointPenalty: 5,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 15,
    },
    {
      id: 'safe-the-uplink',
      nice: ['S0421', 'K0645'],
      title: 'Safe the Uplink',
      description: 'LOS 09:33:27. Chain down in the mirror order: HPA output off, BUC muted, carrier off.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['second-command'],
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
      id: 'retain-the-evidence',
      nice: ['S0593', 'K0946', 'K0876'],
      title: 'Retain or Zeroize',
      description:
        'Priya is on the line about KEY-2027-Q2 and the KG-01 unit log. Re-read the unit log entry on the Security console, then answer her: what happens to the retired key and the record of what it saw?',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['safe-the-uplink'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          id: 'unit-log-reread',
          type: 'security-event-acknowledged',
          description: 'KG-01 unit log re-read on the Security console',
          params: { eventId: 'evt-kg-replay-log', requiresObservation: true, observationTab: 'security-console' },
          mustMaintain: false,
        },
        {
          type: 'decision',
          description: 'The Retired Key and the Unit Log',
          params: {
            character: Character.PRIYA_SHARMA,
            prompt:
              'Q2 is retired and Q2b is live. The unit that held Q2 still has its log of the three frames - the only record anywhere of what came back and when. Some sites zeroize a probed key on principle. What do you want done with Q2 and with that log?',
            evidence: ['unit-log-reread'],
            decisionOptions: [
              {
                label: 'Retain both under seal for CSIRT: the retired key is out of service, and the KG-01 log is the evidence that ties these frames to the actor',
                correctWhen: { fact: 'crypto-intact', is: true },
                consequence: { log: 'KEY-2027-Q2 and the KG-01 unit log retained under seal for Group CSIRT' },
              },
              {
                label: 'Zeroize Q2 on the unit - a probed key should not exist, whatever the log says',
                correctWhen: { fact: 'crypto-intact', is: false },
                consequence: {
                  destroyEvidence: { auditEventId: 'evt-kg-replay-log' },
                  pointDelta: 5,
                  log: 'KEY-2027-Q2 zeroized on KG-01 after rotation; unit log cleared with it',
                },
                feedback:
                  "Zeroize clears the unit, and the unit is where the log lives. The key was already out of service; what you destroyed was the only record of the frames' source and timing. When Priya writes the attribution report, that line will be missing.",
              },
              {
                label: 'Zeroize the live key as well and hold commanding until Rotterdam issues a fresh set',
                feedback:
                  'Q2b has never been on the air and was never recorded. Zeroizing it hands them a commanding outage they did not have to work for, and clears the unit log in the process.',
              },
              {
                label: 'Nothing further - the rotation closed the matter and the log rolls over on its own',
                feedback:
                  'The rotation closed the exposure, not the incident. A unit log rolls over; a record under seal does not. Priya asked because the answer is not "nothing".',
              },
            ],
            explanation:
              "What to reset and what to capture first. The retired key is harmless in the store and useful in a report; the unit log is the one artefact that says where the frames came from. Zeroize is for a key in someone else's hands. This one was only in their recorder.",
            pointPenalty: 10,
          },
          mustMaintain: false,
        },
      ],
      conditionLogic: 'AND',
      points: 20,
    },
    {
      id: 'close-and-debrief',
      nice: ['T1580', 'K0645', 'K0729'],
      title: 'Report the COMSEC Incident',
      description: 'File the COMSEC incident: what was replayed, what the key did, what was rotated, what was kept. Then the line that changes the next commanding pass.',
      groundStation: 'GW-01',
      prerequisiteObjectiveIds: ['retain-the-evidence'],
      timeLimitSeconds: 3 * 60,
      timerStartTrigger: 'on-activate',
      conditions: [
        {
          type: 'status-check',
          description: 'Incident Filed',
          params: {
            character: Character.SYSTEM,
            question: 'Which line goes in the COMSEC incident report?',
            options: [
              '09:25 HK-DUMP ACK under Q2. 09:26:41-55 three frames matching HK-DUMP rejected at SAR-2, counter stale, source not GW-01 (KG-01 log). Called replay, key intact. Rotated to Q2b both ends 09:29; PLD-STATUS ACK under Q2b. Q2 and KG-01 log retained under seal',
              'Command key compromised during the SAR-2 window; emergency rotation performed; adversary now holds Q2 and the station is operating on a spare',
              'Intermittent command rejects on SAR-2 traced to a counter error; resolved by a key rotation; no further action',
              'Attempted intrusion on the command link defeated by cryptographic authentication; the adversary has escalated to active attack on the constellation',
            ],
            correctIndex: 0,
            explanation:
              'Times, what was sent, what came back, what the key did, what was done, what was kept. "Compromised" is wrong and "resolved" is a conclusion; the report carries the counter state and the KG-01 line, because those are what the next reader needs.',
            pointPenalty: 5,
            documentSection: 'Report',
            documentLine:
              'COMSEC incident CI-2027-0421-GW01: replay of GW-01 command traffic at SAR-2 09:26:41-55Z, three frames, counter stale, rejected at spacecraft; source not this station per KG-01. Key intact throughout. Rotated Q2 to Q2b out of cycle 09:29; PLD-STATUS ACK under Q2b 09:31. Q2 and KG-01 unit log retained under seal for Group CSIRT.',
          },
          mustMaintain: false,
        },
        {
          type: 'status-check',
          description: 'Debrief Line',
          params: {
            character: Character.SYSTEM,
            question: 'What is the debrief line?',
            options: [
              'Every command frame on the air is a frame they can keep: a key used in a contested window is rotated after it, the spare is always staged, and a unit log is evidence before it is a nuisance',
              'Commanding passes stop until the source of the replay is found: the key is not safe while someone is recording it',
              'Zeroize on every anomaly from now on: the two minutes a rotation costs are two minutes a compromised key stays live',
              'Doppler compensation is disabled for commanding: a replayed frame sent from elsewhere arrives off-frequency, so the bird will not hear it',
            ],
            correctIndex: 0,
            explanation:
              "Recorded traffic is the threat, not the key. Stage the spare, rotate after a contested window, and treat the unit's log as something you will be asked for. Four inputs probed in eight days; the report is now a pattern, and that is Priya's next shift.",
            pointPenalty: 5,
            documentSection: 'Debrief',
            documentLine:
              'Closed 09:52Z. Open: source of replayed frames (referred to Group CSIRT; KG-01 log and Q2 sealed). Debrief: command key rotated after any contested window; spare key staged before every commanding pass; KG-01 unit log exported to the incident record on any counter reject.',
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
        <em>[Text message from Anneke Visser at 08:40]</em>
      </p>
      <p>
        "SAR-2 at 09:24 is commanding: HK-DUMP, then PLD-STATUS, both under KEY-2027-Q2. Q2b is in your store and on my shelf - staged, not loaded, since Friday. I watch the bird's command counter on every pass now. If it rejects anything I did not see you send, you will hear from me inside a minute."
      </p>
      `,
      character: Character.ANNEKE_VISSER,
      emotion: Emotion.NEUTRAL,
      audioUrl: '',
    },
    objectives: {
      'first-command': {
        text: `
        <p>
          HK-DUMP acknowledged 09:25, counter 0x2F13. Payload status when you are ready.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'spot-the-knock': {
        text: `
        <p>
          It is me. The bird just refused three frames - stale counter, all three inside fifteen seconds, and I did not see you send any of them. Your key reads Valid here. Look at your unit log before you tell me what it is.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONCERNED,
        audioUrl: '',
      },
      'call-the-knock': {
        text: `
        <p>
          Replay. Agreed. I am keying SAR-2 to Q2b now - done. Begin your rotation, confirm it, and send me the payload status under the new key. Do not touch the unit log.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'second-command': {
        text: `
        <p>
          PLD-STATUS acknowledged 09:31 under Q2b. Whatever they recorded this morning is a recording of a key that no longer exists on my bird. Chain down at LOS; Priya wants a word about the old one.
        </p>
        `,
        character: Character.ANNEKE_VISSER,
        emotion: Emotion.HAPPY,
        audioUrl: '',
      },
      'retain-the-evidence': {
        text: `
        <p>
          Good. Seal the key and export the unit log to the record exactly as it reads - do not tidy it. Tomorrow I am going to put four incidents side by side, and that KG-01 line is the one that names the actor.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.CONFIDENT,
        audioUrl: '',
      },
      'close-and-debrief': {
        text: `
        <p>
          Downlink, uplink, time, key. Someone has now tried every input this station has, one at a time, and written you a log entry each time they did. Tomorrow we read them together. Bring the record.
        </p>
        `,
        character: Character.PRIYA_SHARMA,
        emotion: Emotion.NEUTRAL,
        audioUrl: '',
      },
    },
  },
};
